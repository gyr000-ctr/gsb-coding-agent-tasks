const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

let mainWindow;

function stateFilePath() {
  return path.join(app.getPath('userData'), 'shift-scheduler-state.json');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: '值班排班工具',
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('load-state', async () => {
  try {
    const raw = await fsp.readFile(stateFilePath(), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
});

ipcMain.handle('save-state', async (_event, state) => {
  await fsp.mkdir(path.dirname(stateFilePath()), { recursive: true });
  await fsp.writeFile(stateFilePath(), JSON.stringify(state, null, 2), 'utf8');
  return { ok: true };
});

ipcMain.handle('export-csv', async (_event, payload) => {
  const defaultName = String(payload.defaultName || '排班表.csv');
  const content = String(payload.content || '');

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 CSV',
    defaultPath: defaultName,
    filters: [
      { name: 'CSV 文件', extensions: ['csv'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fsp.writeFile(result.filePath, '\uFEFF' + content, 'utf8');
  return { canceled: false, filePath: result.filePath };
});
