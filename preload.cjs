const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    "talkerMessage": (cmd, data) =>
    {
        return ipcRenderer.invoke("talkerMessage", cmd, data);
    }
});
