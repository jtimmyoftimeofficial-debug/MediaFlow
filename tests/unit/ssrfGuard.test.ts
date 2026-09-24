import { describe, it, expect } from 'vitest';
import { validateUrlSafety, isPrivateOrRestrictedIp, SsrfBlockedError } from '../../server/security/ssrfGuard.js';

describe('SSRF Guard Security Tests', () => {
  describe('isPrivateOrRestrictedIp', () => {
    it('identifies loopback IPv4 addresses as restricted', () => {
      expect(isPrivateOrRestrictedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('127.0.1.10')).toBe(true);
    });

    it('identifies private RFC1918 subnets as restricted', () => {
      expect(isPrivateOrRestrictedIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('172.31.255.255')).toBe(true);
      expect(isPrivateOrRestrictedIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrRestrictedIp('192.168.100.50')).toBe(true);
    });

    it('identifies cloud metadata (169.254.169.254) as restricted', () => {
      expect(isPrivateOrRestrictedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrRestrictedIp('169.254.1.1')).toBe(true);
    });

    it('identifies IPv6 loopback and link-local as restricted', () => {
      expect(isPrivateOrRestrictedIp('::1')).toBe(true);
      expect(isPrivateOrRestrictedIp('fe80::1')).toBe(true);
      expect(isPrivateOrRestrictedIp('fc00::1')).toBe(true);
    });

    it('permits public routable IPv4 addresses', () => {
      expect(isPrivateOrRestrictedIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrRestrictedIp('1.1.1.1')).toBe(false);
      expect(isPrivateOrRestrictedIp('207.241.224.2')).toBe(false); // Archive.org
    });
  });

  describe('validateUrlSafety', () => {
    it('rejects unsupported protocols such as file: and ftp:', async () => {
      await expect(validateUrlSafety('file:///etc/passwd')).rejects.toThrow(SsrfBlockedError);
      await expect(validateUrlSafety('ftp://files.example.com/movie.mp4')).rejects.toThrow(SsrfBlockedError);
      await expect(validateUrlSafety('javascript:alert(1)')).rejects.toThrow(SsrfBlockedError);
    });

    it('rejects URLs with embedded credentials', async () => {
      await expect(validateUrlSafety('https://user:password@example.com/video.mp4')).rejects.toThrow(SsrfBlockedError);
    });

    it('rejects localhost and loopback targets', async () => {
      await expect(validateUrlSafety('http://localhost:3000/api')).rejects.toThrow(SsrfBlockedError);
      await expect(validateUrlSafety('http://127.0.0.1:8080/secret')).rejects.toThrow(SsrfBlockedError);
      await expect(validateUrlSafety('http://[::1]:8080/')).rejects.toThrow(SsrfBlockedError);
    });

    it('rejects internal and private hostnames', async () => {
      await expect(validateUrlSafety('http://service.local/video.mp4')).rejects.toThrow(SsrfBlockedError);
      await expect(validateUrlSafety('http://db.internal:5432/')).rejects.toThrow(SsrfBlockedError);
    });

    it('rejects cloud metadata IP directly', async () => {
      await expect(validateUrlSafety('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(SsrfBlockedError);
    });

    it('accepts safe public domain URLs', async () => {
      const parsed = await validateUrlSafety('https://archive.org/details/test-video');
      expect(parsed.hostname).toBe('archive.org');
    });
  });
});
