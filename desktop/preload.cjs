'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('yogoDesktop',Object.freeze({info:()=>ipcRenderer.invoke('yogo:info'),openData:()=>ipcRenderer.invoke('yogo:data'),openPermissions:()=>ipcRenderer.invoke('yogo:permissions'),setLogin:value=>ipcRenderer.invoke('yogo:login',value),setDock:value=>ipcRenderer.invoke('yogo:dock',value),setupHooks:()=>ipcRenderer.invoke('yogo:hooks'),quit:()=>ipcRenderer.invoke('yogo:quit')}));
