'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  IMAGE_EXTENSIONS,
  ImageError,
  convertFile,
  inspectFile,
  normalizeSettings,
} = require('./lib/imaging');

const APP_NAME = 'پیکسل یار';
const INSTAGRAM_URL = 'https://instagram.com/mnabishahzamani';
const GITHUB_URL = 'https://github.com/mnabishahzamani-dev';
const MAX_BATCH_ITEMS = 30;
const RESULT_STORE_LIMIT = 300;
const RESULT_STORE_BYTES = 300 * 1024 * 1024;

if (process.platform === 'win32') {
  app.setAppUserModelId('com.mnabishahzamani.pixelyar');
}

let mainWindow = null;
const activeRuns = new Map();
const resultStore = new Map();
let storedResultBytes = 0;

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(900, Math.min(1260, workArea.width - 40));
  const height = Math.max(660, Math.min(860, workArea.height - 40));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#f7f3ee',
    title: `${APP_NAME} — تبدیل تصویر به WebP`,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const sendMaximized = (maximized) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized', maximized);
    }
  };

  mainWindow.on('maximize', () => sendMaximized(true));
  mainWindow.on('unmaximize', () => sendMaximized(false));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  const ownerId = mainWindow.webContents.id;
  mainWindow.webContents.once('destroyed', () => {
    for (const [token, entry] of resultStore) {
      if (entry.ownerId === ownerId) {
        storedResultBytes -= entry.buffer.length;
        resultStore.delete(token);
      }
    }
    for (const [runId, run] of activeRuns) {
      if (run.ownerId === ownerId) {
        run.cancelled = true;
        activeRuns.delete(runId);
      }
    }
  });
}

function windowFrom(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function errorPayload(error) {
  if (error instanceof ImageError) {
    return { code: error.code, message: error.message };
  }

  console.error('Unexpected image error:', error);
  if (error && error.code === 'ENOENT') {
    return { code: 'NOT_FOUND', message: 'فایل پیدا نشد یا جابه‌جا شده است.' };
  }
  if (error && error.code === 'EACCES') {
    return { code: 'ACCESS_DENIED', message: 'دسترسی به این مسیر ممکن نیست.' };
  }
  return { code: 'UNKNOWN', message: 'خطای پیش‌بینی‌نشده‌ای در پردازش رخ داد.' };
}

function sourceExtensionFilter() {
  return [
    { name: 'تصاویر', extensions: IMAGE_EXTENSIONS },
  ];
}

function isWebp(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length > 16 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

function safeWebpName(sourcePath) {
  const base = path.basename(sourcePath, path.extname(sourcePath));
  let safe = base
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!safe || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) safe = 'image';
  if (safe.length > 80) safe = safe.slice(0, 80).trim();
  return `${safe || 'image'}.webp`;
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function uniqueOutputPath(directory, fileName) {
  const extension = path.extname(fileName) || '.webp';
  const stem = fileName.slice(0, -extension.length) || 'image';
  let candidate = path.join(directory, `${stem}${extension}`);
  let counter = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(directory, `${stem} (${counter})${extension}`);
    counter += 1;
  }
  return candidate;
}

async function writeAtomically(targetPath, buffer) {
  const tempPath = path.join(
    path.dirname(targetPath),
    `.pixel-yar-${crypto.randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function saveEntry(entry, targetPath) {
  if (!isWebp(entry.buffer)) {
    throw new ImageError('INVALID_OUTPUT', 'دادهٔ خروجی معتبر نیست.');
  }

  const isSameFile = path.resolve(targetPath).toLowerCase() === path.resolve(entry.sourcePath).toLowerCase();
  if (isSameFile) {
    await writeAtomically(targetPath, entry.buffer);
    return { filePath: targetPath, trashed: false };
  }

  await fs.writeFile(targetPath, entry.buffer);
  return { filePath: targetPath, trashed: false };
}

function pickEntries(tokens, ownerId) {
  const entries = [];
  const seen = new Set();
  for (const token of tokens) {
    if (typeof token !== 'string' || seen.has(token)) continue;
    seen.add(token);
    const entry = resultStore.get(token);
    if (!entry || entry.ownerId !== ownerId) continue;
    entries.push({ token, ...entry });
  }
  return entries;
}

function releaseToken(token, entry) {
  resultStore.delete(token);
  storedResultBytes = Math.max(0, storedResultBytes - entry.buffer.length);
}

function trimResultStore() {
  let count = resultStore.size;
  for (const [token, entry] of resultStore) {
    if (count <= RESULT_STORE_LIMIT && storedResultBytes <= RESULT_STORE_BYTES) break;
    resultStore.delete(token);
    storedResultBytes = Math.max(0, storedResultBytes - entry.buffer.length);
    count -= 1;
  }
}

function addResult(entry, ownerId) {
  const token = crypto.randomUUID();
  resultStore.set(token, { ...entry, ownerId });
  storedResultBytes += entry.buffer.length;
  trimResultStore();
  return token;
}

function adoptStoredSource(token, filePath) {
  const stored = resultStore.get(token);
  if (!stored) return;
  stored.sourcePath = filePath;
  stored.suggestedName = path.basename(filePath);
}

function broadcastProgress(sender, payload) {
  if (!sender.isDestroyed()) sender.send('convert:progress', payload);
}

async function confirmReplace(window, entries) {
  const count = entries.length;
  const names = entries.slice(0, 6).map((entry) => path.basename(entry.sourcePath)).join('، ');
  const extra = count > 6 ? ` و ${count - 6} فایل دیگر` : '';
  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'جایگزینی فایل اصلی',
    message: count === 1
      ? 'فایل اصلی به سطل بازیافت منتقل می‌شود.'
      : `${count} فایل اصلی به سطل بازیافت منتقل می‌شوند.`,
    detail:
      `نسخهٔ WebP کنار فایل اصلی ذخیره می‌شود و فایل‌های ورودی (${names}${extra}) به سطل بازیافت ویندوز منتقل می‌شوند. ` +
      'اگر ویندوز خالی‌کردن سطل بازیافت را تنظیم کرده باشد، امکان بازگردانی وجود ندارد.',
    buttons: ['ذخیره و انتقال به سطل بازیافت', 'لغو'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
}

function registerIpc() {
  ipcMain.on('window:minimize', (event) => windowFrom(event)?.minimize());

  ipcMain.on('window:toggle-maximize', (event) => {
    const window = windowFrom(event);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });

  ipcMain.on('window:close', (event) => windowFrom(event)?.close());

  ipcMain.handle('files:pick', async (event) => {
    const window = windowFrom(event);
    if (!window) return { canceled: true, filePaths: [] };

    const result = await dialog.showOpenDialog(window, {
      title: 'انتخاب تصویر',
      buttonLabel: 'افزودن',
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: sourceExtensionFilter(),
    });

    return { canceled: result.canceled, filePaths: result.canceled ? [] : result.filePaths };
  });

  ipcMain.handle('files:inspect', async (event, rawPaths, rawSettings) => {
    const settings = normalizeSettings(rawSettings);
    const paths = Array.isArray(rawPaths)
      ? [...new Set(rawPaths.filter((item) => typeof item === 'string' && item.trim()))].slice(0, MAX_BATCH_ITEMS)
      : [];

    if (paths.length === 0) return { ok: true, items: [] };

    const results = new Array(paths.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(settings.concurrency + 1, paths.length) },
      async () => {
        while (cursor < paths.length) {
          const index = cursor;
          cursor += 1;
          const filePath = paths[index];
          try {
            const info = await inspectFile(filePath, settings);
            results[index] = info;
          } catch (error) {
            results[index] = { ok: false, path: filePath, error: errorPayload(error) };
          }
        }
      },
    );

    await Promise.all(workers);
    return { ok: true, items: results };
  });

  ipcMain.handle('images:convert', async (event, payload) => {
    const sender = event.sender;
    const ownerId = sender.id;
    const runId = typeof payload?.runId === 'string' ? payload.runId.slice(0, 80) : '';
    const settings = normalizeSettings(payload?.settings);
    const items = Array.isArray(payload?.items)
      ? payload.items
          .filter(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              typeof item.path === 'string' &&
              item.path.trim(),
          )
          .slice(0, MAX_BATCH_ITEMS)
      : [];

    if (!runId || items.length === 0) {
      return { ok: false, error: { code: 'INVALID_REQUEST', message: 'درخواست تبدیل معتبر نیست.' } };
    }

    for (const [, run] of activeRuns) {
      if (run.ownerId === ownerId) run.cancelled = true;
    }

    const run = { cancelled: false, ownerId };
    activeRuns.set(runId, run);

    let completed = 0;
    let failed = 0;
    let rejected = 0;
    let cursor = 0;

    const workers = Array.from(
      { length: Math.min(settings.concurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const index = cursor;
          cursor += 1;
          const item = items[index];

          if (run.cancelled) return;

          broadcastProgress(sender, {
            runId,
            type: 'item-start',
            id: item.id,
            index,
            total: items.length,
          });

          try {
            const result = await convertFile(item.path, settings, {
              shouldCancel: () => run.cancelled,
            });

            if (run.cancelled) return;

            let token = null;
            if (!result.rejected) {
              token = addResult(
                {
                  buffer: result.buffer,
                  sourcePath: result.sourcePath,
                  suggestedName: safeWebpName(result.sourcePath),
                },
                ownerId,
              );
            }

            const { buffer, ...safeResult } = result;
            completed += 1;
            if (result.rejected) rejected += 1;

            broadcastProgress(sender, {
              runId,
              type: result.rejected ? 'item-rejected' : 'item-done',
              id: item.id,
              token,
              result: safeResult,
            });
          } catch (error) {
            if (run.cancelled || error?.code === 'CANCELLED') return;
            failed += 1;
            broadcastProgress(sender, {
              runId,
              type: 'item-error',
              id: item.id,
              error: errorPayload(error),
            });
          }
        }
      },
    );

    await Promise.all(workers);

    if (activeRuns.get(runId) === run) activeRuns.delete(runId);

    return {
      ok: true,
      cancelled: run.cancelled,
      completed,
      failed,
      rejected,
      total: items.length,
    };
  });

  ipcMain.handle('images:cancel', (event, runId) => {
    const run = activeRuns.get(runId);
    if (run && run.ownerId === event.sender.id) {
      run.cancelled = true;
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle('results:release', (event, tokens) => {
    if (!Array.isArray(tokens)) return { ok: true };
    for (const token of tokens.slice(0, 500)) {
      const entry = resultStore.get(token);
      if (entry && entry.ownerId === event.sender.id) releaseToken(token, entry);
    }
    return { ok: true };
  });

  ipcMain.handle('result:save', async (event, payload) => {
    const window = windowFrom(event);
    const entries = pickEntries([payload?.token], event.sender.id);
    if (!window || entries.length === 0) {
      return {
        ok: false,
        error: { code: 'RESULT_EXPIRED', message: 'نتیجهٔ این تبدیل در دسترس نیست؛ دوباره تبدیل کن.' },
      };
    }

    const entry = entries[0];

    try {
      if (payload?.replaceOriginal === true) {
        const confirmed = await confirmReplace(window, entries);
        if (!confirmed) return { ok: true, canceled: true, filePaths: [] };

        const directory = path.dirname(entry.sourcePath);
        let targetPath = path.join(directory, entry.suggestedName);
        if (path.resolve(targetPath).toLowerCase() !== path.resolve(entry.sourcePath).toLowerCase()) {
          targetPath = await uniqueOutputPath(directory, path.basename(targetPath));
        }

        const saved = await saveEntry(entry, targetPath);
        let trashed = false;
        if (path.resolve(saved.filePath).toLowerCase() !== path.resolve(entry.sourcePath).toLowerCase()) {
          try {
            await shell.trashItem(entry.sourcePath);
            trashed = true;
            adoptStoredSource(entry.token, saved.filePath);
          } catch (error) {
            console.error('Trash failed:', error);
          }
        }

        return {
          ok: true,
          canceled: false,
          filePaths: [saved.filePath],
          folder: path.dirname(saved.filePath),
          trashed,
        };
      }

      const fallbackDirectory = path.dirname(entry.sourcePath);
      let defaultPath = path.join(fallbackDirectory, entry.suggestedName);
      try {
        await fs.access(fallbackDirectory);
      } catch {
        defaultPath = path.join(app.getPath('pictures'), entry.suggestedName);
      }

      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: 'ذخیره تصویر WebP',
        defaultPath,
        buttonLabel: 'ذخیره',
        filters: [{ name: 'WebP Image', extensions: ['webp'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation', 'dontAddToRecent'],
      });

      if (canceled || !filePath) return { ok: true, canceled: true, filePaths: [] };

      const targetPath = /\.webp$/i.test(filePath) ? filePath : `${filePath}.webp`;
      const saved = await saveEntry(entry, targetPath);

      return {
        ok: true,
        canceled: false,
        filePaths: [saved.filePath],
        folder: path.dirname(saved.filePath),
        trashed: false,
      };
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }
  });

  ipcMain.handle('results:save-all', async (event, payload) => {
    const window = windowFrom(event);
    const entries = pickEntries(payload?.tokens, event.sender.id);
    if (!window || entries.length === 0) {
      return {
        ok: false,
        error: { code: 'RESULT_EXPIRED', message: 'نتیجه‌ای برای ذخیره در دسترس نیست؛ دوباره تبدیل کن.' },
      };
    }

    try {
      if (payload?.replaceOriginal === true) {
        const confirmed = await confirmReplace(window, entries);
        if (!confirmed) return { ok: true, canceled: true, filePaths: [], errors: [] };

        const filePaths = [];
        const savedEntries = [];
        const errors = [];
        let trashedCount = 0;

        for (const entry of entries) {
          try {
            const directory = path.dirname(entry.sourcePath);
            let targetPath = path.join(directory, entry.suggestedName);
            if (path.resolve(targetPath).toLowerCase() !== path.resolve(entry.sourcePath).toLowerCase()) {
              targetPath = await uniqueOutputPath(directory, path.basename(targetPath));
            }

            const saved = await saveEntry(entry, targetPath);
            filePaths.push(saved.filePath);
            savedEntries.push({
              token: entry.token,
              sourcePath: entry.sourcePath,
              filePath: saved.filePath,
              trashed: false,
            });

            if (path.resolve(saved.filePath).toLowerCase() !== path.resolve(entry.sourcePath).toLowerCase()) {
              try {
                await shell.trashItem(entry.sourcePath);
                trashedCount += 1;
                savedEntries[savedEntries.length - 1].trashed = true;
                adoptStoredSource(entry.token, saved.filePath);
              } catch (error) {
                errors.push({
                  token: entry.token,
                  sourcePath: entry.sourcePath,
                  message: 'خروجی ذخیره شد، اما انتقال فایل اصلی به سطل بازیافت انجام نشد.',
                });
                console.error('Trash failed:', error);
              }
            }
          } catch (error) {
            errors.push({
              token: entry.token,
              sourcePath: entry.sourcePath,
              message: errorPayload(error).message,
            });
          }
        }

        return {
          ok: true,
          canceled: false,
          filePaths,
          saved: savedEntries,
          folder: filePaths.length ? path.dirname(filePaths[0]) : '',
          trashedCount,
          errors,
        };
      }

      let defaultDirectory = path.dirname(entries[0].sourcePath);
      try {
        await fs.access(defaultDirectory);
      } catch {
        defaultDirectory = app.getPath('pictures');
      }

      const { canceled, filePaths: directories } = await dialog.showOpenDialog(window, {
        title: 'انتخاب پوشهٔ ذخیره',
        buttonLabel: 'ذخیره در این پوشه',
        defaultPath: defaultDirectory,
        properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
      });

      if (canceled || !directories?.[0]) {
        return { ok: true, canceled: true, filePaths: [], errors: [] };
      }

      const directory = directories[0];
      const savedPaths = [];
      const savedEntries = [];
      const errors = [];

      for (const entry of entries) {
        try {
          const targetPath = await uniqueOutputPath(directory, entry.suggestedName);
          const saved = await saveEntry(entry, targetPath);
          savedPaths.push(saved.filePath);
          savedEntries.push({
            token: entry.token,
            sourcePath: entry.sourcePath,
            filePath: saved.filePath,
            trashed: false,
          });
        } catch (error) {
          errors.push({
            token: entry.token,
            sourcePath: entry.sourcePath,
            message: errorPayload(error).message,
          });
        }
      }

      return {
        ok: true,
        canceled: false,
        filePaths: savedPaths,
        saved: savedEntries,
        folder: directory,
        trashedCount: 0,
        errors,
      };
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }
  });

  ipcMain.handle('app:reveal', (event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath) return { ok: false };
    shell.showItemInFolder(path.normalize(targetPath));
    return { ok: true };
  });

  ipcMain.handle('app:open-github', async () => {
    try {
      await shell.openExternal(GITHUB_URL);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }
  });

  ipcMain.handle('app:open-instagram', async () => {
    try {
      await shell.openExternal(INSTAGRAM_URL);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const run of activeRuns.values()) run.cancelled = true;
});
