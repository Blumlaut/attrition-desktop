// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: ipcRenderer.invoke.bind(ipcRenderer),
    send: ipcRenderer.send.bind(ipcRenderer),
    on: ipcRenderer.on.bind(ipcRenderer),
    once: ipcRenderer.once.bind(ipcRenderer),
    removeListener: ipcRenderer.removeListener.bind(ipcRenderer),
    removeAllListeners: ipcRenderer.removeAllListeners.bind(ipcRenderer)
  },
  resetConfig: () => ipcRenderer.invoke('reset-config'),
  saveMinimizeToTrayPreference: (shouldMinimize) => ipcRenderer.invoke('save-minimize-to-tray-preference', shouldMinimize)
});
