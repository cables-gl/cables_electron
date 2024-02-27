import { app, BrowserWindow, Menu, dialog } from "electron";
import path from "path";
import fs from "fs";
import electronEndpoints from "./electron_endpoint.js";
import logger from "../utils/logger.js";
import store from "./electron_store.js";
import doc from "../utils/doc_util.js";

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let editorWindow;

logger.info("STARTING");
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
            "nodeIntegration": true,
            "nodeIntegrationInWorker": true,
            "nodeIntegrationInSubFrames": true,
            "contextIsolation": false,
            "sandbox": false,
            "webSecurity": false,
            "allowRunningInsecureContent": true,
            "plugins": true,
            "experimentalFeatures": true,
            "v8CacheOptions": "none"
        }
    });
    editorWindow.switchPatch = (newPatchFile) =>
    {
        store.setPatchFile(newPatchFile);
        let newPatchDir = path.dirname(newPatchFile);
        store.setCurrentPatchDir(newPatchDir);
        doc.rebuildOpCaches(() =>
        {
            editorWindow.reload();
        }, ["core", "teams", "extensions", "users", "patches"]);
    };
    if (patchFile)
    {
        doc.rebuildOpCaches(() =>
        {
            editorWindow.loadFile("index.html");
        }, ["core", "teams", "extensions", "users", "patches"]);
    }
    else
    {
        editorWindow.loadFile("index.html").then(() =>
        {
            openPatchDialog();
        });
    }
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
    let devToolsAcc = "CmdOrCtrl+Shift+I";
    if (process.platform === "darwin") devToolsAcc = "CmdOrCtrl+Option+I";
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
                    "label": "Open Dev-Tools",
                    "accelerator": devToolsAcc,
                    click()
                    {
                        editorWindow.webContents.toggleDevTools();
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
    electronEndpoints.init();

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
