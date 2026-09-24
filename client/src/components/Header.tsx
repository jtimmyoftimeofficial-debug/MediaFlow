import React from 'react';
import { Download, ShieldCheck, Folder, Sparkles } from 'lucide-react';
import type { AppSettings } from '@shared/types';

interface HeaderProps {
  settings: AppSettings | null;
  onOpenPermittedUse: () => void;
}

export const Header: React.FC<HeaderProps> = ({ settings, onOpenPermittedUse }) => {
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
              <Sparkles size={11} /> Permitted
            </span>
          </div>
          <p className="brand-subtitle">
            Policy-Compliant & Authorized Social Media Video Downloader
          </p>
        </div>
      </div>

      <div className="header-actions">
        {settings && (
          <div 
            className="badge badge-info" 
            title={`Downloads are stored in: ${settings.downloadDir}`}
            style={{ textTransform: 'none', cursor: 'default' }}
          >
            <Folder size={12} />
            <span>{settings.downloadDir}</span>
          </div>
        )}
        <button 
          className="btn btn-secondary" 
          onClick={onOpenPermittedUse}
          aria-label="View permitted use and legal boundaries"
        >
          <ShieldCheck size={16} />
          <span>Permitted Use & Terms</span>
        </button>
      </div>
    </header>
  );
};
