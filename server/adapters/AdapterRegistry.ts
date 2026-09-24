import type { PlatformAdapter } from './PlatformAdapter.js';
import type { PlatformAdapterInfo, PlatformId } from '../../shared/types.js';
import { InternetArchiveAdapter } from './InternetArchiveAdapter.js';
import { WikimediaAdapter } from './WikimediaAdapter.js';
import { DirectMediaAdapter } from './DirectMediaAdapter.js';
import { createRestrictedAdapters } from './RestrictedPlatformAdapter.js';
import { UniversalMediaAdapter } from './UniversalMediaAdapter.js';

export class AdapterRegistry {
  private adapters: PlatformAdapter[] = [];

  constructor() {
    this.initDefaultAdapters();
  }

  private initDefaultAdapters(): void {
    // 1. Internet Archive
    if (process.env.ADAPTER_ENABLE_INTERNET_ARCHIVE !== '0') {
      this.register(new InternetArchiveAdapter());
    }

    // 2. Wikimedia Commons
    if (process.env.ADAPTER_ENABLE_WIKIMEDIA !== '0') {
      this.register(new WikimediaAdapter());
    }

    // 3. Universal Social Media Extractor (YouTube, TikTok, Instagram, Twitter, Vimeo, Reddit)
    if (process.env.ADAPTER_ENABLE_UNIVERSAL !== '0') {
      this.register(new UniversalMediaAdapter());
    }

    // 4. Fallback Restricted Platform Gates if universal extractor disabled
    if (process.env.ADAPTER_ENABLE_RESTRICTED_PLATFORMS === '1') {
      for (const adapter of createRestrictedAdapters()) {
        this.register(adapter);
      }
    }

    // 5. Direct public video link adapter
    if (process.env.ADAPTER_ENABLE_DIRECT_MEDIA !== '0') {
      this.register(new DirectMediaAdapter());
    }
  }

  register(adapter: PlatformAdapter): void {
    this.adapters.push(adapter);
  }

  getAdapter(url: URL): PlatformAdapter | null {
    // Check specific/universal adapters first
    for (const adapter of this.adapters) {
      if (adapter.enabled && adapter.id !== 'direct-media' && adapter.canHandle(url)) {
        return adapter;
      }
    }

    // Fall back to direct media adapter
    for (const adapter of this.adapters) {
      if (adapter.enabled && adapter.id === 'direct-media' && adapter.canHandle(url)) {
        return adapter;
      }
    }

    return null;
  }

  setAdapterEnabled(id: PlatformId, enabled: boolean): boolean {
    let found = false;
    for (const a of this.adapters) {
      if (a.id === id) {
        a.enabled = enabled;
        found = true;
      }
    }
    return found;
  }

  getAllAdapters(): PlatformAdapterInfo[] {
    return this.adapters.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      enabled: a.enabled,
      supportedDomains: a.supportedDomains,
      status: !a.enabled ? 'disabled' : a.isDownloadPermitted ? 'active' : 'restricted_policy',
      policyNote: a.policyNote
    }));
  }
}

export const defaultAdapterRegistry = new AdapterRegistry();
