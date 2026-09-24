import dns from 'node:dns/promises';
import net from 'node:net';

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(p => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 treated as unsafe
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 - Current network
  if (a === 0) return true;

  // 10.0.0.0/8 - Private network
  if (a === 10) return true;

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;

  // 100.64.0.0/10 - Shared address space (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 169.254.0.0/16 - Link-local (Cloud metadata e.g. 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 - Private network
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 - IETF protocol assignments
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 - Documentation (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.168.0.0/16 - Private network
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 - Network benchmark tests
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 - Documentation (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 - Documentation (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 - Multicast
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 - Reserved for future use
  if (a >= 240) return true;

  // 255.255.255.255 - Broadcast
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, link-local, or unique-local range.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 - Loopback
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // :: - Unspecified
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 (::ffff:192.0.2.1)
  if (normalized.startsWith('::ffff:') || normalized.startsWith('0:0:0:0:0:ffff:')) {
    const ipv4Part = normalized.split(':').pop();
    if (ipv4Part && net.isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  // fe80::/10 - Link-local
  if (/^fe[89ab][0-9a-f]/i.test(normalized)) return true;

  // fc00::/7 - Unique local address (ULA)
  if (/^f[cd][0-9a-f]{2}/i.test(normalized)) return true;

  // ff00::/8 - Multicast
  if (/^ff[0-9a-f]{2}/i.test(normalized)) return true;

  return false;
}

/**
 * Validates whether an IP address is publicly routable.
 */
export function isPrivateOrRestrictedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  return true;
}

/**
 * Validates a URL for SSRF protection:
 * - Only http/https
 * - No credentials in URL
 * - DNS resolution checks that resolved IPs are not local/private
 */
export async function validateUrlSafety(inputUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new SsrfBlockedError('Malformed or invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`Unsupported URL protocol: "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError('URLs containing user authentication credentials are not permitted');
  }

  const hostname = parsed.hostname.trim();
  if (!hostname) {
    throw new SsrfBlockedError('URL must contain a valid hostname');
  }

  // Reject literal "localhost" or obvious aliases
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new SsrfBlockedError(`Access to local or private host "${hostname}" is prohibited.`);
  }

  // If hostname is already a direct IP address
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      throw new SsrfBlockedError(`Access to private IP address ${hostname} is prohibited.`);
    }
    return parsed;
  }

  // Resolve hostname via DNS
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new SsrfBlockedError(`Could not resolve hostname "${hostname}"`);
    }

    for (const record of addresses) {
      if (isPrivateOrRestrictedIp(record.address)) {
        throw new SsrfBlockedError(`Resolved address ${record.address} for host "${hostname}" is in a private or restricted network range.`);
      }
    }
  } catch (err: any) {
    if (err instanceof SsrfBlockedError) throw err;
    throw new SsrfBlockedError(`DNS resolution failed for "${hostname}": ${err.message}`);
  }

  return parsed;
}

/**
 * Safe fetch wrapper that enforces SSRF checks across all redirect hops.
 */
export async function safeFetch(
  url: string | URL,
  options: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let currentUrl = typeof url === 'string' ? url : url.toString();
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const validated = await validateUrlSafety(currentUrl);

    // Fetch with manual redirect to inspect each redirect target
    const fetchOptions: RequestInit = {
      ...options,
      redirect: 'manual'
    };

    const response = await fetch(validated.toString(), fetchOptions);

    // Handle redirects manually to prevent SSRF bypass via 301/302 redirects
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect response missing Location header');
      }

      currentUrl = new URL(location, validated.toString()).toString();
      redirects++;
      continue;
    }

    return response;
  }

  throw new Error(`Exceeded maximum redirect limit (${maxRedirects})`);
}
