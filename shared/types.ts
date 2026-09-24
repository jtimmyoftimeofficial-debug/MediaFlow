export type PlatformId = 
  | 'internet-archive' 
  | 'wikimedia' 
  | 'direct-media' 
  | 'vimeo'
  | 'youtube' 
  | 'instagram' 
  | 'tiktok' 
  | 'twitter'
  | 'unknown';

export interface MediaFormat {
  id: string;
  label: string;
  container: string;
  resolution?: string;
  filesize?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  downloadUrl?: string;
  qualityNote?: string;
}

export interface MediaMetadata {
  url: string;
  platform: string;
  platformId: PlatformId;
  title: string;
  author?: string;
  description?: string;
  duration?: number; // duration in seconds
  thumbnailUrl?: string;
  license?: string;
  permitted: boolean; // whether downloading is permitted
  policyMessage?: string; // friendly message explaining policy if restricted
  formats: MediaFormat[];
}

export type DownloadJobStatus = 'queued' | 'downloading' | 'completed' | 'cancelled' | 'error';
export type DownloadStage = 'initializing' | 'downloading' | 'merging' | 'completed' | 'cancelled' | 'error';

export interface DownloadProgress {
  jobId: string;
  status: DownloadJobStatus;
  stage?: DownloadStage;
  percent: number; // 0 - 100
  bytesDownloaded: number;
  totalBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  filename: string;
  destinationPath?: string;
  error?: string;
}

export interface DownloadHistoryItem {
  id: string;
  url: string;
  title: string;
  platform: string;
  filename: string;
  fileSizeBytes: number;
  completedAt: string;
  status: 'completed' | 'failed' | 'cancelled';
}

export interface PlatformAdapterInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  supportedDomains: string[];
  status: 'active' | 'restricted_policy' | 'disabled';
  policyNote: string;
}

export interface InspectRequest {
  url: string;
}

export interface StartDownloadRequest {
  url: string;
  formatId: string;
  customFilename?: string;
  destinationDir?: string;
}

export interface AppSettings {
  downloadDir: string;
  maxDownloadSizeBytes: number;
  version: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  downloadUrl?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
}
