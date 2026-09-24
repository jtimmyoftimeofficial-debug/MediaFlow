import { describe, it, expect } from 'vitest';
import { isVersionNewer } from '../../server/index.js';

describe('Update Checker Semver Comparison', () => {
  it('correctly detects newer patch versions', () => {
    expect(isVersionNewer('1.1.1', '1.1.0')).toBe(true);
    expect(isVersionNewer('v1.1.1', '1.1.0')).toBe(true);
    expect(isVersionNewer('1.1.1', 'v1.1.0')).toBe(true);
  });

  it('correctly detects newer minor and major versions', () => {
    expect(isVersionNewer('1.2.0', '1.1.0')).toBe(true);
    expect(isVersionNewer('2.0.0', '1.1.0')).toBe(true);
  });

  it('returns false for same versions', () => {
    expect(isVersionNewer('1.1.0', '1.1.0')).toBe(false);
    expect(isVersionNewer('v1.1.0', '1.1.0')).toBe(false);
    expect(isVersionNewer('1.1.0', 'v1.1.0')).toBe(false);
  });

  it('returns false for older versions', () => {
    expect(isVersionNewer('1.0.0', '1.1.0')).toBe(false);
    expect(isVersionNewer('v1.0.5', '1.1.0')).toBe(false);
    expect(isVersionNewer('0.9.9', '1.1.0')).toBe(false);
  });

  it('handles variations in component lengths', () => {
    expect(isVersionNewer('1.1.0.1', '1.1.0')).toBe(true);
    expect(isVersionNewer('1.1', '1.1.0')).toBe(false);
  });
});
