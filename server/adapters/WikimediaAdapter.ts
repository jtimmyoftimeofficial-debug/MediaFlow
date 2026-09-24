import type { PlatformAdapter } from './PlatformAdapter.js';
import { MediaNotFoundError, PlatformError } from './PlatformAdapter.js';
import type { MediaMetadata, MediaFormat, PlatformId } from '../../shared/types.js';
import { safeFetch } from '../security/ssrfGuard.js';

export class WikimediaAdapter implements PlatformAdapter {
  readonly id: PlatformId = 'wikimedia';
  readonly name = 'Wikimedia Commons';
  readonly description = 'Educational, public domain, and Creative Commons videos hosted on Wikimedia';
  readonly supportedDomains = [
    'commons.wikimedia.org',
    'en.wikipedia.org',
    'upload.wikimedia.org'
  ];
  readonly isDownloadPermitted = true;
  readonly policyNote = 'Content is openly licensed (Creative Commons / Public Domain) and provided via the official MediaWiki Action API.';
  enabled = true;

  canHandle(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return this.supportedDomains.some(d => host === d || host.endsWith('.' + d));
  }

  private extractFileTitle(url: URL): string | null {
    const path = decodeURIComponent(url.pathname);
    const match = path.match(/\/(?:wiki\/)?(File:[^/]+)/i);
    if (match) {
      return match[1];
    }
    if (url.hostname.includes('upload.wikimedia.org')) {
      const parts = path.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return `File:${last}`;
    }
    return null;
  }

  async getMetadata(url: URL): Promise<MediaMetadata> {
    const fileTitle = this.extractFileTitle(url);
    if (!fileTitle) {
      throw new PlatformError('Expected a Wikimedia Commons URL matching /wiki/File:...', 'INVALID_URL');
    }

    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url|size|mime|extmetadata|derivatives&format=json&origin=*`;

    let response: Response;
    try {
      response = await safeFetch(apiUrl, {
        headers: { 'User-Agent': 'SocialMediaVideoDownloader/1.0 (WikimediaCommonsDownloader)' }
      });
    } catch (err: any) {
      throw new PlatformError(`Failed to contact Wikimedia API: ${err.message}`, 'FETCH_FAILED');
    }

    if (!response.ok) {
      throw new PlatformError(`Wikimedia API error: ${response.status}`, 'API_ERROR');
    }

    const data = (await response.json()) as any;
    const pages = data?.query?.pages;
    if (!pages) {
      throw new MediaNotFoundError(`No Wikimedia file found for "${fileTitle}"`);
    }

    const pageId = Object.keys(pages)[0];
    if (pageId === '-1' || !pages[pageId].imageinfo || pages[pageId].imageinfo.length === 0) {
      throw new MediaNotFoundError(`File "${fileTitle}" does not exist on Wikimedia Commons`);
    }

    const info = pages[pageId].imageinfo[0];
    const extmeta = info.extmetadata || {};

    const rawTitle = extmeta.ObjectName?.value || pages[pageId].title || fileTitle;
    const cleanTitle = rawTitle.replace(/^File:/i, '').replace(/\.[^/.]+$/, '');
    const author = extmeta.Artist?.value?.replace(/<[^>]+>/g, '').trim() || 'Wikimedia Author';
    const license = extmeta.LicenseShortName?.value || 'Creative Commons';
    const description = extmeta.ImageDescription?.value?.replace(/<[^>]+>/g, '').trim()?.slice(0, 300);
    const thumbnailUrl = info.thumburl || info.url;

    const formats: MediaFormat[] = [];

    // Parse extension from URL path
    const origUrl: string = info.url;
    let ext = 'webm';
    try {
      const parsedOrig = new URL(origUrl);
      ext = parsedOrig.pathname.split('.').pop()?.toLowerCase() || 'webm';
    } catch {
      ext = 'webm';
    }

    formats.push({
      id: 'original',
      label: `Original Quality (${info.width || '?'}x${info.height || '?'}) - ${ext.toUpperCase()}`,
      container: ext,
      resolution: info.width ? `${info.width}x${info.height}` : undefined,
      filesize: info.size,
      hasAudio: true,
      hasVideo: true,
      downloadUrl: origUrl
    });

    if (Array.isArray(info.derivatives)) {
      for (const d of info.derivatives) {
        if (d.type && d.type.startsWith('video/')) {
          const dExt = d.type.includes('webm') ? 'webm' : 'mp4';
          const res = d.width ? `${d.width}x${d.height}` : undefined;
          formats.push({
            id: `transcode-${d.width || d.shorttitle || formats.length}`,
            label: `${res || d.shorttitle || 'Transcoded'} (${dExt.toUpperCase()})`,
            container: dExt,
            resolution: res,
            filesize: d.size,
            hasAudio: true,
            hasVideo: true,
            downloadUrl: d.src
          });
        }
      }
    }

    return {
      url: url.toString(),
      platform: this.name,
      platformId: this.id,
      title: cleanTitle,
      author,
      description,
      thumbnailUrl,
      license,
      permitted: true,
      formats
    };
  }

  async getAvailableFormats(url: URL, metadata: MediaMetadata): Promise<MediaFormat[]> {
    if (metadata.formats.length > 0) return metadata.formats;
    const fresh = await this.getMetadata(url);
    return fresh.formats;
  }

  async getStreamUrl(url: URL, formatId: string): Promise<string> {
    const meta = await this.getMetadata(url);
    const selected = meta.formats.find(f => f.id === formatId) || meta.formats[0];
    if (!selected || !selected.downloadUrl) {
      throw new PlatformError(`Selected format ${formatId} does not have a stream URL`, 'FORMAT_NOT_FOUND');
    }
    return selected.downloadUrl;
  }
}
