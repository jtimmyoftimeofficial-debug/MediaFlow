import React from 'react';
import { Download, ShieldCheck, Folder, Sparkles, Sliders } from 'lucide-react';
import type { AppSettings, UpdateInfo } from '@shared/types';

interface HeaderProps {
  settings: AppSettings | null;
  onOpenPermittedUse: () => void;
  onOpenSettings: () => void;
  updateInfo: UpdateInfo | null;
}

export const Header: React.FC<HeaderProps> = ({ 
  settings, 
  onOpenPermittedUse, 
  onOpenSettings,
  updateInfo 
}) => {
  return (
    <header className="app-header">
      <div className="brand-wrapper">
        <div className="brand-logo-icon">
          <Download size={24} strokeWidth={2.4} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="brand-title">MediaFlow</h1>
            <span className="badge badge-success">
              <Sparkles size={11} /> Standalone
            </span>
          </div>
          <p className="brand-subtitle">
            Universal Social Media Video Downloader Desktop Application
          </p>
        </div>
      </div>

      <div className="header-actions">
        {settings && (
          <button 
            type="button"
            className="badge badge-info interactive-badge" 
            onClick={onOpenSettings}
            title={`Downloads saved to: ${settings.downloadDir}\nClick to change folder.`}
            style={{ 
              textTransform: 'none', 
              cursor: 'pointer',
              border: '1px solid var(--info-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px'
            }}
          >
            <Folder size={13} />
            <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {settings.downloadDir}
            </span>
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenSettings}
          aria-label="Open Settings and Preferences"
          style={{ position: 'relative' }}
        >
          <Sliders size={16} />
          <span>Settings</span>
          {updateInfo?.hasUpdate && (
            <span 
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-secondary)',
                boxShadow: '0 0 8px var(--accent-secondary)'
              }}
              title={`Update to ${updateInfo.latestVersion} available`}
            />
          )}
        </button>

        <button 
          type="button"
          className="btn btn-secondary" 
          onClick={onOpenPermittedUse}
          aria-label="View permitted use and legal boundaries"
        >
          <ShieldCheck size={16} />
          <span>Terms</span>
        </button>
      </div>
    </header>
  );
};
