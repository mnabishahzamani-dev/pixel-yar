'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pixelYar', {
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  inspectFiles: (paths, settings) => ipcRenderer.invoke('files:inspect', paths, settings),
  startConversion: (payload) => ipcRenderer.invoke('images:convert', payload),
  cancelConversion: (runId) => ipcRenderer.invoke('images:cancel', runId),
  onConversionProgress: (callback) => {
    ipcRenderer.on('convert:progress', (_event, payload) => callback(payload));
  },
  releaseResults: (tokens) => ipcRenderer.invoke('results:release', tokens),
  saveResult: (token, replaceOriginal) =>
    ipcRenderer.invoke('result:save', { token, replaceOriginal }),
  saveAllResults: (tokens, replaceOriginal) =>
    ipcRenderer.invoke('results:save-all', { tokens, replaceOriginal }),
  revealPath: (targetPath) => ipcRenderer.invoke('app:reveal', targetPath),
  openGithub: () => ipcRenderer.invoke('app:open-github'),
  openInstagram: () => ipcRenderer.invoke('app:open-instagram'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window:maximized', (_event, maximized) => callback(Boolean(maximized)));
  },
});
