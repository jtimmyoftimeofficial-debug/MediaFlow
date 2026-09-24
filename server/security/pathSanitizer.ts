import path from 'node:path';
import fs from 'node:fs';

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

const FORBIDDEN_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/g;
const MAX_BASE_FILENAME_LENGTH = 120;

/**
 * Sanitizes a title/name to be safe across Windows, Linux, and macOS filesystems.
 */
export function sanitizeFilename(rawName: string, defaultExt = 'mp4'): string {
  if (!rawName || typeof rawName !== 'string') {
    return `video_${Date.now()}.${defaultExt}`;
  }

  // Normalize Unicode
  let cleaned = rawName.normalize('NFC');

  // Strip path traversal indicators
  cleaned = cleaned.replace(/\.\./g, '_');

  // Replace invalid filesystem characters with an underscore
  cleaned = cleaned.replace(FORBIDDEN_CHARS_REGEX, '_');

  // Collapse multiple spaces into single space
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Strip leading and trailing periods, spaces, or slashes (invalid on Windows)
  cleaned = cleaned.replace(/^[. _]+|[. _]+$/g, '');

  // Separate extension if already present
  let baseName = cleaned;
  let ext = defaultExt.replace(/^\./, '').toLowerCase();

  const lastDotIndex = cleaned.lastIndexOf('.');
  if (lastDotIndex > 0 && lastDotIndex < cleaned.length - 1) {
    const candidateExt = cleaned.slice(lastDotIndex + 1).toLowerCase();
    // Check if the candidate extension is a legitimate video/audio container
    if (['mp4', 'webm', 'ogg', 'ogv', 'mp3', 'm4a', 'mkv', 'flv', 'mov'].includes(candidateExt)) {
      ext = candidateExt;
      baseName = cleaned.slice(0, lastDotIndex).trim();
    }
  }

  // Truncate baseName to avoid exceeding filesystem MAX_PATH limits
  if (baseName.length > MAX_BASE_FILENAME_LENGTH) {
    baseName = baseName.slice(0, MAX_BASE_FILENAME_LENGTH).trim();
  }

  // Ensure baseName is not empty or reserved Windows names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const reservedWindowsNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (!baseName || reservedWindowsNames.test(baseName)) {
    baseName = `video_${Date.now()}`;
  }

  return `${baseName}.${ext}`;
}

/**
 * Confirms that the target filename resides strictly within the configured download directory.
 * If file collision exists, safely appends an incremental counter (e.g. "title (1).mp4").
 */
export async function getSafeResolvedPath(
  downloadDir: string,
  filename: string,
  allowCollisionIncrement = true
): Promise<string> {
  const absoluteDir = path.resolve(downloadDir);

  // Ensure downloadDir exists
  if (!fs.existsSync(absoluteDir)) {
    await fs.promises.mkdir(absoluteDir, { recursive: true });
  }

  // Resolve target path
  const sanitized = sanitizeFilename(filename);
  const targetPath = path.resolve(absoluteDir, sanitized);

  // Strict path confinement check
  const dirWithSep = absoluteDir.endsWith(path.sep) ? absoluteDir : absoluteDir + path.sep;
  if (!targetPath.startsWith(dirWithSep) && targetPath !== absoluteDir) {
    throw new PathTraversalError('Path traversal detected: Attempted to write outside download directory.');
  }

  if (!allowCollisionIncrement || !fs.existsSync(targetPath)) {
    return targetPath;
  }

  // Handle collision by appending (1), (2), etc.
  const ext = path.extname(sanitized);
  const base = path.basename(sanitized, ext);
  let counter = 1;
  let candidatePath = targetPath;

  while (fs.existsSync(candidatePath) && counter < 1000) {
    const candidateName = `${base} (${counter})${ext}`;
    candidatePath = path.resolve(absoluteDir, candidateName);

    if (!candidatePath.startsWith(dirWithSep)) {
      throw new PathTraversalError('Path traversal detected during collision resolution.');
    }
    counter++;
  }

  return candidatePath;
}
