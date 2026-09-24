import React, { useState } from 'react';
import { Clipboard, X, Loader2, ArrowRight, Globe, AlertCircle, Layers } from 'lucide-react';
import type { PlatformAdapterInfo } from '@shared/types';

interface UrlInputSectionProps {
  onInspect: (url: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  platforms: PlatformAdapterInfo[];
}

export const UrlInputSection: React.FC<UrlInputSectionProps> = ({
  onInspect,
  isLoading,
  error,
  platforms
}) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim() && !isLoading) {
      onInspect(url.trim());
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch {
      // Clipboard read permission might be denied
    }
  };

  const handleClear = () => {
    setUrl('');
  };

  const handleQuickLoad = (sampleUrl: string) => {
    setUrl(sampleUrl);
    onInspect(sampleUrl);
  };

  return (
    <section>
      <div className="hero-intro">
        <h2 className="hero-heading">
          Download <span>Permitted & Open</span> Media Streams
        </h2>
        <p className="hero-description">
          Paste any publicly accessible video URL. MediaFlow verifies ownership permissions, platform safety terms, and provides high-speed streaming downloads.
        </p>
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <form onSubmit={handleSubmit}>
          <div className="url-input-container">
            <div className="url-input-icon">
              <Globe size={18} />
            </div>
            <input
              type="url"
              className="url-input-field"
              placeholder="Paste a video URL (e.g. https://archive.org/details/..., https://commons.wikimedia.org/...)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              required
            />
            {url && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleClear}
                aria-label="Clear URL"
                title="Clear input"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePaste}
              disabled={isLoading}
              title="Paste from clipboard"
            >
              <Clipboard size={15} />
              <span>Paste</span>
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!url.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Inspecting...</span>
                </>
              ) : (
                <>
                  <span>Inspect Media</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="policy-banner danger" style={{ marginTop: '16px' }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div>
              <strong>Error inspecting media</strong>
              <p style={{ marginTop: '4px', fontSize: '13px' }}>{error}</p>
            </div>
          </div>
        )}

        {/* Quick test links */}
        <div className="platform-chips-container">
          <span className="platform-chips-label">Quick Test Links:</span>
          <button
            type="button"
            className="platform-chip"
            onClick={() => handleQuickLoad('https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm')}
            title="Wikimedia Commons open-source creative commons video"
          >
            Wikimedia: Big Buck Bunny (4K)
          </button>
          <button
            type="button"
            className="platform-chip"
            onClick={() => handleQuickLoad('https://archive.org/details/electricsheep-flock-244-7500-1')}
            title="Internet Archive open culture public video"
          >
            Archive.org: Electric Sheep
          </button>
          <button
            type="button"
            className="platform-chip"
            onClick={() => handleQuickLoad('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4')}
            title="Direct open CDN sample video link"
          >
            Direct MP4 Stream
          </button>
          <button
            type="button"
            className="platform-chip"
            onClick={() => handleQuickLoad('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
            title="Download YouTube video stream in chosen resolution"
          >
            YouTube Video (4K/1080p/MP4)
          </button>
        </div>

        {/* Supported Platforms status summary */}
        {platforms.length > 0 && (
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Layers size={12} /> Registered Adapters:
            </span>
            {platforms.map(p => (
              <span 
                key={p.id}
                className={`badge ${p.status === 'active' ? 'badge-success' : p.status === 'restricted_policy' ? 'badge-warning' : 'badge-danger'}`}
                style={{ fontSize: '10px', padding: '2px 7px' }}
                title={p.policyNote}
              >
                {p.name} {p.status === 'active' ? '✓' : '🔒'}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
