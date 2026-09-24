import type { PlatformAdapter } from './PlatformAdapter.js';
import { PlatformPolicyError } from './PlatformAdapter.js';
import type { MediaMetadata, MediaFormat, PlatformId } from '../../shared/types.js';
import { safeFetch } from '../security/ssrfGuard.js';

interface RestrictedPlatformConfig {
  id: PlatformId;
  name: string;
  domains: string[];
  oembedEndpoint?: (url: string) => string;
  policyReason: string;
}

const RESTRICTED_PLATFORMS: RestrictedPlatformConfig[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
    oembedEndpoint: (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    policyReason: 'YouTube terms of service and access controls do not permit unauthorized third-party automated media downloading. The application adheres to platform boundaries and does not perform DRM circumvention or cipher manipulation.'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    domains: ['instagram.com', 'www.instagram.com'],
    policyReason: 'Instagram media is protected behind authentication walls and platform API restrictions. Direct unauthorized downloading without official graph API authorization is restricted.'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    domains: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
    oembedEndpoint: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    policyReason: 'TikTok requires application authentication tokens and watermarking protocols. Automated scraping or DRM evasion is strictly disallowed under platform safety guidelines.'
  },
  {
    id: 'twitter',
    name: 'X (formerly Twitter)',
    domains: ['twitter.com', 'x.com', 'mobile.twitter.com'],
    oembedEndpoint: (url) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
    policyReason: 'X / Twitter video feeds are delivered via protected media manifests requiring authenticated sessions. Bypassing these platform controls is not supported.'
  }
];

export class RestrictedPlatformAdapter implements PlatformAdapter {
  private config: RestrictedPlatformConfig;
  readonly id: PlatformId;
  readonly name: string;
  readonly description: string;
  readonly supportedDomains: string[];
  readonly isDownloadPermitted = false;
  readonly policyNote: string;
  enabled = true;

  constructor(config: RestrictedPlatformConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.supportedDomains = config.domains;
    this.description = `${config.name} (Policy-Compliant Platform Gate)`;
    this.policyNote = config.policyReason;
  }

  canHandle(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return this.supportedDomains.some(d => host === d || host.endsWith('.' + d));
  }

  async getMetadata(url: URL): Promise<MediaMetadata> {
    let title = `${this.name} Video`;
    let author: string | undefined;
    let thumbnailUrl: string | undefined;

    // Attempt official public oEmbed if available to cleanly retrieve public metadata
    if (this.config.oembedEndpoint) {
      try {
        const oembedUrl = this.config.oembedEndpoint(url.toString());
        const response = await safeFetch(oembedUrl, {
          headers: { 'User-Agent': 'SocialMediaVideoDownloader/1.0' }
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          if (data && data.title) title = data.title;
          if (data && data.author_name) author = data.author_name;
          if (data && data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
        }
      } catch {
        // Fallback gracefully if oEmbed is temporarily rate-limited or blocked
      }
    }

    return {
      url: url.toString(),
      platform: this.name,
      platformId: this.id,
      title,
      author,
      thumbnailUrl,
      permitted: false,
      policyMessage: this.config.policyReason,
      formats: [] // No download formats permitted
    };
  }

  async getAvailableFormats(_url: URL, _metadata: MediaMetadata): Promise<MediaFormat[]> {
    return [];
  }

  async getStreamUrl(_url: URL, _formatId: string): Promise<string> {
    throw new PlatformPolicyError(this.config.policyReason);
  }
}

export function createRestrictedAdapters(): PlatformAdapter[] {
  return RESTRICTED_PLATFORMS.map(c => new RestrictedPlatformAdapter(c));
}
