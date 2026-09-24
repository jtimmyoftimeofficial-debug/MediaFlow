import React, { useState } from 'react';
import { Download, ShieldAlert, CheckCircle2, Film, User, Scale, Clock, Edit2, Folder } from 'lucide-react';
import type { MediaMetadata } from '@shared/types';

interface MediaPreviewCardProps {
  metadata: MediaMetadata;
  onStartDownload: (formatId: string, customTitle?: string) => Promise<void>;
  isStarting: boolean;
  downloadDir?: string;
  onOpenSettings?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Dynamic Stream';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const MediaPreviewCard: React.FC<MediaPreviewCardProps> = ({
  metadata,
  onStartDownload,
  isStarting,
  downloadDir,
  onOpenSettings
}) => {
  const [selectedFormatId, setSelectedFormatId] = useState<string>(
    metadata.formats[0]?.id || ''
  );
  const [customTitle, setCustomTitle] = useState(metadata.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const selectedFormat = metadata.formats.find(f => f.id === selectedFormatId) || metadata.formats[0];

  const handleDownload = () => {
    if (selectedFormat && !isStarting && metadata.permitted) {
      onStartDownload(selectedFormat.id, customTitle);
    }
  };

  return (
    <div className="glass-card">
      <div className="media-preview-grid">
        {/* Thumbnail or Icon Box */}
        <div className="thumbnail-box">
          {metadata.thumbnailUrl ? (
            <img
              src={metadata.thumbnailUrl}
              alt={metadata.title}
              className="thumbnail-img"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="thumbnail-fallback">
              <Film size={36} color="var(--accent-primary)" />
              <span>{metadata.platform} Video</span>
            </div>
          )}
        </div>

        {/* Media Details */}
        <div className="media-details">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-info">{metadata.platform}</span>
            {metadata.permitted ? (
              <span className="badge badge-success">
                <CheckCircle2 size={11} /> Permitted Stream
              </span>
            ) : (
              <span className="badge badge-warning">
                <ShieldAlert size={11} /> Restricted by Platform
              </span>
            )}
            {metadata.license && (
              <span className="badge badge-secondary" title={metadata.license}>
                <Scale size={11} /> {metadata.license.length > 25 ? metadata.license.slice(0, 25) + '...' : metadata.license}
              </span>
            )}
          </div>

          {/* Editable Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isEditingTitle ? (
              <input
                type="text"
                className="url-input-field"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                autoFocus
                style={{
                  background: 'var(--bg-input)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-focus)',
                  fontSize: '18px',
                  fontWeight: 600,
                  width: '100%'
                }}
              />
            ) : (
              <>
                <h3 className="media-title">{customTitle}</h3>
                {metadata.permitted && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIsEditingTitle(true)}
                    title="Edit filename title"
                    style={{ padding: '4px' }}
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>

          <div className="media-meta-row">
            {metadata.author && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <User size={13} /> {metadata.author}
              </span>
            )}
            {metadata.duration && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} /> {formatDuration(metadata.duration)}
              </span>
            )}
          </div>

          {metadata.description && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {metadata.description}
            </p>
          )}

          {/* Policy restriction banner */}
          {!metadata.permitted && (
            <div className="policy-banner warning">
              <ShieldAlert size={24} style={{ flexShrink: 0 }} />
              <div>
                <strong>Platform Policy Restriction</strong>
                <p style={{ marginTop: '4px' }}>
                  {metadata.policyMessage ||
                    'This platform does not provide an authorized public direct download method. MediaFlow strictly adheres to platform terms and does not circumvent access restrictions.'}
                </p>
              </div>
            </div>
          )}

          {/* Formats Selection */}
          {metadata.permitted && metadata.formats.length > 0 && (
            <div className="format-selection-group">
              <label className="format-selector-label">
                Select Quality & Container ({metadata.formats.length} available):
              </label>
              <div className="format-grid">
                {metadata.formats.map((format) => {
                  const isSelected = format.id === selectedFormatId;
                  return (
                    <button
                      key={format.id}
                      type="button"
                      className={`format-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedFormatId(format.id)}
                    >
                      <div className="format-name">{format.label}</div>
                      <div className="format-meta">
                        {formatBytes(format.filesize)}
                        {format.qualityNote ? ` • ${format.qualityNote}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Destination Folder Indicator & Picker */}
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '8px 12px', 
                  background: 'rgba(255, 255, 255, 0.03)', 
                  borderRadius: 'var(--radius-sm)', 
                  border: '1px solid var(--border-subtle)', 
                  marginTop: '12px',
                  fontSize: '12.5px' 
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                  <Folder size={14} color="var(--info)" />
                  <span>Saving to:</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 500, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {downloadDir || 'Downloads'}
                  </span>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onOpenSettings}
                    style={{ padding: '3px 8px', fontSize: '11.5px', color: 'var(--accent-primary)', height: 'auto' }}
                  >
                    Change Folder
                  </button>
                )}
              </div>

              <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDownload}
                  disabled={isStarting}
                  style={{ minWidth: '180px' }}
                >
                  <Download size={16} />
                  <span>{isStarting ? 'Preparing Stream...' : 'Download Video'}</span>
                </button>
                {selectedFormat && (
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    Target: {selectedFormat.container.toUpperCase()} • {formatBytes(selectedFormat.filesize)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
