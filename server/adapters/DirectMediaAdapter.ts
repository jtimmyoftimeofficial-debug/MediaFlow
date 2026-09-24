import type { PlatformAdapter } from './PlatformAdapter.js';
import { MediaNotFoundError, PlatformError } from './PlatformAdapter.js';
import type { MediaMetadata, MediaFormat, PlatformId } from '../../shared/types.js';
import { safeFetch } from '../security/ssrfGuard.js';

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.mkv'];

export class DirectMediaAdapter implements PlatformAdapter {
  readonly id: PlatformId = 'direct-media';
  readonly name = 'Direct Public Video Link';
  readonly description = 'Publicly accessible standalone media URLs (e.g., self-hosted videos, open CDN media, podcasts)';
  readonly supportedDomains = ['*'];
  readonly isDownloadPermitted = true;
  readonly policyNote = 'Requires direct publicly accessible media links that the user is authorized to download.';
  enabled = true;

  canHandle(url: URL): boolean {
    const pathname = url.pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => pathname.endsWith(ext));
  }

  async getMetadata(url: URL): Promise<MediaMetadata> {
    let headResponse: Response | null = null;
    let size: number | undefined;
    let contentType = '';

    // First attempt lightweight HEAD request
    try {
      headResponse = await safeFetch(url, {
        method: 'HEAD',
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
    } catch {
      // HEAD may fail on some servers
    }

    // If HEAD failed or gave 403/405 (common on AWS S3 or GCS when HEAD is restricted), try Range GET
    if (!headResponse || !headResponse.ok) {
      try {
        const getTestResponse = await safeFetch(url, {
          method: 'GET',
          headers: {
            'Range': 'bytes=0-1024',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        if (getTestResponse.ok || getTestResponse.status === 206) {
          contentType = getTestResponse.headers.get('content-type') || '';
          const contentRange = getTestResponse.headers.get('content-range');
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)/);
            if (match) {
              size = Number.parseInt(match[1], 10);
            }
          }
          if (!size) {
            const cl = getTestResponse.headers.get('content-length');
            if (cl && getTestResponse.status === 200) {
              size = Number.parseInt(cl, 10);
            }
          }
        }
      } catch (err: any) {
        throw new PlatformError(`Unable to reach target media URL: ${err.message}`, 'FETCH_FAILED');
      }
    } else {
      contentType = headResponse.headers.get('content-type') || '';
      const contentLength = headResponse.headers.get('content-length');
      size = contentLength ? Number.parseInt(contentLength, 10) : undefined;
    }

    // Extract filename from URL
    const pathname = decodeURIComponent(url.pathname);
    const lastSegment = pathname.split('/').filter(Boolean).pop() || 'video';
    const ext = lastSegment.split('.').pop()?.toLowerCase() || 'mp4';
    const cleanTitle = lastSegment.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Direct Video';

    const formats: MediaFormat[] = [
      {
        id: 'direct-stream',
        label: `Direct Stream (${ext.toUpperCase()})`,
        container: ext,
        filesize: size,
        hasAudio: true,
        hasVideo: true,
        downloadUrl: url.toString()
      }
    ];

    return {
      url: url.toString(),
      platform: this.name,
      platformId: this.id,
      title: cleanTitle,
      author: url.hostname,
      description: `Direct media stream from ${url.hostname} (Content-Type: ${contentType || 'video/mp4'})`,
      license: 'Publicly Accessible URL',
      permitted: true,
      formats
    };
  }

  async getAvailableFormats(url: URL, metadata: MediaMetadata): Promise<MediaFormat[]> {
    return metadata.formats;
  }

  async getStreamUrl(url: URL, _formatId: string): Promise<string> {
    return url.toString();
  }
}
