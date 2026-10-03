// Test preload for Phase 4.1 reader position tests
// Extends production preload with test telemetry bridge
const path = require('path');
require(path.join(__dirname, '..', '..', 'src', 'preload', 'preload.js'));
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('testAPI', {
  getDbWrites: () => ipcRenderer.invoke('test:get-db-writes'),
  resetDbWrites: () => ipcRenderer.invoke('test:reset-db-writes')
});
