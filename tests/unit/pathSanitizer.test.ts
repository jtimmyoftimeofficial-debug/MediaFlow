import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { sanitizeFilename, getSafeResolvedPath } from '../../server/security/pathSanitizer.js';

describe('Path Sanitizer & Traversal Defense', () => {
  describe('sanitizeFilename', () => {
    it('strips directory traversal attempts', () => {
      const result = sanitizeFilename('../../etc/passwd.mp4');
      expect(result).not.toContain('..');
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
      expect(result).toContain('passwd.mp4');
    });

    it('removes Windows and POSIX forbidden characters', () => {
      const malicious = 'video:title*with?"<>|characters.mp4';
      const result = sanitizeFilename(malicious);
      expect(result).not.toMatch(/[<>:"/\\|?*]/);
      expect(result.endsWith('.mp4')).toBe(true);
    });

    it('strips control characters and null bytes', () => {
      const malicious = 'video\x00\x1Ftest.mp4';
      const result = sanitizeFilename(malicious);
      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x1F');
    });

    it('preserves valid extensions and filenames', () => {
      expect(sanitizeFilename('nature_documentary.webm')).toBe('nature_documentary.webm');
      expect(sanitizeFilename('podcast_episode.mp3')).toBe('podcast_episode.mp3');
    });

    it('adds default extension if missing', () => {
      const result = sanitizeFilename('my_great_video');
      expect(result).toBe('my_great_video.mp4');
    });

    it('truncates excessively long titles to protect MAX_PATH', () => {
      const veryLong = 'a'.repeat(300) + '.mp4';
      const result = sanitizeFilename(veryLong);
      expect(result.length).toBeLessThanOrEqual(130);
      expect(result.endsWith('.mp4')).toBe(true);
    });

    it('handles Windows reserved filenames safely', () => {
      const resCon = sanitizeFilename('CON.mp4');
      expect(resCon).not.toBe('CON.mp4');
      expect(resCon.startsWith('video_')).toBe(true);

      const resNul = sanitizeFilename('NUL');
      expect(resNul.startsWith('video_')).toBe(true);
    });
  });

  describe('getSafeResolvedPath', () => {
    const testDir = path.resolve('./temp_test_downloads');

    it('confines output path strictly inside download directory', async () => {
      const resolved = await getSafeResolvedPath(testDir, 'sample_clip.mp4');
      const normalizedTestDir = testDir.endsWith(path.sep) ? testDir : testDir + path.sep;
      expect(resolved.startsWith(normalizedTestDir)).toBe(true);
    });

    it('neutralizes traversal attempts inside the destination', async () => {
      const resolved = await getSafeResolvedPath(testDir, '../../../../windows/system32/cmd.exe');
      const normalizedTestDir = testDir.endsWith(path.sep) ? testDir : testDir + path.sep;
      // Must reside within testDir and cannot escape to C:\windows
      expect(resolved.startsWith(normalizedTestDir)).toBe(true);
      expect(resolved.startsWith('C:\\windows')).toBe(false);
    });

    it('resolves collisions by appending increment numbers', async () => {
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      const file1 = path.join(testDir, 'collision_test.mp4');
      fs.writeFileSync(file1, 'dummy data');

      try {
        const resolved = await getSafeResolvedPath(testDir, 'collision_test.mp4', true);
        expect(resolved).toBe(path.join(testDir, 'collision_test (1).mp4'));
      } finally {
        if (fs.existsSync(file1)) fs.unlinkSync(file1);
        if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
      }
    });
  });
});
