import React, { useState } from 'react';
import { 
  X, 
  Folder, 
  FolderOpen, 
  RefreshCw, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink, 
  Sliders, 
  FileText,
  Sparkles
} from 'lucide-react';
import type { AppSettings, UpdateInfo } from '@shared/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  onUpdateSettings: (newSettings: AppSettings) => void;
  updateInfo: UpdateInfo | null;
  isCheckingUpdate: boolean;
  onCheckForUpdates: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  updateInfo,
  isCheckingUpdate,
  onCheckForUpdates
}) => {
  const [customDir, setCustomDir] = useState(settings?.downloadDir || '');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Sync state if settings prop changes
  React.useEffect(() => {
    if (settings?.downloadDir) {
      setCustomDir(settings.downloadDir);
    }
  }, [settings?.downloadDir]);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    setIsBrowsing(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/settings/browse-folder', { method: 'POST' });
      const data = await res.json();
      if (data.selectedDir) {
        setCustomDir(data.selectedDir);
        if (settings) {
          onUpdateSettings({ ...settings, downloadDir: data.selectedDir });
        }
        setSaveStatus('Folder updated successfully!');
      }
    } catch (err: any) {
      console.error('Failed to browse folder:', err);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleOpenFolder = async () => {
    setIsOpeningFolder(true);
    try {
      await fetch('/api/settings/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: customDir })
      });
    } catch (err: any) {
      console.error('Failed to open folder:', err);
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const handleSaveManualDir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDir.trim()) return;

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadDir: customDir.trim() })
      });
      const data = await res.json();
      if (res.ok && data.settings) {
        onUpdateSettings(data.settings);
        setSaveStatus('Download directory saved!');
      } else {
        setSaveStatus(data.error || 'Failed to update folder');
      }
    } catch (err: any) {
      setSaveStatus(err.message || 'Error updating directory');
    }
  };

  const handlePresetSelect = (presetName: string) => {
    let presetPath = '';
    const userProfile = 'C:\\Users\\User'; // default fallback pattern
    if (presetName === 'Downloads') {
      presetPath = `${userProfile}\\Downloads`;
    } else if (presetName === 'Videos') {
      presetPath = `${userProfile}\\Videos`;
    } else if (presetName === 'Desktop') {
      presetPath = `${userProfile}\\Desktop`;
    }

    if (presetPath) {
      setCustomDir(presetPath);
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadDir: presetPath })
      })
        .then(res => res.json())
        .then(data => {
          if (data.settings) onUpdateSettings(data.settings);
          setSaveStatus(`Saved to ${presetName}`);
        })
        .catch(() => {});
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sliders size={22} color="var(--accent-primary)" />
            <h3 id="settings-title" style={{ fontSize: '18px' }}>
              Settings & Preferences
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* 1. Download Folder Section */}
          <div className="settings-card" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Folder size={18} color="var(--info)" />
              <h4 style={{ margin: 0, fontSize: '15px' }}>Download Storage Location</h4>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Choose the directory on your computer where downloaded media files will be saved.
            </p>

            <form onSubmit={handleSaveManualDir} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="input-field"
                  value={customDir}
                  onChange={(e) => setCustomDir(e.target.value)}
                  placeholder="e.g. C:\Users\User\Downloads"
                  style={{ flex: 1, fontSize: '13px' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleBrowseFolder}
                  disabled={isBrowsing}
                  title="Choose folder in Windows dialog"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <FolderOpen size={16} />
                  <span>{isBrowsing ? 'Selecting...' : 'Browse...'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => handlePresetSelect('Downloads')}
                  >
                    Downloads
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => handlePresetSelect('Videos')}
                  >
                    Videos
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => handlePresetSelect('Desktop')}
                  >
                    Desktop
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleOpenFolder}
                  disabled={isOpeningFolder}
                  style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}
                  title="Open folder in File Explorer"
                >
                  <FolderOpen size={14} style={{ marginRight: '4px' }} />
                  <span>Open in Explorer</span>
                </button>
              </div>

              {saveStatus && (
                <div style={{ fontSize: '12.5px', color: saveStatus.includes('success') || saveStatus.includes('Saved') ? 'var(--success)' : 'var(--warning)', marginTop: '4px' }}>
                  {saveStatus}
                </div>
              )}
            </form>
          </div>

          {/* 2. Software Updates Section */}
          <div className="settings-card" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="var(--accent-secondary)" />
                <h4 style={{ margin: 0, fontSize: '15px' }}>Software Updates</h4>
              </div>
              <span className="badge badge-info" style={{ fontSize: '11px', textTransform: 'none' }}>
                v{settings?.version || '1.1.0'}
              </span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Check for new releases, performance improvements, and feature updates on GitHub.
            </p>

            {updateInfo?.hasUpdate ? (
              <div style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-secondary)', fontWeight: 600, fontSize: '14px' }}>
                  <AlertCircle size={18} />
                  <span>A new version ({updateInfo.latestVersion}) is available!</span>
                </div>
                {updateInfo.releaseNotes && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', maxHeight: '90px', overflowY: 'auto' }}>
                    {updateInfo.releaseNotes.slice(0, 200)}...
                  </div>
                )}
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                  <a
                    href={updateInfo.downloadUrl || updateInfo.releaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                    style={{ fontSize: '12.5px', padding: '6px 14px' }}
                  >
                    <Download size={14} style={{ marginRight: '6px' }} />
                    <span>Download Installer ({updateInfo.latestVersion})</span>
                  </a>
                  <a
                    href={updateInfo.releaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '12.5px', padding: '6px 12px' }}
                  >
                    <ExternalLink size={13} style={{ marginRight: '4px' }} />
                    <span>Release Notes</span>
                  </a>
                </div>
              </div>
            ) : updateInfo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '13px', marginBottom: '12px' }}>
                <CheckCircle size={16} />
                <span>You are running the latest version of MediaFlow (v{settings?.version || '1.1.0'}).</span>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCheckForUpdates}
                disabled={isCheckingUpdate}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={15} className={isCheckingUpdate ? 'spin' : ''} />
                <span>{isCheckingUpdate ? 'Checking GitHub...' : 'Check for Updates'}</span>
              </button>

              <a
                href="https://github.com/jtimmyoftimeofficial-debug/MediaFlow/releases"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                style={{ fontSize: '13px', color: 'var(--text-muted)' }}
              >
                <ExternalLink size={14} style={{ marginRight: '4px' }} />
                <span>All Releases</span>
              </a>
            </div>
          </div>

          {/* 3. System & Logs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid var(--border-subtle)', fontSize: '12.5px', color: 'var(--text-dim)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={14} />
              <span>MediaFlow Desktop Native Application</span>
            </div>
            <a
              href="https://github.com/jtimmyoftimeofficial-debug/MediaFlow"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <span>GitHub</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
