# Build MediaFlow Windows Standalone Installer
$ErrorActionPreference = "Stop";

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Building MediaFlow Windows Installer   " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Build application bundles
Write-Host "1. Compiling TypeScript and Vite bundle..." -ForegroundColor Yellow
npm run build

# 2. Prepare staging directory
Write-Host "2. Preparing installer staging directory..." -ForegroundColor Yellow
$staging = "build-installer\app"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$staging\bin" | Out-Null
New-Item -ItemType Directory -Force -Path "$staging\dist" | Out-Null
New-Item -ItemType Directory -Force -Path "$staging\assets" | Out-Null
New-Item -ItemType Directory -Force -Path "dist-installer" | Out-Null

# 3. Copy application distribution
Copy-Item "package.json" "$staging\package.json" -Force
Copy-Item "dist\*" "$staging\dist" -Recurse -Force
Copy-Item "build-installer\assets\app.ico" "$staging\assets\app.ico" -Force

# 4. Copy runtime binaries
Write-Host "3. Bundling runtime binaries (node, yt-dlp, ffmpeg, ffprobe, VC++ runtimes)..." -ForegroundColor Yellow
$nodeExe = (Get-Command node).Source
Copy-Item $nodeExe "$staging\bin\node.exe" -Force

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
    }
}

# 5. Install production dependencies
Write-Host "4. Installing production dependencies in staging..." -ForegroundColor Yellow
npm install --omit=dev --prefix $staging

# 6. Compile native C# Windows launchers
Write-Host "5. Compiling native Windows launchers (MediaFlow.exe, StopMediaFlow.exe)..." -ForegroundColor Yellow
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

& $csc /nologo /target:winexe /r:System.Windows.Forms.dll /r:System.Drawing.dll /win32icon:build-installer\assets\app.ico /out:"$staging\MediaFlow.exe" "scripts\MediaFlowLauncher.cs"
& $csc /nologo /target:winexe /r:System.Windows.Forms.dll /r:System.Drawing.dll /win32icon:build-installer\assets\app.ico /out:"$staging\StopMediaFlow.exe" "scripts\StopMediaFlow.cs"

# Provide fallback scripts for command line / manual troubleshooting
@'
@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0bin;%PATH%"
set PORT=3001
set HOST=127.0.0.1
echo Starting MediaFlow on http://127.0.0.1:3001 ...
start http://127.0.0.1:3001
"%~dp0bin\node.exe" dist\server\server\index.js
pause
'@ | Set-Content "$staging\MediaFlow.bat" -Encoding ASCII

@'
@echo off
echo Stopping MediaFlow background services...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo MediaFlow stopped.
timeout /t 2 >nul
'@ | Set-Content "$staging\StopMediaFlow.bat" -Encoding ASCII

# 7. Compile with Inno Setup
Write-Host "6. Compiling Setup installer with Inno Setup..." -ForegroundColor Yellow
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
    $isccPath = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
} else {
    $isccPath = $iscc.Source
}
& $isccPath "build-installer\installer.iss"

Write-Host "`nInstaller built successfully!" -ForegroundColor Green
Get-Item "dist-installer\MediaFlow-Setup-1.0.0.exe" | Format-List Name, Length, LastWriteTime
