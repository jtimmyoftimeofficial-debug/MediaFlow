# Build MediaFlow Standalone Native Windows Application Installer
$ErrorActionPreference = "Stop";

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Building MediaFlow Standalone Windows Desktop  " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Build application bundles (Vite + TypeScript)
Write-Host "1. Compiling TypeScript and Vite bundle..." -ForegroundColor Yellow
npm run build

# 2. Prepare staging directory
Write-Host "2. Preparing installer staging directory..." -ForegroundColor Yellow
$staging = "build-installer\app"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path "dist-installer" | Out-Null

# 3. Copy Electron distribution to staging
Write-Host "3. Bundling Electron desktop runtime..." -ForegroundColor Yellow
$electronDist = "node_modules\electron\dist"
if (-not (Test-Path "$electronDist\electron.exe")) {
    throw "Electron prebuilt binaries not found in $electronDist. Run 'npm install' or 'node node_modules/electron/install.js'."
}

Copy-Item "$electronDist\*" "$staging" -Recurse -Force

# Rename electron.exe to MediaFlow.exe
Rename-Item "$staging\electron.exe" "MediaFlow.exe" -Force

# Remove default Electron placeholder app
if (Test-Path "$staging\resources\default_app.asar") {
    Remove-Item "$staging\resources\default_app.asar" -Force
}

# 4. Brand MediaFlow.exe with custom application icon & metadata using rcedit
Write-Host "4. Customizing executable branding and icon..." -ForegroundColor Yellow
$pkg = Get-Content "package.json" | ConvertFrom-Json
$appVersion = $pkg.version

$rcedit = "node_modules\rcedit\bin\rcedit.exe"
if (Test-Path $rcedit) {
    & $rcedit "$staging\MediaFlow.exe" `
        --set-icon "build-installer\assets\app.ico" `
        --set-version-string "FileDescription" "MediaFlow - Social Media Video Downloader" `
        --set-version-string "ProductName" "MediaFlow" `
        --set-version-string "CompanyName" "MediaFlow" `
        --set-product-version "$appVersion" `
        --set-file-version "$appVersion"
}

# 5. Stage application package inside resources/app
Write-Host "5. Staging application code and UI bundles in resources/app..." -ForegroundColor Yellow
$appDir = "$staging\resources\app"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null

Copy-Item "package.json" "$appDir\package.json" -Force
Copy-Item "dist" "$appDir" -Recurse -Force
Copy-Item "electron" "$appDir" -Recurse -Force

# Install production dependencies inside resources/app
Write-Host "6. Installing production dependencies in application bundle..." -ForegroundColor Yellow
npm install --omit=dev --prefix $appDir

# 6. Bundle media extractor binaries (yt-dlp, ffmpeg, ffprobe) and VC++ runtimes
Write-Host "7. Bundling media extractor binaries (yt-dlp, ffmpeg, ffprobe, VC++ runtimes)..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$staging\bin" | Out-Null
New-Item -ItemType Directory -Force -Path "$staging\assets" | Out-Null
Copy-Item "build-installer\assets\app.ico" "$staging\assets\app.ico" -Force

$ytdlp = Get-Command yt-dlp -ErrorAction SilentlyContinue
if (-not $ytdlp) {
    $ytdlpPath = (Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "yt-dlp.exe" -Recurse | Select-Object -First 1).FullName
} else {
    $ytdlpPath = $ytdlp.Source
}
Copy-Item $ytdlpPath "$staging\bin\yt-dlp.exe" -Force

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
    $ffmpegPath = (Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1).FullName
} else {
    $ffmpegPath = $ffmpeg.Source
}
Copy-Item $ffmpegPath "$staging\bin\ffmpeg.exe" -Force

$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
if (-not $ffprobe) {
    $ffprobePath = (Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "ffprobe.exe" -Recurse | Select-Object -First 1).FullName
} else {
    $ffprobePath = $ffprobe.Source
}
if ($ffprobePath -and (Test-Path $ffprobePath)) {
    Copy-Item $ffprobePath "$staging\bin\ffprobe.exe" -Force
}

# Copy VC++ CRT DLLs so app runs without requiring manual Visual C++ Redistributable installation
$vcDlls = @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll", "msvcp140_atomic_wait.dll")
foreach ($dll in $vcDlls) {
    $sysPath = "C:\Windows\System32\$dll"
    if (Test-Path $sysPath) {
        Copy-Item $sysPath "$staging\bin\$dll" -Force
        Copy-Item $sysPath "$staging\$dll" -Force
    }
}

# 7. Compile with Inno Setup
Write-Host "8. Compiling Native Setup installer with Inno Setup..." -ForegroundColor Yellow
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
    $isccPath = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
} else {
    $isccPath = $iscc.Source
}
& $isccPath "build-installer\installer.iss"

Write-Host "`nStandalone Native Windows Application installer built successfully!" -ForegroundColor Green
Get-Item "dist-installer\MediaFlow-Setup-$appVersion.exe" | Format-List Name, Length, LastWriteTime
