import type { MediaMetadata, MediaFormat, PlatformId } from '../../shared/types.js';

export class PlatformError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PlatformError';
  }
}

export class UnsupportedPlatformError extends PlatformError {
  constructor(url: string) {
    super(`No supported platform adapter available for: ${url}`, 'UNSUPPORTED_PLATFORM');
  }
}

export class PlatformPolicyError extends PlatformError {
  constructor(message: string) {
    super(message, 'PLATFORM_POLICY_RESTRICTION');
  }
}

export class MediaNotFoundError extends PlatformError {
  constructor(message = 'Media could not be found or is not publicly accessible') {
    super(message, 'MEDIA_NOT_FOUND');
  }
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  readonly name: string;
  readonly description: string;
  readonly supportedDomains: string[];
  readonly isDownloadPermitted: boolean;
  readonly policyNote: string;
  enabled: boolean;

  canHandle(url: URL): boolean;
  getMetadata(url: URL): Promise<MediaMetadata>;
  getAvailableFormats(url: URL, metadata: MediaMetadata): Promise<MediaFormat[]>;
  getStreamUrl(url: URL, formatId: string): Promise<string>;
}
