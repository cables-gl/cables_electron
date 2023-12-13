const { contextBridge, ipcRenderer, app } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    "talkerMessage": (cmd, data) =>
    {
        return ipcRenderer.invoke("talkerMessage", cmd, data);
    },
    "store": (cmd, data) => {
        console.log("CALL STORE");
        return ipcRenderer.sendSync("store")
    }
});
