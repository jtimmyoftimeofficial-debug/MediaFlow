import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { safeFetch } from '../security/ssrfGuard.js';
import { getSafeResolvedPath, sanitizeFilename } from '../security/pathSanitizer.js';
import type { DownloadProgress, DownloadJobStatus, DownloadStage } from '../../shared/types.js';

export interface ActiveJob {
  jobId: string;
  url: string;
  formatId: string;
  filename: string;
  tempPath: string;
  finalPath: string;
  status: DownloadJobStatus;
  stage: DownloadStage;
  bytesDownloaded: number;
  totalBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  abortController: AbortController;
  startTime: number;
  lastProgressUpdate: number;
  lastBytes: number;
  error?: string;
}

export class DownloadEngine {
  private jobs = new Map<string, ActiveJob>();
  private downloadDir: string;
  private maxSizeBytes: number;

  constructor(downloadDir = './downloads', maxSizeBytes = 2 * 1024 * 1024 * 1024) {
    this.downloadDir = path.resolve(downloadDir);
    this.maxSizeBytes = maxSizeBytes;
  }

  getDownloadDir(): string {
    return this.downloadDir;
  }

  getMaxSizeBytes(): number {
    return this.maxSizeBytes;
  }

  setDownloadDir(dir: string): void {
    this.downloadDir = path.resolve(dir);
  }

  getJob(jobId: string): ActiveJob | undefined {
    return this.jobs.get(jobId);
  }

  getProgress(jobId: string): DownloadProgress | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    let percent = 0;
    if (job.status === 'completed') {
      percent = 100;
    } else if (job.totalBytes > 0) {
      percent = Math.min(99, Math.round((job.bytesDownloaded / job.totalBytes) * 1000) / 10);
    }

    return {
      jobId: job.jobId,
      status: job.status,
      stage: job.stage,
      percent,
      bytesDownloaded: job.bytesDownloaded,
      totalBytes: job.totalBytes,
      speedBytesPerSec: job.speedBytesPerSec,
      etaSeconds: job.etaSeconds,
      filename: job.filename,
      destinationPath: job.status === 'completed' ? job.finalPath : undefined,
      error: job.error
    };
  }

  async startDownload(
    jobId: string,
    streamUrl: string,
    rawTitle: string,
    formatContainer = 'mp4',
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    const sanitizedFilename = sanitizeFilename(rawTitle, formatContainer);
    const finalPath = await getSafeResolvedPath(this.downloadDir, sanitizedFilename, true);
    const actualFilename = path.basename(finalPath);
    const tempPath = `${finalPath}.part-${jobId}`;

    const abortController = new AbortController();

    const job: ActiveJob = {
      jobId,
      url: streamUrl,
      formatId: formatContainer,
      filename: actualFilename,
      tempPath,
      finalPath,
      status: 'downloading',
      stage: 'downloading',
      bytesDownloaded: 0,
      totalBytes: 0,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      abortController,
      startTime: Date.now(),
      lastProgressUpdate: Date.now(),
      lastBytes: 0
    };

    this.jobs.set(jobId, job);

    try {
      const response = await safeFetch(streamUrl, {
        signal: abortController.signal,
        headers: {
          'User-Agent': 'SocialMediaVideoDownloader/1.0',
          'Accept': '*/*'
        }
      });

      if (!response.ok) {
        throw new Error(`Media server returned HTTP ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response did not contain a readable stream');
      }

      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const total = Number.parseInt(contentLengthHeader, 10);
        if (!Number.isNaN(total)) {
          if (total > this.maxSizeBytes) {
            throw new Error(`Media size (${Math.round(total / (1024 * 1024))} MB) exceeds maximum allowed limit (${Math.round(this.maxSizeBytes / (1024 * 1024))} MB)`);
          }
          job.totalBytes = total;
        }
      }

      const fileWriteStream = fs.createWriteStream(tempPath, { flags: 'w' });
      const nodeReadableStream = Readable.fromWeb(response.body as any);

      nodeReadableStream.on('data', (chunk: Buffer) => {
        job.bytesDownloaded += chunk.length;

        if (job.bytesDownloaded > this.maxSizeBytes) {
          abortController.abort();
          throw new Error('Download exceeded maximum allowed file size during streaming.');
        }

        const now = Date.now();
        const elapsedSinceLast = now - job.lastProgressUpdate;

        if (elapsedSinceLast >= 300) {
          const bytesDiff = job.bytesDownloaded - job.lastBytes;
          job.speedBytesPerSec = Math.round((bytesDiff / elapsedSinceLast) * 1000);
          job.lastBytes = job.bytesDownloaded;
          job.lastProgressUpdate = now;

          if (job.totalBytes > 0 && job.speedBytesPerSec > 0) {
            const remainingBytes = job.totalBytes - job.bytesDownloaded;
            job.etaSeconds = Math.max(0, Math.round(remainingBytes / job.speedBytesPerSec));
          }

          if (onProgress) {
            const p = this.getProgress(jobId);
            if (p) onProgress(p);
          }
        }
      });

      await pipeline(nodeReadableStream, fileWriteStream);
      await fs.promises.rename(tempPath, finalPath);

      job.status = 'completed';
      job.speedBytesPerSec = 0;
      job.etaSeconds = 0;

      if (onProgress) {
        const p = this.getProgress(jobId);
        if (p) onProgress(p);
      }

      return finalPath;
    } catch (err: any) {
      try {
        if (fs.existsSync(tempPath)) {
          await fs.promises.unlink(tempPath);
        }
      } catch {}

      if (abortController.signal.aborted || err.name === 'AbortError') {
        job.status = 'cancelled';
        job.error = 'Download cancelled by user';
      } else {
        job.status = 'error';
        job.error = err.message || 'Unknown download error occurred';
      }

      if (onProgress) {
        const p = this.getProgress(jobId);
        if (p) onProgress(p);
      }

      throw err;
    }
  }

  async startExtractorDownload(
    jobId: string,
    mediaUrl: string,
    formatSelector: string,
    rawTitle: string,
    formatContainer = 'mp4',
    expectedSizeBytes?: number,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    const sanitizedFilename = sanitizeFilename(rawTitle, formatContainer);
    const finalPath = await getSafeResolvedPath(this.downloadDir, sanitizedFilename, true);
    const actualFilename = path.basename(finalPath);
    const tempTemplate = path.join(this.downloadDir, `${actualFilename}.part-${jobId}.%(ext)s`);

    const abortController = new AbortController();

    const job: ActiveJob = {
      jobId,
      url: mediaUrl,
      formatId: formatSelector,
      filename: actualFilename,
      tempPath: tempTemplate,
      finalPath,
      status: 'downloading',
      stage: 'initializing',
      bytesDownloaded: 0,
      totalBytes: expectedSizeBytes || 0,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      abortController,
      startTime: Date.now(),
      lastProgressUpdate: Date.now(),
      lastBytes: 0
    };

    this.jobs.set(jobId, job);

    return new Promise<string>((resolve, reject) => {
      const args = [
        '--no-playlist',
        '--newline',
        '--no-warnings',
        '--progress-template',
        'download:PROGRESS:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
        '-f',
        formatSelector && formatSelector !== 'best' ? formatSelector : 'bestvideo+bestaudio/best',
        '-o',
        tempTemplate,
        '--merge-output-format',
        formatContainer === 'mp3' ? 'mp3' : 'mp4',
        mediaUrl
      ];

      const child = spawn('yt-dlp', args, {
        windowsHide: true,
        signal: abortController.signal
      });

      const partDownloaded = new Map<number, number>();
      const partTotals = new Map<number, number>();
      let currentPartIndex = 0;

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.includes('[download] Destination:') || (line.includes('[download]') && line.includes('Destination:'))) {
            if (partDownloaded.has(currentPartIndex) && (partDownloaded.get(currentPartIndex) || 0) > 0) {
              currentPartIndex++;
            }
          }

          if (line.includes('PROGRESS:')) {
            job.stage = 'downloading';
            const raw = line.slice(line.indexOf('PROGRESS:') + 9).trim();
            const parts = raw.split('|');

            const currentDownloaded = Number.parseInt(parts[0], 10) || 0;
            const currentTotal = Number.parseInt(parts[1], 10) || Number.parseInt(parts[2], 10) || 0;
            const speed = Number.parseFloat(parts[3]) || 0;
            const eta = Number.parseInt(parts[4], 10) || 0;

            partDownloaded.set(currentPartIndex, currentDownloaded);
            if (currentTotal > 0) {
              partTotals.set(currentPartIndex, currentTotal);
            }

            job.bytesDownloaded = Array.from(partDownloaded.values()).reduce((a, b) => a + b, 0);

            const liveTotal = Array.from(partTotals.values()).reduce((a, b) => a + b, 0);
            if (liveTotal > 0) {
              job.totalBytes = Math.max(job.totalBytes, liveTotal);
            }

            if (speed > 0) {
              job.speedBytesPerSec = Math.round(speed);
            }
            if (eta > 0) {
              job.etaSeconds = eta;
            }

            const now = Date.now();
            if (now - job.lastProgressUpdate >= 200) {
              job.lastProgressUpdate = now;
              if (onProgress) {
                const p = this.getProgress(jobId);
                if (p) onProgress(p);
              }
            }
          }

          if (line.includes('[Merger]') || line.includes('Merging formats') || line.includes('[Fixup')) {
            job.stage = 'merging';
            job.speedBytesPerSec = 0;
            job.etaSeconds = 0;
            if (job.totalBytes > 0) {
              job.bytesDownloaded = Math.round(job.totalBytes * 0.98);
            }
            if (onProgress) {
              const p = this.getProgress(jobId);
              if (p) onProgress(p);
            }
          }
        }
      });

      child.on('error', (err) => {
        job.status = abortController.signal.aborted ? 'cancelled' : 'error';
        job.stage = abortController.signal.aborted ? 'cancelled' : 'error';
        job.error = err.message;
        reject(err);
      });

      child.on('close', async (code) => {
        if (code === 0) {
          job.status = 'completed';
          job.stage = 'completed';
          job.speedBytesPerSec = 0;
          job.etaSeconds = 0;
          if (job.totalBytes > 0) {
            job.bytesDownloaded = job.totalBytes;
          }

          try {
            const dir = path.dirname(finalPath);
            const files = await fs.promises.readdir(dir);
            const matched = files.find(f => f.startsWith(`${actualFilename}.part-${jobId}`));
            if (matched) {
              const createdPath = path.join(dir, matched);
              // Retry on Windows in case ffmpeg has not released file handle
              let renamed = false;
              for (let i = 0; i < 6; i++) {
                try {
                  await fs.promises.rename(createdPath, finalPath);
                  renamed = true;
                  break;
                } catch (rErr: any) {
                  if (rErr.code === 'EBUSY' || rErr.code === 'EPERM') {
                    await new Promise(r => setTimeout(r, 300));
                  } else {
                    throw rErr;
                  }
                }
              }
              if (!renamed) {
                await fs.promises.rename(createdPath, finalPath);
              }
            }
          } catch (e: any) {
            console.warn('Finalize rename warning:', e.message);
          }

          if (onProgress) {
            const p = this.getProgress(jobId);
            if (p) onProgress(p);
          }
          resolve(finalPath);
        } else {
          job.status = abortController.signal.aborted ? 'cancelled' : 'error';
          job.error = `Extractor finished with code ${code}`;
          try {
            const dir = path.dirname(finalPath);
            const files = await fs.promises.readdir(dir);
            for (const f of files) {
              if (f.includes(`.part-${jobId}`)) {
                await fs.promises.unlink(path.join(dir, f)).catch(() => {});
              }
            }
          } catch {}
          reject(new Error(job.error));
        }
      });
    });
  }

  cancelDownload(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'downloading') {
      return false;
    }

    job.abortController.abort();
    job.status = 'cancelled';
    job.error = 'Download cancelled by user';

    fs.promises.unlink(job.tempPath).catch(() => {});

    return true;
  }
}
