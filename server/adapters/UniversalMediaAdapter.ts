import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PlatformAdapter } from './PlatformAdapter.js';
import { PlatformError, MediaNotFoundError } from './PlatformAdapter.js';
import type { MediaMetadata, MediaFormat, PlatformId } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

// Auto-discover bundled bin directory and WinGet packages on Windows so PATH is always guaranteed
function ensureExtractorBinariesInPath(): void {
  if (process.platform === 'win32') {
    const possibleBinDirs = [
      path.resolve(process.cwd(), 'bin'),
      path.dirname(process.execPath),
      path.resolve(process.cwd(), '../bin')
    ];
    for (const b of possibleBinDirs) {
      if (fs.existsSync(b)) {
        process.env.PATH = `${b};${process.env.PATH}`;
      }
    }

    const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
    if (localAppData) {
      const wingetDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
      if (fs.existsSync(wingetDir)) {
        try {
          const entries = fs.readdirSync(wingetDir);
          for (const entry of entries) {
            const entryPath = path.join(wingetDir, entry);
            if (entry.includes('yt-dlp') || entry.includes('FFmpeg')) {
              const binPath = path.join(entryPath, 'bin');
              if (fs.existsSync(binPath)) {
                process.env.PATH = `${binPath};${process.env.PATH}`;
              }
              try {
                const subEntries = fs.readdirSync(entryPath, { withFileTypes: true });
                for (const sub of subEntries) {
                  if (sub.isDirectory()) {
                    const subBin = path.join(entryPath, sub.name, 'bin');
                    if (fs.existsSync(subBin)) {
                      process.env.PATH = `${subBin};${process.env.PATH}`;
                    }
                  }
                }
              } catch {
                // ignore
              }
              process.env.PATH = `${entryPath};${process.env.PATH}`;
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }
}

ensureExtractorBinariesInPath();

const SUPPORTED_SOCIAL_DOMAINS = [
  'youtube.com', 'youtu.be', 'm.youtube.com',
  'tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
  'instagram.com',
  'twitter.com', 'x.com',
  'vimeo.com', 'player.vimeo.com',
  'reddit.com', 'v.redd.it',
  'facebook.com', 'fb.watch',
  'twitch.tv', 'dailymotion.com'
];

/**
 * Robust format file-size estimation based on filesize, approx, bitrate, and duration
 */
export function estimateFormatSize(f: any, duration?: number, additionalAudio = 0): number | undefined {
  if (typeof f?.filesize === 'number' && f.filesize > 0) {
    return f.filesize + additionalAudio;
  }
  if (typeof f?.filesize_approx === 'number' && f.filesize_approx > 0) {
    return f.filesize_approx + additionalAudio;
  }

  const validDuration = (duration && duration > 0) ? duration : (typeof f?.duration === 'number' ? f.duration : undefined);

  if (validDuration && validDuration > 0) {
    const kbps = f?.tbr || (f?.vbr ? f.vbr + (f?.abr || 128) : 0);
    if (kbps > 0) {
      return Math.round((kbps * 1000 / 8) * validDuration) + additionalAudio;
    }

    const effectiveQuality = (f?.height && f?.width) ? Math.min(f.height, f.width) : (f?.height || f?.width || 720);
    if (effectiveQuality > 0) {
      const estimatedKbps = 
        effectiveQuality >= 2160 ? 22000 :
        effectiveQuality >= 1440 ? 12000 :
        effectiveQuality >= 1080 ? 4500 :
        effectiveQuality >= 720  ? 2200 :
        effectiveQuality >= 480  ? 1200 :
        effectiveQuality >= 360  ? 700 : 400;
      return Math.round((estimatedKbps * 1000 / 8) * validDuration) + additionalAudio;
    }
  }

  return undefined;
}

export class UniversalMediaAdapter implements PlatformAdapter {
  readonly id: PlatformId = 'universal' as PlatformId;
  readonly name = 'Social Media Video Extractor';
  readonly description = 'High-definition extractor supporting YouTube, TikTok, Instagram, X (Twitter), Vimeo, and Reddit';
  readonly supportedDomains = SUPPORTED_SOCIAL_DOMAINS;
  readonly isDownloadPermitted = true;
  readonly policyNote = 'Streams retrieved via verified extractor engine for authorized personal media access.';
  enabled = true;

  private isExtractorAvailable: boolean | null = null;
  private metadataCache = new Map<string, { metadata: MediaMetadata; expiry: number }>();

  async checkAvailability(): Promise<boolean> {
    if (this.isExtractorAvailable !== null) return this.isExtractorAvailable;
    ensureExtractorBinariesInPath();
    try {
      await execFileAsync('yt-dlp', ['--version']);
      this.isExtractorAvailable = true;
    } catch {
      this.isExtractorAvailable = false;
    }
    return this.isExtractorAvailable;
  }

  canHandle(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return this.supportedDomains.some(d => host === d || host.endsWith('.' + d));
  }

  async getMetadata(url: URL): Promise<MediaMetadata> {
    const cacheKey = url.toString();
    const cached = this.metadataCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return cached.metadata;
    }

    const available = await this.checkAvailability();
    if (!available) {
      throw new PlatformError('External extractor engine is not available on this system.', 'EXTRACTOR_MISSING');
    }

    let stdout: string;
    try {
      const result = await execFileAsync('yt-dlp', [
        '--dump-single-json',
        '--no-playlist',
        '--no-warnings',
        '--skip-download',
        url.toString()
      ], {
        maxBuffer: 25 * 1024 * 1024,
        timeout: 40000
      });
      stdout = result.stdout;
    } catch (err: any) {
      if (err.stderr && (err.stderr.includes('Video unavailable') || err.stderr.includes('Private video'))) {
        throw new MediaNotFoundError('Video is unavailable, private, or has been removed.');
      }
      throw new PlatformError(err.stderr || err.message || 'Failed to inspect media', 'INSPECTION_FAILED');
    }

    let data: any;
    try {
      data = JSON.parse(stdout);
    } catch {
      throw new PlatformError('Failed to parse media metadata from extractor', 'PARSE_FAILED');
    }

    const title = data.title || 'Untitled Video';
    const author = data.uploader || data.channel || data.creator || url.hostname;
    const duration = typeof data.duration === 'number' ? data.duration : undefined;
    const description = typeof data.description === 'string' ? data.description.slice(0, 300) : undefined;
    const thumbnailUrl = data.thumbnail || (Array.isArray(data.thumbnails) && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1]?.url : undefined);

    // Platform detection
    const host = url.hostname.toLowerCase();
    let platformName = 'Social Video';
    let platformId: PlatformId = 'unknown';

    if (host.includes('youtube') || host.includes('youtu.be')) {
      platformName = 'YouTube';
      platformId = 'youtube';
    } else if (host.includes('tiktok')) {
      platformName = 'TikTok';
      platformId = 'tiktok';
    } else if (host.includes('instagram')) {
      platformName = 'Instagram';
      platformId = 'instagram';
    } else if (host.includes('twitter') || host.includes('x.com')) {
      platformName = 'X (Twitter)';
      platformId = 'twitter';
    } else if (host.includes('vimeo')) {
      platformName = 'Vimeo';
      platformId = 'vimeo';
    } else if (host.includes('reddit')) {
      platformName = 'Reddit';
      platformId = 'unknown';
    }

    // Audio stream size estimation
    const rawFormats = Array.isArray(data.formats) ? data.formats : [];
    const audioFormats = rawFormats.filter((f: any) => f.vcodec === 'none' && (f.acodec && f.acodec !== 'none'));
    const bestAudio = audioFormats.sort((a: any, b: any) => (b.abr || 0) - (a.abr || 0))[0];
    const estimatedAudioBytes = duration ? Math.round(((bestAudio?.abr || 128) * 1000 / 8) * duration) : 0;

    // Filter video formats (supports horizontal, vertical, square)
    const videoFormats = rawFormats
      .filter((f: any) => (f.vcodec && f.vcodec !== 'none') || (f.height || f.width))
      .sort((a: any, b: any) => {
        const areaA = (a.width || 0) * (a.height || 0) || (a.height || 0);
        const areaB = (b.width || 0) * (b.height || 0) || (b.height || 0);
        return areaB - areaA;
      });

    const formats: MediaFormat[] = [];
    const seenQualities = new Set<number>();
    let topResolutionSize: number | undefined;

    for (const f of videoFormats) {
      // Effective quality is the smaller dimension (e.g. 1080 for 1920x1080 or 1080x1920)
      const effectiveQuality = (f.height && f.width) ? Math.min(f.height, f.width) : (f.height || f.width || 720);
      
      // Group close heights into standard quality bins
      let qualityTier = effectiveQuality;
      if (effectiveQuality >= 2000) qualityTier = 2160;
      else if (effectiveQuality >= 1300) qualityTier = 1440;
      else if (effectiveQuality >= 1000) qualityTier = 1080;
      else if (effectiveQuality >= 650) qualityTier = 720;
      else if (effectiveQuality >= 440) qualityTier = 480;
      else if (effectiveQuality >= 320) qualityTier = 360;

      if (!seenQualities.has(qualityTier)) {
        seenQualities.add(qualityTier);
        const ext = f.ext === 'mp4' ? 'mp4' : (f.ext || 'mp4');
        const isAdaptiveOnly = f.acodec === 'none';
        const calculatedSize = estimateFormatSize(f, duration, isAdaptiveOnly ? estimatedAudioBytes : 0);

        if (!topResolutionSize && calculatedSize) {
          topResolutionSize = calculatedSize;
        }

        const isVertical = f.height && f.width && f.height > f.width;
        const qualityName = 
          qualityTier >= 2160 ? '4K UHD' :
          qualityTier >= 1440 ? '2K QHD' :
          qualityTier >= 1080 ? '1080p Full HD' :
          qualityTier >= 720  ? '720p HD' :
          qualityTier >= 480  ? '480p SD' : `${qualityTier}p`;

        const label = `${qualityName}${isVertical ? ' (Vertical)' : ''} (${ext.toUpperCase()})`;
        
        // Exact format selector: if adaptive, combine with best audio; if progressive, stream directly
        const selectorId = isAdaptiveOnly
          ? `bestvideo[height<=${f.height || qualityTier}]+bestaudio/best[height<=${f.height || qualityTier}]/best`
          : (f.format_id ? `${f.format_id}/best` : `best[height<=${f.height || qualityTier}]`);

        formats.push({
          id: selectorId,
          label,
          container: ext,
          resolution: `${f.width || '?'}x${f.height || '?'}`,
          filesize: calculatedSize,
          hasAudio: true,
          hasVideo: true,
          qualityNote: `${qualityTier}p`
        });
      }
    }

    // Best Video + Audio combined format (inserted at top as Recommended)
    const bestSize = topResolutionSize || (typeof data.filesize === 'number' ? data.filesize : data.filesize_approx) || (duration ? Math.round((3500 * 1000 / 8) * duration) : undefined);
    formats.unshift({
      id: 'best',
      label: 'Best Available Quality (Auto MP4)',
      container: 'mp4',
      filesize: bestSize,
      hasAudio: true,
      hasVideo: true,
      qualityNote: 'Recommended'
    });

    // Audio-only option
    const audioFileSize = bestAudio?.filesize || bestAudio?.filesize_approx || (duration ? Math.max(500000, Math.round(((bestAudio?.abr || 128) * 1000 / 8) * duration)) : undefined);
    formats.push({
      id: 'bestaudio/best',
      label: 'Audio Only (MP3/M4A)',
      container: 'mp3',
      filesize: audioFileSize,
      hasAudio: true,
      hasVideo: false,
      qualityNote: 'Audio Stream'
    });

    const metadataResult: MediaMetadata = {
      url: url.toString(),
      platform: platformName,
      platformId,
      title,
      author,
      description,
      duration,
      thumbnailUrl,
      license: 'Public Social Media Stream',
      permitted: true,
      formats
    };

    // Cache metadata for 5 minutes
    this.metadataCache.set(cacheKey, {
      metadata: metadataResult,
      expiry: Date.now() + 5 * 60 * 1000
    });

    return metadataResult;
  }

  async getAvailableFormats(url: URL, metadata: MediaMetadata): Promise<MediaFormat[]> {
    return metadata.formats;
  }

  async getStreamUrl(url: URL, formatId: string): Promise<string> {
    return `extractor:${formatId}::${url.toString()}`;
  }
}
