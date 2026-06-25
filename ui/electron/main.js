import { app, BrowserWindow, ipcMain, systemPreferences, nativeTheme } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force all webContents (including the LangSmith webview) to use Dark Mode
nativeTheme.themeSource = 'dark';

let mainWindow;
let apiProcess;

// ── Touch ID IPC Handlers ──
ipcMain.handle('check-touch-id', () => {
  if (process.platform !== 'darwin') return false;
  return systemPreferences.canPromptTouchID();
});

ipcMain.handle('prompt-touch-id', async (event, reason) => {
  if (process.platform !== 'darwin') return false;
  try {
    return await systemPreferences.promptTouchID(reason);
  } catch (err) {
    throw new Error('Touch ID authentication failed or was canceled.');
  }
});

function startBackend() {
  const apiPath = path.resolve(__dirname, '../../database/api/server.js');
  console.log('Starting core-api at:', apiPath);
  
  apiProcess = spawn('node', [apiPath], {
    cwd: path.dirname(apiPath),
    env: process.env,
    stdio: 'inherit'
  });

  apiProcess.on('close', (code) => {
    console.log(`Core-api exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // frameless with traffic lights inside
    trafficLightPosition: { x: 16, y: 16 }, // align with topbar
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
    backgroundColor: '#080E1E', // Match --bg-main
    show: false, // show gracefully when ready
  });

  // Pipe frontend console logs to the terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[FRONTEND] ${message}`);
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    // In dev mode, wait for Vite to be ready (handled by wait-on in npm script)
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    // In prod mode, load the built Vite index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (apiProcess) {
    console.log('Killing core-api...');
    apiProcess.kill();
  }
});
