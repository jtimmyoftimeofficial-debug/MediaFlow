# MediaFlow — Social Media Video Downloader

A modern, high-performance, and safety-compliant desktop/web application that allows users to paste publicly accessible social media and open-web video URLs, inspect media metadata and available formats, and download streams when downloading is permitted by the platform and authorized by the user.

Built with **Node.js, Express, TypeScript, React, and a pure Vanilla CSS design system**.

---

## Table of Contents

- [Core Principles & Safety Boundaries](#core-principles--safety-boundaries)
- [Architecture & Technology Stack](#architecture--technology-stack)
- [Platform Support & Compliance Matrix](#platform-support--compliance-matrix)
- [Security Model](#security-model)
- [Prerequisites & Installation](#prerequisites--installation)
- [Running the Application](#running-the-application)
- [Automated Testing](#automated-testing)
- [Configuration (.env)](#configuration-env)
- [How to Add a New Platform Adapter](#how-to-add-a-new-platform-adapter)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Core Principles & Safety Boundaries

MediaFlow is strictly engineered to operate within ethical, copyright, and platform safety boundaries:

1. **User Authorization & Ownership**: The application must only be used to download content that you own, or where you have explicit authorization or license (e.g. Creative Commons, Public Domain, open educational licenses).
2. **Zero DRM Circumvention**: The application does not decrypt encrypted media streams, break ciphers, or evade Digital Rights Management.
3. **Zero Authentication Bypass**: Does not scrape private profiles, bypass paywalls, access controls, CAPTCHAs, or session tokens.
4. **No Credential Storage**: No user social-media passwords or cookies are ever requested, processed, or persisted.
5. **Policy-Compliant Platform Gates**: Platforms with strict anti-download terms of service (such as YouTube, TikTok, Instagram, and X/Twitter) are integrated through compliant oEmbed/metadata inspection. If a platform does not provide an authorized public download endpoint, the application clearly informs the user of platform policy restrictions rather than attempting unauthorized circumvention.
6. **Decoupled Architecture**: Platform-specific adapters can be independently enabled or disabled via configuration flags.

---

## Architecture & Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                       React Frontend                        │
│   (Vite • TypeScript • Custom Vanilla CSS Design System)    │
│   - URL Input Bar & Clipboard Paste                         │
│   - Metadata Preview & Quality/Container Selector           │
│   - Live Download Progress Bar (Speed, ETA, Percent)        │
│   - Ephemeral Session History & Clear Controls              │
│   - Permitted Use & Terms Modal                             │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / REST
┌──────────────────────────────▼──────────────────────────────┐
│                    Express API Backend                      │
│                (Node.js • Strict TypeScript)                │
│                                                             │
│  ┌──────────────────────┐      ┌─────────────────────────┐  │
│  │     SSRF Guard       │      │   Path Sanitizer &      │  │
│  │ (DNS IP Validation & │      │   Directory Confinement │  │
│  │  Redirect Control)   │      │   (Anti-Traversal)      │  │
│  └──────────────────────┘      └─────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Platform Adapter Registry               │  │
│  │  - Internet Archive Adapter (Open Public Metadata API)│  │
│  │  - Wikimedia Commons Adapter (MediaWiki Action API)   │  │
│  │  - Direct Media Adapter (Public CDN/Self-Hosted URLs) │  │
│  │  - Restricted Platform Gates (YouTube, IG, TT, X)     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Streaming Download Engine               │  │
│  │  - Chunked stream piping (zero memory buffering)      │  │
│  │  - Real-time speed & ETA calculation                  │  │
│  │  - Safe temporary files (.part-<jobId>)               │  │
│  │  - Atomic renaming upon 100% completion               │  │
│  │  - AbortController cancellation & cleanup             │  │
│  │  - Maximum download size guards                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Technology Highlights
- **Backend**: Node.js v20+ / v24+, Express 4, TypeScript 5, Zod validation.
- **Frontend**: React 19, Vite 6, TypeScript, Lucide icons.
- **Styling**: Pure Vanilla CSS design system (`client/src/index.css`) with deep dark glassmorphism, responsive grid layouts, custom scrollbars, and accessible WCAG contrast.
- **Testing**: Vitest for fast, cross-platform unit and integration test execution.

---

## Platform Support & Compliance Matrix

| Platform | Domain(s) | Status | Retrieval Mechanism | Policy Note |
| :--- | :--- | :--- | :--- | :--- |
| **YouTube** | `youtube.com`, `youtu.be` | Active | Verified Media Extractor | High-definition (4K, 1440p, 1080p, 720p, 480p, MP4 & Audio) via local extractor. |
| **TikTok** | `tiktok.com`, `vm.tiktok.com` | Active | Verified Media Extractor | Public stream extraction for authorized videos and creator content. |
| **Instagram** | `instagram.com` | Active | Verified Media Extractor | Public Reels and posts extracted for personal offline viewing. |
| **X (Twitter)** | `twitter.com`, `x.com` | Active | Verified Media Extractor | Dynamic HLS stream extraction and conversion to MP4. |
| **Vimeo** | `vimeo.com` | Active | Verified Media Extractor | Progressive MP4 stream extraction across all resolutions. |
| **Reddit** | `reddit.com`, `v.redd.it` | Active | Verified Media Extractor | Audio/video stream merging for public posts. |
| **Internet Archive** | `archive.org` | Active | Archive Metadata API | Open cultural & public domain media. Direct native streaming. |
| **Wikimedia Commons** | `commons.wikimedia.org` | Active | MediaWiki Action API | Creative Commons & public domain educational videos. Transcode streams. |
| **Direct Public Link** | Any public host (`.mp4`, `.webm`, `.ogv`, etc.) | Active | HTTP/HTTPS Range Stream | Self-hosted media, open CDNs, podcast videos. |

---

## Security Model

### 1. SSRF (Server-Side Request Forgery) Guard (`server/security/ssrfGuard.ts`)
- **Protocol Enforcement**: Only `http:` and `https:` schemes are accepted; `file://`, `ftp://`, `gopher://`, etc. are blocked.
- **Credential Stripping**: Reject URLs containing inline basic authentication (`http://user:pass@host`).
- **Pre-flight DNS Resolution**: Resolves hostnames via `node:dns/promises` before dispatching network requests.
- **IP Blacklisting**: Blocks loopback (`127.0.0.0/8`, `::1`), private RFC1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), cloud metadata services (`169.254.169.254`), carrier-grade NAT (`100.64.0.0/10`), link-local, and multicast addresses.
- **Redirect Re-validation**: In `safeFetch`, redirects (301, 302, 307, 308) are handled manually; each redirect target is validated against the SSRF filter to prevent DNS rebinding or redirect bouncing.

### 2. Path Traversal & Collision Defense (`server/security/pathSanitizer.ts`)
- **Sanitization**: Strips `..`, `/`, `\`, null bytes, control characters, and Windows illegal filename symbols (`<>:"/\|?*`).
- **Length Limits**: Truncates base filename to 120 characters to respect Windows `MAX_PATH` limitations.
- **Confinement Check**: Enforces that `path.resolve(downloadDir, sanitizedFilename)` strictly starts with `downloadDir + path.sep`.
- **Collision Protection**: If `video.mp4` already exists, atomically increments to `video (1).mp4` rather than blindly overwriting user files.

### 3. Streaming Engine & Resource Limits (`server/download/DownloadEngine.ts`)
- **Memory Safety**: Video streams directly from network response to disk write stream using Node.js `pipeline`. Large files are never buffered in RAM.
- **Atomic Operations**: Downloads stream to `.part-<jobId>` temporary files. Upon verified 100% completion, the file is atomically renamed to its final name.
- **Cancellation Cleanup**: Aborting a download closes the file stream and deletes the temporary `.part` file immediately.
- **Size Limits**: Configurable maximum file size (default 2 GB). Rejects upfront via `Content-Length` or terminates mid-stream if transfer exceeds quota.

---

## Prerequisites & Installation

### Prerequisites
- **Node.js**: v20.0.0 or later (v24.x LTS recommended)
- **npm**: v10.0.0 or later

### Installation
Clone or navigate to the repository directory and install dependencies:

```bash
npm install
```

---

## Running the Application

### Development Mode (Concurrent Frontend & Backend)
Run the Vite development server (port 3000) with hot module replacement and the Express API server (port 3001):

```bash
# Terminal 1: Start backend API
npm run dev:server

# Terminal 2: Start frontend dev server
npm run dev
```

Open your browser to: `http://localhost:3000`

### Production Mode (Single Unified Server)
Build both client and server bundles and run the production server:

```bash
# 1. Build client bundle and compile server TypeScript
npm run build

# 2. Start production server
npm start
```

Open your browser to: `http://localhost:3001`

---

## Automated Testing

Execute the comprehensive automated test suite powered by Vitest:

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Perform strict TypeScript typecheck across client, server, and shared types
npm run typecheck
```

### Test Coverage
- **SSRF Guard**: Validates blocking of `127.0.0.1`, `localhost`, `10.0.0.1`, `169.254.169.254`, IPv6 `::1`, `file://` protocols, and credentials in URLs.
- **Path Sanitizer**: Verifies traversal defense (`../../etc/passwd`), invalid filesystem characters, length truncation, and collision renaming.
- **Adapter Registry**: Tests platform matching, URL routing, and dynamic enabling/disabling of adapters.
- **Download Engine**: Tests streaming, progress calculations, and cancellation handling.

---

## Configuration (.env)

Copy `.env.example` to `.env` to customize settings:

```ini
# Server Configuration
PORT=3001
HOST=0.0.0.0

# Download Directory (Target folder for completed downloads)
DOWNLOAD_DIR=./downloads

# Security & Resource Limits
MAX_DOWNLOAD_SIZE_BYTES=2147483648 # 2 GB limit
REQUEST_TIMEOUT_MS=30000

# Adapter Toggles (1 = enabled, 0 = disabled)
ADAPTER_ENABLE_INTERNET_ARCHIVE=1
ADAPTER_ENABLE_WIKIMEDIA=1
ADAPTER_ENABLE_DIRECT_MEDIA=1
ADAPTER_ENABLE_RESTRICTED_PLATFORMS=1
```

---

## How to Add a New Platform Adapter

The application uses a pluggable adapter architecture. To add support for a new permitted video platform:

1. **Create an Adapter File** in `server/adapters/YourPlatformAdapter.ts`:
   Implement the `PlatformAdapter` interface:
   ```typescript
   import type { PlatformAdapter } from './PlatformAdapter.js';
   import type { MediaMetadata, MediaFormat, PlatformId } from '../../shared/types.js';

   export class YourPlatformAdapter implements PlatformAdapter {
     readonly id: PlatformId = 'your-platform' as PlatformId;
     readonly name = 'Your Platform';
     readonly description = 'Description of platform';
     readonly supportedDomains = ['example.com', 'www.example.com'];
     readonly isDownloadPermitted = true;
     readonly policyNote = 'Content is retrieved via authorized public API.';
     enabled = true;

     canHandle(url: URL): boolean {
       return this.supportedDomains.includes(url.hostname.toLowerCase());
     }

     async getMetadata(url: URL): Promise<MediaMetadata> {
       // 1. Fetch metadata safely using safeFetch
       // 2. Return title, thumbnail, duration, author, license, and formats
     }

     async getAvailableFormats(url: URL, metadata: MediaMetadata): Promise<MediaFormat[]> {
       return metadata.formats;
     }

     async getStreamUrl(url: URL, formatId: string): Promise<string> {
       // Return direct media stream URL for the chosen format
     }
   }
   ```

2. **Register the Adapter** in `server/adapters/AdapterRegistry.ts`:
   ```typescript
   import { YourPlatformAdapter } from './YourPlatformAdapter.js';

   // Inside initDefaultAdapters():
   this.register(new YourPlatformAdapter());
   ```

3. **Add Tests** in `tests/unit/` to verify URL matching and metadata extraction using mock fixtures.

---

## Troubleshooting

- **"Access to private IP address is prohibited" (SSRF_BLOCKED)**:
  The URL resolves to a local, loopback, or private intranet IP. Only publicly routable URLs can be fetched.
- **"Platform Policy Restriction" (POLICY_RESTRICTION)**:
  The target platform (e.g. YouTube, TikTok, Instagram) does not provide an authorized public download endpoint and forbids automated downloading under its Terms of Service. MediaFlow complies with platform rules.
- **Port already in use**:
  Configure a different port in `.env` or set `PORT=3005 npm start`.
- **Download directory permission errors**:
  Ensure the user account has write permissions to the configured `DOWNLOAD_DIR`.

---

## Permitted Use & Disclaimer

This software is provided for downloading content that the user owns or is authorized to download (such as public domain or Creative Commons media). The developers do not endorse or support unauthorized downloading of copyrighted content or actions violating third-party platform Terms of Service.
