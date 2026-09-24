import type { PlatformAdapter } from './PlatformAdapter.js';
import { MediaNotFoundError, PlatformError } from './PlatformAdapter.js';
import type { MediaMetadata, MediaFormat, PlatformId } from '../../shared/types.js';
import { safeFetch } from '../security/ssrfGuard.js';

export class InternetArchiveAdapter implements PlatformAdapter {
  readonly id: PlatformId = 'internet-archive';
  readonly name = 'Internet Archive';
  readonly description = 'Public domain, Creative Commons, and open cultural videos from Archive.org';
  readonly supportedDomains = ['archive.org', 'www.archive.org'];
  readonly isDownloadPermitted = true;
  readonly policyNote = 'Content is retrieved via the official Archive.org open metadata API for publicly accessible items.';
  enabled = true;

  canHandle(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return this.supportedDomains.includes(host);
  }

  private extractIdentifier(url: URL): string | null {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['details', 'download', 'embed'].includes(parts[0])) {
      return parts[1];
    }
    if (parts.length === 1 && !['about', 'donate', 'web'].includes(parts[0])) {
      return parts[0];
    }
    return null;
  }

  async getMetadata(url: URL): Promise<MediaMetadata> {
    const identifier = this.extractIdentifier(url);
    if (!identifier) {
      throw new PlatformError('Invalid Internet Archive URL structure. Expected archive.org/details/{item-id}', 'INVALID_URL');
    }

    const metadataApiUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
    let response: Response;
    try {
      response = await safeFetch(metadataApiUrl, {
        headers: { 'User-Agent': 'SocialMediaVideoDownloader/1.0 (PermittedPublicDownloader)' }
      });
    } catch (err: any) {
      throw new PlatformError(`Failed to fetch Internet Archive metadata: ${err.message}`, 'FETCH_FAILED');
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new MediaNotFoundError(`Archive item "${identifier}" not found or has been removed.`);
      }
      throw new PlatformError(`Internet Archive API responded with status ${response.status}`, 'API_ERROR');
    }

    const data = (await response.json()) as any;
    if (!data || !data.metadata) {
      throw new MediaNotFoundError(`No public item found with identifier "${identifier}"`);
    }

    const meta = data.metadata;
    const title = meta.title || identifier;
    const author = meta.creator || meta.uploader || 'Internet Archive Contributor';
    const description = typeof meta.description === 'string' ? meta.description.slice(0, 300) : undefined;
    const license = meta.licenseurl || 'Public Domain / Creative Commons / Open Access';

    const server = data.server || 'ia600000.us.archive.org';
    const dir = data.dir || '';
    const thumbnailUrl = meta.thumb ? `https://${server}${dir}/${meta.thumb}` : undefined;

    const formats = await this.getAvailableFormats(url, {
      url: url.toString(),
      platform: this.name,
      platformId: this.id,
      title,
      author,
      description,
      thumbnailUrl,
      license,
      permitted: true,
      formats: []
    }, data.files || []);

    return {
      url: url.toString(),
      platform: this.name,
      platformId: this.id,
      title,
      author,
      description,
      thumbnailUrl,
      license,
      permitted: true,
      formats
    };
  }

  async getAvailableFormats(
    url: URL,
    _metadata: MediaMetadata,
    rawFiles?: any[]
  ): Promise<MediaFormat[]> {
    const identifier = this.extractIdentifier(url);
    if (!identifier) return [];

    let files: any[] = rawFiles || [];
    if (!rawFiles || rawFiles.length === 0) {
      const metadataApiUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
      const res = await safeFetch(metadataApiUrl);
      const data = (await res.json()) as any;
      files = data.files || [];
    }

    const formats: MediaFormat[] = [];

    for (const f of files) {
      const name: string = f.name || '';
      const formatStr: string = f.format || '';
      const size = f.size ? Number.parseInt(f.size, 10) : undefined;
      const lowerName = name.toLowerCase();

      const isMp4 = lowerName.endsWith('.mp4') || formatStr.includes('MPEG4') || formatStr.includes('h.264');
      const isWebm = lowerName.endsWith('.webm') || formatStr.includes('WebM');
      const isOgv = lowerName.endsWith('.ogv') || formatStr.includes('Ogg Video');

      if (isMp4 || isWebm || isOgv) {
        const container = isMp4 ? 'mp4' : isWebm ? 'webm' : 'ogv';
        const resolution = f.height ? `${f.width || '?'}x${f.height}` : undefined;
        const label = resolution 
          ? `${resolution} (${container.toUpperCase()}) - ${f.format || 'Video'}`
          : `${f.format || 'Standard Video'} (${container.toUpperCase()})`;

        const downloadUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(name)}`;

        formats.push({
          id: name,
          label,
          container,
          resolution,
          filesize: size,
          hasAudio: true,
          hasVideo: true,
          downloadUrl,
          qualityNote: f.bitrate ? `${Math.round(Number(f.bitrate) / 1000)} kbps` : undefined
        });
      }
    }

    formats.sort((a, b) => (b.filesize || 0) - (a.filesize || 0));

    if (formats.length === 0) {
      throw new MediaNotFoundError('No supported video streams found for this Archive.org item.');
    }

    return formats;
  }

  async getStreamUrl(url: URL, formatId: string): Promise<string> {
    const identifier = this.extractIdentifier(url);
    if (!identifier) {
      throw new PlatformError('Missing identifier for Archive item', 'INVALID_URL');
    }
    return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(formatId)}`;
  }
}
