import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import dotenv from 'dotenv';
import { defaultAdapterRegistry } from './adapters/AdapterRegistry.js';
import { DownloadEngine } from './download/DownloadEngine.js';
import { defaultHistoryStore } from './storage/HistoryStore.js';
import { validateUrlSafety, SsrfBlockedError } from './security/ssrfGuard.js';
import { PlatformError, UnsupportedPlatformError, PlatformPolicyError } from './adapters/PlatformAdapter.js';

dotenv.config();

// Ensure User PATH packages (winget yt-dlp, ffmpeg) are loaded into environment
if (process.platform === 'win32') {
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
const HOST = process.env.HOST || '0.0.0.0';
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || './downloads';
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
  customTitle: z.string().optional()
});

app.post('/api/download/start', async (req, res) => {
  try {
    const parseResult = StartDownloadSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Missing required parameters (url, formatId)' });
      return;
    }

    const { url, formatId, customTitle } = parseResult.data;
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
    version: '1.0.0'
  });
});

// 8. Serve Client in production
const clientDist = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    console.log(`[Server] Social Media Video Downloader running at http://${HOST}:${PORT}`);
    console.log(`[Server] Download directory configured to: ${downloadEngine.getDownloadDir()}`);
  });
}

export { app, downloadEngine };
