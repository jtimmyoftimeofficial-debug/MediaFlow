import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, DownloadCloud, StopCircle, Loader2, RefreshCw } from 'lucide-react';
import type { DownloadProgress } from '@shared/types';

interface DownloadProgressCardProps {
  progress: DownloadProgress;
  onCancel: (jobId: string) => Promise<void>;
  isCancelling: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '-- MB/s';
  const mb = bytesPerSec / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB/s`;
  }
  const kb = bytesPerSec / 1024;
  return `${kb.toFixed(1)} KB/s`;
}

export const DownloadProgressCard: React.FC<DownloadProgressCardProps> = ({
  progress,
  onCancel,
  isCancelling
}) => {
  const isDownloading = progress.status === 'downloading';
  const isCompleted = progress.status === 'completed';
  const isCancelled = progress.status === 'cancelled';
  const isError = progress.status === 'error';

  const isInitializing = isDownloading && (progress.stage === 'initializing' || progress.bytesDownloaded === 0);
  const isMerging = isDownloading && (progress.stage === 'merging' || progress.percent >= 98);

  return (
    <div className="progress-card">
      <div className="progress-header">
        <div className="progress-title-box">
          {isInitializing && <Loader2 size={22} className="spin" color="var(--accent-primary)" />}
          {!isInitializing && isMerging && <RefreshCw size={22} className="spin" color="var(--accent-primary)" />}
          {!isInitializing && !isMerging && isDownloading && <DownloadCloud size={22} color="var(--accent-primary)" />}
          {isCompleted && <CheckCircle size={22} color="var(--success)" />}
          {isCancelled && <AlertTriangle size={22} color="var(--warning)" />}
          {isError && <XCircle size={22} color="var(--danger)" />}

          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 600 }}>
              {isInitializing && 'Connecting & Preparing Stream...'}
              {!isInitializing && isMerging && 'Merging Media Streams (FFmpeg)...'}
              {!isInitializing && !isMerging && isDownloading && 'Downloading Media Stream...'}
              {isCompleted && 'Download Completed!'}
              {isCancelled && 'Download Cancelled'}
              {isError && 'Download Failed'}
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {isInitializing && 'Negotiating stream authorization tokens with platform...'}
              {!isInitializing && isMerging && 'Muxing high-definition video track with audio track...'}
              {!isInitializing && !isMerging && progress.filename}
              {(isCompleted || isCancelled || isError) && progress.filename}
            </p>
          </div>
        </div>

        <div>
          {isDownloading && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onCancel(progress.jobId)}
              disabled={isCancelling}
              title="Cancel streaming and delete partial file"
            >
              <StopCircle size={15} />
              <span>{isCancelling ? 'Cancelling...' : 'Cancel'}</span>
            </button>
          )}
          {isCompleted && (
            <span className="badge badge-success">Saved to Downloads</span>
          )}
          {isCancelled && (
            <span className="badge badge-warning">Partial File Cleaned Up</span>
          )}
          {isError && (
            <span className="badge badge-danger">Stream Error</span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar-container">
        <div
          className={`progress-bar-fill ${isInitializing ? 'indeterminate' : ''}`}
          style={{
            width: isCompleted ? '100%' : isInitializing ? undefined : `${Math.max(3, progress.percent)}%`,
            background: isCompleted ? 'var(--success)' : isError ? 'var(--danger)' : undefined
          }}
        />
      </div>

      {/* Stats Row */}
      <div className="progress-stats-row">
        <span>
          <strong>{progress.percent}%</strong>
          {progress.totalBytes > 0 && (
            <span> ({formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.totalBytes)})</span>
          )}
          {progress.totalBytes <= 0 && progress.bytesDownloaded > 0 && (
            <span> ({formatBytes(progress.bytesDownloaded)})</span>
          )}
        </span>

        {isDownloading && (
          <div style={{ display: 'flex', gap: '16px' }}>
            {isInitializing && <span>Preparing stream...</span>}
            {!isInitializing && isMerging && <span>Finalizing remux...</span>}
            {!isInitializing && !isMerging && (
              <>
                <span>Speed: {formatSpeed(progress.speedBytesPerSec)}</span>
                {progress.etaSeconds > 0 && (
                  <span>ETA: {progress.etaSeconds}s</span>
                )}
              </>
            )}
          </div>
        )}

        {isError && (
          <span style={{ color: 'var(--danger)' }}>{progress.error}</span>
        )}

        {isCompleted && progress.destinationPath && (
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            Path: {progress.destinationPath}
          </span>
        )}
      </div>
    </div>
  );
};
