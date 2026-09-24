import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import dotenv from 'dotenv';
import { defaultAdapterRegistry } from './adapters/AdapterRegistry.js';
import { DownloadEngine } from './download/DownloadEngine.js';
import { defaultHistoryStore } from './storage/HistoryStore.js';
import { validateUrlSafety, SsrfBlockedError } from './security/ssrfGuard.js';
import { PlatformError, UnsupportedPlatformError, PlatformPolicyError } from './adapters/PlatformAdapter.js';

dotenv.config();

// Ensure local bundled bin directory and WinGet packages are on PATH
if (process.platform === 'win32') {
  const possibleBinDirs = [
    path.resolve(process.cwd(), 'bin'),
    path.dirname(process.execPath),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin')
  ];
  for (const b of possibleBinDirs) {
    if (fs.existsSync(b)) {
      process.env.PATH = `${b};${process.env.PATH}`;
    }
  }

  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'AppData', 'Local');
  const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(wingetPackages)) {
    try {
      const subdirs = fs.readdirSync(wingetPackages, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(wingetPackages, d.name));
      for (const s of subdirs) {
        process.env.PATH = `${s};${path.join(s, 'bin')};${process.env.PATH}`;
      }
    } catch {}
  }
}

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';

const APP_VERSION = '1.1.0';

// Config persistence in %LOCALAPPDATA%\MediaFlow\config.json
const CONFIG_DIR = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'AppData', 'Local'), 'MediaFlow')
  : path.resolve('./');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function loadPersistedSettings(): { downloadDir?: string } {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch {}
  return {};
}

function savePersistedSettings(settings: { downloadDir?: string }) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const current = loadPersistedSettings();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...settings }, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Settings] Failed to save config.json:', err);
  }
}

// Default to user's real Windows Downloads folder if available
const userDownloads = process.platform === 'win32' && process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, 'Downloads')
  : path.resolve('./downloads');
const persistedSettings = loadPersistedSettings();
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || persistedSettings.downloadDir || userDownloads;

try {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }
} catch {
  // fallback if permissions issue
}

const MAX_BYTES = Number.parseInt(process.env.MAX_DOWNLOAD_SIZE_BYTES || '2147483648', 10);
const downloadEngine = new DownloadEngine(DOWNLOAD_DIR, MAX_BYTES);

app.use(cors());
app.use(express.json());

// Request logging (sanitized, zero credentials/tokens)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.url.startsWith('/api/download/progress')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// 1. Get platform adapters status and policy notes
app.get('/api/platforms', (_req, res) => {
  const platforms = defaultAdapterRegistry.getAllAdapters();
  res.json({ platforms });
});

// 2. Inspect media URL
const InspectSchema = z.object({
  url: z.string().url('A valid HTTP or HTTPS URL is required')
});

app.post('/api/media/inspect', async (req, res) => {
  try {
    const parseResult = InspectSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message || 'Invalid input URL' });
      return;
    }

    const { url } = parseResult.data;
    const validatedUrl = await validateUrlSafety(url);

    const adapter = defaultAdapterRegistry.getAdapter(validatedUrl);
    if (!adapter) {
      throw new UnsupportedPlatformError(url);
    }

    const metadata = await adapter.getMetadata(validatedUrl);
    res.json(metadata);
  } catch (err: any) {
    if (err instanceof SsrfBlockedError) {
      res.status(403).json({ error: err.message, code: 'SSRF_BLOCKED' });
      return;
    }
    if (err instanceof UnsupportedPlatformError) {
      res.status(400).json({
        error: `The provided URL belongs to an unsupported or unrecognized platform.`,
        code: 'UNSUPPORTED_PLATFORM',
        details: err.message
      });
      return;
    }
    if (err instanceof PlatformPolicyError) {
      res.status(403).json({ error: err.message, code: 'POLICY_RESTRICTION' });
      return;
    }
    if (err instanceof PlatformError) {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }

    console.error('Inspect error:', err);
    res.status(500).json({ error: 'Failed to inspect media URL. Please verify the URL is public and try again.' });
  }
});

// 3. Start streaming download
const StartDownloadSchema = z.object({
  url: z.string().url(),
  formatId: z.string().min(1),
  customTitle: z.string().optional(),
  destinationDir: z.string().optional()
});

app.post('/api/download/start', async (req, res) => {
  try {
    const parseResult = StartDownloadSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Missing required parameters (url, formatId)' });
      return;
    }

    const { url, formatId, customTitle, destinationDir } = parseResult.data;
    if (destinationDir && typeof destinationDir === 'string' && destinationDir.trim().length > 0) {
      const resolvedTarget = path.resolve(destinationDir.trim());
      if (!fs.existsSync(resolvedTarget)) {
        try { fs.mkdirSync(resolvedTarget, { recursive: true }); } catch {}
      }
      downloadEngine.setDownloadDir(resolvedTarget);
    }
    const validatedUrl = await validateUrlSafety(url);

    const adapter = defaultAdapterRegistry.getAdapter(validatedUrl);
    if (!adapter) {
      throw new UnsupportedPlatformError(url);
    }

    if (!adapter.isDownloadPermitted) {
      throw new PlatformPolicyError(adapter.policyNote);
    }

    const metadata = await adapter.getMetadata(validatedUrl);
    const streamUrl = await adapter.getStreamUrl(validatedUrl, formatId);
    const selectedFormat = metadata.formats.find(f => f.id === formatId) || metadata.formats[0];

    const container = selectedFormat?.container || 'mp4';
    const rawTitle = customTitle || metadata.title || 'video';
    const expectedSizeBytes = selectedFormat?.filesize;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const isExtractorStream = streamUrl.startsWith('extractor:');

    // Async download execution
    const downloadPromise = isExtractorStream
      ? downloadEngine.startExtractorDownload(
          jobId,
          url,
          formatId,
          rawTitle,
          container,
          expectedSizeBytes
        )
      : downloadEngine.startDownload(
          jobId,
          streamUrl,
          rawTitle,
          container
        );

    downloadPromise.then((finalPath) => {
      const stats = fs.existsSync(finalPath) ? fs.statSync(finalPath) : { size: 0 };
      defaultHistoryStore.add({
        url,
        title: rawTitle,
        platform: metadata.platform || adapter.name,
        filename: path.basename(finalPath),
        fileSizeBytes: stats.size,
        completedAt: new Date().toISOString(),
        status: 'completed'
      });
    }).catch((err) => {
      console.warn(`Job ${jobId} ended with: ${err.message}`);
      defaultHistoryStore.add({
        url,
        title: rawTitle,
        platform: metadata.platform || adapter.name,
        filename: `${rawTitle}.${container}`,
        fileSizeBytes: 0,
        completedAt: new Date().toISOString(),
        status: err.name === 'AbortError' ? 'cancelled' : 'failed'
      });
    });

    res.json({
      jobId,
      status: 'downloading',
      stage: 'initializing',
      title: rawTitle,
      format: selectedFormat?.label || container,
      expectedSizeBytes
    });
  } catch (err: any) {
    if (err instanceof SsrfBlockedError) {
      res.status(403).json({ error: err.message, code: 'SSRF_BLOCKED' });
      return;
    }
    if (err instanceof PlatformPolicyError) {
      res.status(403).json({ error: err.message, code: 'POLICY_RESTRICTION' });
      return;
    }
    console.error('Start download error:', err);
    res.status(500).json({ error: err.message || 'Failed to start download' });
  }
});

// 4. Progress Polling endpoint
app.get('/api/download/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const progress = downloadEngine.getProgress(jobId);
  if (!progress) {
    res.status(404).json({ error: `Job "${jobId}" not found or expired` });
    return;
  }
  res.json(progress);
});

// 5. Cancel download
app.post('/api/download/cancel/:jobId', (req, res) => {
  const { jobId } = req.params;
  const success = downloadEngine.cancelDownload(jobId);
  if (success) {
    res.json({ success: true, message: 'Download cancelled and temporary files cleaned up.' });
  } else {
    res.status(400).json({ error: 'Job was not found or is no longer downloading.' });
  }
});

// 6. Download History
app.get('/api/history', (_req, res) => {
  res.json({ history: defaultHistoryStore.getAll() });
});

app.delete('/api/history', (_req, res) => {
  defaultHistoryStore.clear();
  res.json({ success: true });
});

// 7. Settings & Environment info
app.get('/api/settings', (_req, res) => {
  res.json({
    downloadDir: downloadEngine.getDownloadDir(),
    maxDownloadSizeBytes: downloadEngine.getMaxSizeBytes(),
    version: APP_VERSION
  });
});

app.post('/api/settings', (req, res) => {
  try {
    const { downloadDir } = req.body;
    if (typeof downloadDir === 'string' && downloadDir.trim().length > 0) {
      const resolved = path.resolve(downloadDir.trim());
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
      downloadEngine.setDownloadDir(resolved);
      savePersistedSettings({ downloadDir: resolved });
      res.json({
        success: true,
        settings: {
          downloadDir: downloadEngine.getDownloadDir(),
          maxDownloadSizeBytes: downloadEngine.getMaxSizeBytes(),
          version: APP_VERSION
        }
      });
      return;
    }
    res.status(400).json({ error: 'Valid download directory path is required' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to update download directory: ${err.message}` });
  }
});

// Native folder picker for choosing download destination
app.post('/api/settings/browse-folder', async (_req, res) => {
  if (process.platform === 'win32') {
    try {
      const { exec } = await import('node:child_process');
      const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select MediaFlow Download Folder'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"`;
      
      exec(psCommand, (err, stdout) => {
        if (err || !stdout || stdout.trim().length === 0) {
          // User cancelled or dialog failed
          res.json({ selectedDir: null, currentDir: downloadEngine.getDownloadDir() });
          return;
        }
        const selected = stdout.trim();
        if (fs.existsSync(selected)) {
          downloadEngine.setDownloadDir(selected);
          savePersistedSettings({ downloadDir: selected });
          res.json({ selectedDir: selected, currentDir: selected });
        } else {
          res.json({ selectedDir: null, currentDir: downloadEngine.getDownloadDir() });
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: `Could not open folder picker: ${err.message}` });
    }
  } else {
    res.json({ selectedDir: null, currentDir: downloadEngine.getDownloadDir(), message: 'Folder picker dialog available on Windows' });
  }
});

// Open download folder directly in Windows File Explorer
app.post('/api/settings/open-folder', async (req, res) => {
  try {
    const targetDir = req.body?.folder || downloadEngine.getDownloadDir();
    const resolved = path.resolve(targetDir);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }

    const { exec } = await import('node:child_process');
    if (process.platform === 'win32') {
      exec(`explorer.exe "${resolved}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${resolved}"`);
    } else {
      exec(`xdg-open "${resolved}"`);
    }
    res.json({ success: true, openedPath: resolved });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to open folder: ${err.message}` });
  }
});

// GitHub Release Update Checker
export function isVersionNewer(latest: string, current: string): boolean {
  const cleanLatest = latest.replace(/^v/, '').trim();
  const cleanCurrent = current.replace(/^v/, '').trim();
  const lParts = cleanLatest.split('.').map(n => Number.parseInt(n, 10) || 0);
  const cParts = cleanCurrent.split('.').map(n => Number.parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

app.get('/api/updates/check', async (_req, res) => {
  try {
    const response = await fetch('https://api.github.com/repos/jtimmyoftimeofficial-debug/MediaFlow/releases/latest', {
      headers: {
        'User-Agent': 'MediaFlow-Desktop-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      res.json({
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        hasUpdate: false,
        releaseUrl: 'https://github.com/jtimmyoftimeofficial-debug/MediaFlow/releases',
        message: 'Could not fetch latest release information.'
      });
      return;
    }

    const data: any = await response.json();
    const latestVersion = data.tag_name || APP_VERSION;
    const hasUpdate = isVersionNewer(latestVersion, APP_VERSION);

    // Locate setup installer asset if available
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const installerAsset = assets.find((a: any) => a.name?.endsWith('.exe') || a.name?.includes('Setup'));
    const downloadUrl = installerAsset?.browser_download_url || data.html_url;

    res.json({
      currentVersion: APP_VERSION,
      latestVersion,
      hasUpdate,
      releaseUrl: data.html_url || 'https://github.com/jtimmyoftimeofficial-debug/MediaFlow/releases',
      downloadUrl,
      releaseName: data.name || latestVersion,
      releaseNotes: data.body || '',
      publishedAt: data.published_at
    });
  } catch (err: any) {
    console.warn('[Updates] Failed to check GitHub releases:', err.message);
    res.json({
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      hasUpdate: false,
      releaseUrl: 'https://github.com/jtimmyoftimeofficial-debug/MediaFlow/releases',
      error: err.message
    });
  }
});

// 8. Serve Client in production
const candidate1 = path.resolve(process.cwd(), 'dist/client');
const candidate2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client');
const clientDist = fs.existsSync(candidate1) ? candidate1 : candidate2;

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Prevent pipe close crashes (e.g. when launched from Windows wrappers or services)
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EPIPE') {
    return;
  }
  console.error('[Fatal Error]', err);
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    console.log(`[Server] MediaFlow running at http://${HOST}:${PORT}`);
    console.log(`[Server] Download directory configured to: ${downloadEngine.getDownloadDir()}`);
  });

  // Also bind to IPv6 loopback [::1] if HOST is 127.0.0.1 so http://localhost:3001 works seamlessly on IPv6 Windows machines
  if (HOST === '127.0.0.1') {
    import('node:http').then(({ createServer }) => {
      const v6Server = createServer(app);
      v6Server.on('error', () => {
        // IPv6 loopback not supported or already bound, safe to ignore
      });
      v6Server.listen(PORT, '::1');
    }).catch(() => {});
  }
}

export { app, downloadEngine };
