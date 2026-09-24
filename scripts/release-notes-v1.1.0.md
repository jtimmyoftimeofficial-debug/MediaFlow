## What's New in MediaFlow v1.1.0

### 📁 Custom Download Directory Selection
- **Choose Where to Save Downloads**: Customize your target save folder at any time directly in the new **Settings & Preferences** modal or right from the media preview card before downloading.
- **Native Windows Folder Browser Dialog**: Browse and pick any drive or folder on your computer with a single click using Windows' native folder picker.
- **Direct Explorer Access**: Quickly open your download folder in Windows File Explorer right from the app header or settings.
- **Persistent Preferences**: Your customized directory is automatically remembered across app restarts in `%LOCALAPPDATA%\MediaFlow\config.json`.

### 🔄 In-App GitHub Software Update Checker
- **Automated & Manual Update Checking**: MediaFlow automatically queries GitHub releases on startup, and includes an on-demand "Check for Updates" button in Settings.
- **One-Click Installer Download**: When a new release is available, an update banner and header badge appear, letting you download the latest installer with a single click and review changelog notes.
- **Accurate Semver Comparison**: Ensures you are only prompted when newer versions are published.

### 🖥️ Native Standalone Windows Desktop App
- Built into a dedicated desktop application with custom branding, desktop shortcut, bundled media extraction engines (`yt-dlp`, `ffmpeg`, `ffprobe`), and Visual C++ runtimes. Zero external software required.
