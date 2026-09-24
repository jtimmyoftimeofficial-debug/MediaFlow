import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '../../server/adapters/AdapterRegistry.js';

describe('Adapter Registry & Platform Routing', () => {
  const registry = new AdapterRegistry();

  it('routes archive.org URLs to InternetArchiveAdapter', () => {
    const url = new URL('https://archive.org/details/electricsheep-flock-244-7500-1');
    const adapter = registry.getAdapter(url);
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe('internet-archive');
    expect(adapter?.isDownloadPermitted).toBe(true);
  });

  it('routes commons.wikimedia.org URLs to WikimediaAdapter', () => {
    const url = new URL('https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm');
    const adapter = registry.getAdapter(url);
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe('wikimedia');
    expect(adapter?.isDownloadPermitted).toBe(true);
  });

  it('routes direct video URLs to DirectMediaAdapter', () => {
    const url = new URL('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
    const adapter = registry.getAdapter(url);
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe('direct-media');
    expect(adapter?.isDownloadPermitted).toBe(true);
  });

  it('routes YouTube URLs to UniversalMediaAdapter when active', () => {
    const url = new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const adapter = registry.getAdapter(url);
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe('universal');
    expect(adapter?.isDownloadPermitted).toBe(true);
  });

  it('routes TikTok URLs to UniversalMediaAdapter when active', () => {
    const url = new URL('https://www.tiktok.com/@user/video/1234567890');
    const adapter = registry.getAdapter(url);
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe('universal');
    expect(adapter?.isDownloadPermitted).toBe(true);
  });

  it('allows disabling an adapter dynamically', () => {
    const testRegistry = new AdapterRegistry();
    const url = new URL('https://archive.org/details/test');
    expect(testRegistry.getAdapter(url)).toBeDefined();

    testRegistry.setAdapterEnabled('internet-archive', false);
    expect(testRegistry.getAdapter(url)).toBeNull();

    testRegistry.setAdapterEnabled('internet-archive', true);
    expect(testRegistry.getAdapter(url)).toBeDefined();
  });
});
