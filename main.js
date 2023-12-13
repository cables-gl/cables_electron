import { app, BrowserWindow, protocol, Menu, dialog } from "electron";
import path from "path";
import fs from "fs";
import ElectronApi from "./api.js";
import Store from "./store.js";

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let editorWindow;

const store = new Store(path.join(app.getAppPath(), "patches"));

protocol.registerSchemesAsPrivileged([{ "scheme": "cables", "privileges": { "bypassCSP": true, "supportFetchAPI": true } }]);

const createWindow = () =>
{
    let patchFile = null;
    if (store.getPatchFile())
    {
        if (fs.existsSync(store.getPatchFile()))
        {
            patchFile = store.getPatchFile();
        }
    }

    editorWindow = new BrowserWindow({
        "width": 1920,
        "height": 1080,
        "webPreferences": {
            "preload": path.join(app.getAppPath(), "preload.cjs"),
            "nodeIntegration": true
        }
    });
    editorWindow.switchPatch = (newPatchFile) =>
    {
        store.setPatchFile(newPatchFile);
        const pathParts = newPatchFile.split(path.sep);
        pathParts.pop();
        pathParts.pop();
        let newPatchDir = pathParts.join("/");
        store.setCurrentPatchDir(newPatchDir);
        editorWindow.reload();
    };
    // editorWindow.webContents.openDevTools();
    editorWindow.loadFile("index.html").then(() =>
    {
        if (!patchFile)
        {
            openPatchDialog();
        }
    });
};

const openPatchDialog = () =>
{
    try
    {
        dialog.showOpenDialog(
            editorWindow,
            {
                "title": "select patch",
                "properties": ["openFile"],
                "filters": [
                    { "name": "Cables Patches", "extensions": ["json"] },
                ]
            }).then((result) =>
        {
            if (!result.canceled)
            {
                editorWindow.switchPatch(result.filePaths[0]);
            }
        });
    }
    catch (e)
    {
        dialog.showMessageBox(editorWindow, {
            "type": "error",
            "title": "error",
            "message": e.messsage
        });
    }
};

const createMenu = () =>
{
    let menu = Menu.buildFromTemplate([
        {
            "label": "Menu",
            "submenu": [
                {
                    "label": "Open patch",
                    "accelerator": "CmdOrCtrl+O",
                    click()
                    {
                        openPatchDialog();
                    }
                },
                {
                    "label": "Reload patch",
                    "accelerator": "CmdOrCtrl+R",
                    click()
                    {
                        editorWindow.reload();
                    }
                },
                {
                    "label": "Toggle fullscreen",
                    "accelerator": "Escape",
                    click()
                    {
                        if (editorWindow.isFullScreen())
                        {
                            editorWindow.setFullScreen(false);
                        }
                        else
                        {
                            editorWindow.setFullScreen(true);
                        }
                    }
                },
                {
                    "label": "Exit",
                    "accelerator": "CmdOrCtrl+Q",
                    click()
                    {
                        app.quit();
                    }
                }
            ]
        },
        {
            "label": "Edit",
            "submenu": [
                { "role": "undo" },
                { "role": "redo" },
                { "type": "separator" },
                { "role": "cut" },
                { "role": "copy" },
                { "role": "paste" },
                { "role": "pasteandmatchstyle" },
                { "role": "delete" },
                { "role": "selectall" }
            ]
        }
    ]);

    Menu.setApplicationMenu(menu);
};

app.whenReady().then(() =>
{
    const api = new ElectronApi(store);
    api.init();

    protocol.handle("cables", (request) =>
    {
        console.log("CALL", request.url);
        const url = new URL(request.url);
        const urlPath = url.pathname;
        if (urlPath.startsWith("/api/corelib/"))
        {
            const libName = urlPath.split("/", 4)[3];
            const libCode = api.getCoreLibCode(libName);
            return new Response(libCode, {
                "headers": { "content-type": "application/javascript" }
            });
        }
        else if (urlPath.startsWith("/api/lib/"))
        {
            const libName = urlPath.split("/", 4)[3];
            const libCode = api.getLibCode(libName);
            return new Response(libCode, {
                "headers": { "content-type": "application/javascript" }
            });
        }
        else if (urlPath === "/api/changelog")
        {
            return new Response(JSON.stringify({ "ts": Date.now(), "items": [] }), {
                "headers": { "content-type": "application/json" }
            });
        }
        else if (urlPath === "/api/ping")
        {
            return new Response(JSON.stringify({ "maintenance": false }), {
                "headers": { "content-type": "application/json" }
            });
        }
        else if (urlPath.startsWith("/api/ops/code/project"))
        {
            return api.getProjectOpsCode().then((code) =>
            {
                return new Response(code, {
                    "headers": { "content-type": "application/json" }
                });
            });
        }
        else if (urlPath.startsWith("/api/ops/code"))
        {
            return api.getCoreOpsCode().then((code) =>
            {
                return new Response(code, {
                    "headers": { "content-type": "application/javascript" }
                });
            });
        }
        else if (urlPath.startsWith("/api/op/"))
        {
            const opId = urlPath.split("/", 4)[3];
            const opCode = api.getOpCode({ "opname": opId });
            return new Response(opCode, {
                "headers": { "content-type": "application/javascript" }
            });
        }
        else
        {
            return new Response("", {
                "headers": { "content-type": "application/javascript" }
            });
        }
    });

    createWindow();
    createMenu();
    app.on("activate", () =>
    {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () =>
{
    if (process.platform !== "darwin") app.quit();
});
