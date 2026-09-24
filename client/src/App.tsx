import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { UrlInputSection } from './components/UrlInputSection';
import { MediaPreviewCard } from './components/MediaPreviewCard';
import { DownloadProgressCard } from './components/DownloadProgressCard';
import { DownloadHistory } from './components/DownloadHistory';
import { PermittedUseModal } from './components/PermittedUseModal';
import type { 
  AppSettings, 
  PlatformAdapterInfo, 
  MediaMetadata, 
  DownloadProgress, 
  DownloadHistoryItem 
} from '@shared/types';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [platforms, setPlatforms] = useState<PlatformAdapterInfo[]>([]);
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectedMedia, setInspectedMedia] = useState<MediaMetadata | null>(null);

  const [activeProgress, setActiveProgress] = useState<DownloadProgress | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isPermittedUseOpen, setIsPermittedUseOpen] = useState(false);

  const progressIntervalRef = useRef<number | null>(null);

  // Load initial settings, platforms, and history
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(err => console.warn('Could not load settings:', err));

    fetch('/api/platforms')
      .then(res => res.json())
      .then(data => setPlatforms(data.platforms || []))
      .catch(err => console.warn('Could not load platforms:', err));

    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.warn('Could not load history:', err);
    }
  };

  // Inspect URL
  const handleInspect = async (url: string) => {
    setIsInspecting(true);
    setInspectError(null);
    setInspectedMedia(null);

    try {
      const res = await fetch('/api/media/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to inspect media URL.');
      }

      setInspectedMedia(data);
    } catch (err: any) {
      setInspectError(err.message || 'An unexpected error occurred while inspecting the URL.');
    } finally {
      setIsInspecting(false);
    }
  };

  // Start Streaming Download
  const handleStartDownload = async (formatId: string, customTitle?: string) => {
    if (!inspectedMedia) return;

    setIsStartingDownload(true);

    try {
      const res = await fetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inspectedMedia.url,
          formatId,
          customTitle
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start download stream.');
      }

      const jobId = data.jobId;
      const selectedFormat = inspectedMedia.formats.find(f => f.id === formatId);
      setActiveProgress({
        jobId,
        status: 'downloading',
        stage: data.stage || 'initializing',
        percent: 0,
        bytesDownloaded: 0,
        totalBytes: data.expectedSizeBytes || selectedFormat?.filesize || 0,
        speedBytesPerSec: 0,
        etaSeconds: 0,
        filename: data.title || 'video.mp4'
      });

      // Start responsive progress polling
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

      progressIntervalRef.current = window.setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/download/progress/${jobId}`);
          if (pollRes.ok) {
            const p: DownloadProgress = await pollRes.json();
            setActiveProgress(p);

            if (p.status === 'completed' || p.status === 'cancelled' || p.status === 'error') {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
              }
              loadHistory();
            }
          }
        } catch {
          // ignore transient poll errors
        }
      }, 250);
    } catch (err: any) {
      alert(`Could not start download: ${err.message}`);
    } finally {
      setIsStartingDownload(false);
    }
  };

  // Cancel Active Download
  const handleCancelDownload = async (jobId: string) => {
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/download/cancel/${jobId}`, {
        method: 'POST'
      });
      if (res.ok) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setActiveProgress(prev => prev ? { ...prev, status: 'cancelled', error: 'Download cancelled by user' } : null);
        loadHistory();
      }
    } catch (err: any) {
      console.error('Cancel error:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  // Clear Session History
  const handleClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      const res = await fetch('/api/history', { method: 'DELETE' });
      if (res.ok) {
        setHistory([]);
      }
    } catch (err: any) {
      console.error('Clear history error:', err);
    } finally {
      setIsClearingHistory(false);
    }
  };

  return (
    <div className="app-container">
      <Header
        settings={settings}
        onOpenPermittedUse={() => setIsPermittedUseOpen(true)}
      />

      <main style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* 1. URL Input & Platform quick examples */}
        <UrlInputSection
          onInspect={handleInspect}
          isLoading={isInspecting}
          error={inspectError}
          platforms={platforms}
        />

        {/* 2. Media Preview & Format selection */}
        {inspectedMedia && (
          <MediaPreviewCard
            metadata={inspectedMedia}
            onStartDownload={handleStartDownload}
            isStarting={isStartingDownload}
          />
        )}

        {/* 3. Active Download Progress Bar */}
        {activeProgress && (
          <DownloadProgressCard
            progress={activeProgress}
            onCancel={handleCancelDownload}
            isCancelling={isCancelling}
          />
        )}

        {/* 4. Session Download History */}
        <DownloadHistory
          history={history}
          onClear={handleClearHistory}
          isClearing={isClearingHistory}
        />
      </main>

      {/* Permitted Use & Terms Modal */}
      <PermittedUseModal
        isOpen={isPermittedUseOpen}
        onClose={() => setIsPermittedUseOpen(false)}
      />
    </div>
  );
};
