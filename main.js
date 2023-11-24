import { app, BrowserWindow } from "electron";
import path from "path";
import ElectronApi from "./api.js";

const createWindow = () =>
{
    const win = new BrowserWindow({
        "width": 1920,
        "height": 1080,
        "webPreferences": {
            "preload": path.join(app.getAppPath(), "preload.cjs"),
            "nodeIntegration": true
        },
    });
    win.webContents.openDevTools();
    win.loadFile("index.html");
};

app.whenReady().then(() =>
{
    const api = new ElectronApi();
    api.init();

    createWindow();
    app.on("activate", () =>
    {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () =>
{
    if (process.platform !== "darwin") app.quit();
});
