import React from 'react';
import { History, Trash2, CheckCircle2, XCircle, AlertTriangle, FileVideo } from 'lucide-react';
import type { DownloadHistoryItem } from '@shared/types';

interface DownloadHistoryProps {
  history: DownloadHistoryItem[];
  onClear: () => Promise<void>;
  isClearing: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '--';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + d.toLocaleDateString();
  } catch {
    return isoString;
  }
}

export const DownloadHistory: React.FC<DownloadHistoryProps> = ({
  history,
  onClear,
  isClearing
}) => {
  return (
    <section className="glass-card history-section">
      <div className="history-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <History size={18} color="var(--accent-primary)" />
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Session Download History</h3>
          <span className="badge badge-secondary">{history.length} items</span>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClear}
            disabled={isClearing}
            title="Clear all session history"
            style={{ fontSize: '13px' }}
          >
            <Trash2 size={14} />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-dim)' }}>
          <FileVideo size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
          <p style={{ fontSize: '14px' }}>No downloads in this session yet.</p>
          <p style={{ fontSize: '12px', marginTop: '4px' }}>
            Completed downloads and their safe locations will appear here.
          </p>
        </div>
      ) : (
        <div className="history-list">
          {history.map((item) => (
            <div key={item.id} className="history-item">
              <div className="history-info">
                <span className="history-filename" title={item.filename}>
                  {item.filename}
                </span>
                <span className="history-meta">
                  {item.platform} • {formatBytes(item.fileSizeBytes)} • {formatDate(item.completedAt)}
                </span>
              </div>

              <div>
                {item.status === 'completed' && (
                  <span className="badge badge-success">
                    <CheckCircle2 size={11} /> Saved
                  </span>
                )}
                {item.status === 'failed' && (
                  <span className="badge badge-danger">
                    <XCircle size={11} /> Failed
                  </span>
                )}
                {item.status === 'cancelled' && (
                  <span className="badge badge-warning">
                    <AlertTriangle size={11} /> Cancelled
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
