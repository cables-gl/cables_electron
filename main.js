import { app, BrowserWindow, protocol } from "electron";
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
        }
    });
    win.webContents.openDevTools();
    win.loadFile("index.html");
};

app.whenReady()
    .then(() =>
    {
        const api = new ElectronApi();
        api.init();

        protocol.handle("cables", (request) =>
        {
            const url = new URL(request.url);
            const urlPath = url.pathname;
            switch (urlPath)
            {
            case "/api/ops/code":
                return api.getCoreOpsCode().then((code) =>
                {
                    return new Response(code, {
                        "headers": { "content-type": "application/json" }
                    });
                });
            case "/api/ops/code/project":
                return api.getProjectOpsCode().then((code) =>
                {
                    return new Response(code, {
                        "headers": { "content-type": "application/javascript" }
                    });
                });
            default:
                return new Response("", {
                    "headers": { "content-type": "application/javascript" }
                });
            }
        });

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
