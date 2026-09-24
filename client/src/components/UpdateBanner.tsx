import React from 'react';
import { Sparkles, Download, X, ExternalLink } from 'lucide-react';
import type { UpdateInfo } from '@shared/types';

interface UpdateBannerProps {
  updateInfo: UpdateInfo;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  updateInfo,
  onOpenSettings,
  onDismiss
}) => {
  return (
    <aside 
      className="update-banner"
      aria-label="Software update notification"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 18px',
        background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.22) 50%, rgba(236, 72, 153, 0.22) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.35)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '16px',
        backdropFilter: 'blur(10px)',
        animation: 'slideDown 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ background: 'var(--accent-gradient)', borderRadius: '50%', padding: '5px', display: 'flex' }}>
          <Sparkles size={14} color="#fff" />
        </div>
        <div>
          <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-main)' }}>
            New Release Available: MediaFlow {updateInfo.latestVersion}
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            Upgrade for the latest extraction fixes, performance improvements, and features.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <a
          href={updateInfo.downloadUrl || updateInfo.releaseUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-primary"
          style={{ fontSize: '12px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <Download size={13} />
          <span>Download Installer</span>
        </a>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenSettings}
          style={{ fontSize: '12px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ExternalLink size={12} />
          <span>View Details</span>
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={onDismiss}
          style={{ padding: '5px', color: 'var(--text-dim)' }}
          aria-label="Dismiss update notification"
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
};
