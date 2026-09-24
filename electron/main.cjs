const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

let mainWindow = null;

const PORT = 3001;
const APP_URL = `http://127.0.0.1:${PORT}`;

// Setup log directory
const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'AppData', 'Local');
const logDir = path.join(localAppData, 'MediaFlow');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch {}
const logFile = path.join(logDir, 'mediaflow.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {}
  console.log(msg);
}

log('=======================================================');
log(`MediaFlow Desktop starting... (Electron v${process.versions.electron})`);

// Determine paths for packaged vs dev mode
const isPackaged = app.isPackaged;
const exeDir = path.dirname(process.execPath);
const appResourcesDir = isPackaged 
  ? path.join(process.resourcesPath, 'app')
  : path.resolve(__dirname, '..');

const binDir = isPackaged 
  ? path.join(exeDir, 'bin')
  : path.join(__dirname, '..', 'build-installer', 'app', 'bin');

process.env.PATH = `${binDir};${process.env.PATH}`;
process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';

log(`Base Directory: ${exeDir}`);
log(`App Resources: ${appResourcesDir}`);
log(`Bin Directory: ${binDir}`);

async function startServer() {
  try {
    const serverModulePath = path.join(appResourcesDir, 'dist', 'server', 'server', 'index.js');
    if (!fs.existsSync(serverModulePath)) {
      throw new Error(`Server entry script not found: ${serverModulePath}`);
    }

    const { pathToFileURL } = require('node:url');
    const serverUrl = pathToFileURL(serverModulePath).href;
    log(`Importing server module from ${serverUrl} ...`);
    await import(serverUrl);
    log('Backend server initialized successfully.');
  } catch (err) {
    log(`[FATAL] Failed to start backend server: ${err.stack || err.message}`);
  }
}

function waitForServer(url, timeoutMs = 30000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      const req = http.get(`${url}/api/settings`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => {
        retry();
      });
      req.setTimeout(800, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Timed out waiting for backend server at ${url}`));
      } else {
        setTimeout(ping, 200);
      }
    }

    ping();
  });
}

function createMainWindow() {
  const iconPath = isPackaged
    ? path.join(exeDir, 'assets', 'app.ico')
    : path.join(__dirname, '..', 'build-installer', 'assets', 'app.ico');

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 980,
    minHeight: 660,
    title: 'MediaFlow - Social Media Video Downloader',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0a0a0f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // Standard clean desktop application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Downloads Folder',
          click: () => {
            const downloadsFolder = path.join(process.env.USERPROFILE || 'C:\\Users\\User', 'Downloads');
            shell.openPath(downloadsFolder);
          }
        },
        { type: 'separator' },
        { label: 'Exit', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: () => shell.openExternal('https://github.com/jtimmyoftimeofficial-debug/MediaFlow')
        },
        {
          label: 'View Logs',
          click: () => {
            if (fs.existsSync(logFile)) {
              shell.openPath(logFile);
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    log('Native window is ready and displayed.');
  });

  // External links open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`) && !url.startsWith(`http://localhost:${PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  log('Another instance is already running. Exiting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    log('Electron app is ready. Initializing backend...');
    await startServer();
    try {
      log(`Waiting for backend server at ${APP_URL} ...`);
      await waitForServer(APP_URL);
      log('Backend health check verified.');
    } catch (err) {
      log(`[WARN] Health check timed out: ${err.message}`);
    }
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    log('All windows closed. Exiting MediaFlow.');
    app.quit();
  });
}
