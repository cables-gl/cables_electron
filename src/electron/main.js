import { app, BrowserWindow, Menu, dialog } from "electron";
import path from "path";
import fs from "fs";
import sanitizeFileName from "sanitize-filename";
import jsonfile from "jsonfile";
import electronEndpoints from "./electron_endpoint.js";
import logger from "../utils/logger.js";
import store from "./electron_store.js";
import doc from "../utils/doc_util.js";

logger.debug("STARTING");

class ElectronApp
{
    constructor()
    {
        this.cablesFileExtension = ".cables.json";
        this.editorWindow = null;
    }

    createWindow()
    {
        let patchFile = null;
        if (store.getPatchFile())
        {
            if (fs.existsSync(store.getPatchFile()))
            {
                patchFile = store.getPatchFile();
            }
        }

        this.editorWindow = new BrowserWindow({
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
        doc.rebuildOpCaches(() =>
        {
            this.editorWindow.loadFile("index.html").then(() =>
            {
                let title = "cables";
                if (patchFile)
                {
                    title = "cables - " + store.getCurrentProject().name;
                }
                this.editorWindow.setTitle(title);
            });
        }, ["core", "teams", "extensions", "users", "patches"]);
    }

    openPatchDialog()
    {
        let title = "select patch";
        let properties = ["openFile", "openDirectory", "createDirectory"];
        this._patchDialog(title, properties, this._switchPatch.bind(this));
    }

    savePatchDialog(cb)
    {
        const title = "select workspace directory";
        const properties = ["openDirectory", "createDirectory"];
        this._patchDialog(title, properties, this._switchPatch.bind(this));
    }

    createNewPatchDialog()
    {
        const title = "select workspace directory";
        const properties = ["openDirectory", "createDirectory"];
        this._patchDialog(title, properties, this._switchPatch.bind(this));
    }

    createMenu()
    {
        let devToolsAcc = "CmdOrCtrl+Shift+I";
        if (process.platform === "darwin") devToolsAcc = "CmdOrCtrl+Option+I";
        let menu = Menu.buildFromTemplate([
            {
                "label": "Menu",
                "submenu": [
                    {
                        "label": "New patch",
                        "accelerator": "CmdOrCtrl+N",
                        "click": () =>
                        {
                            this.createNewPatchDialog();
                        }
                    },
                    {
                        "label": "Open patch",
                        "accelerator": "CmdOrCtrl+O",
                        "click": () =>
                        {
                            this.openPatchDialog();
                        }
                    },
                    {
                        "label": "Reload patch",
                        "accelerator": "CmdOrCtrl+R",
                        "click": () =>
                        {
                            this.editorWindow.reload();
                        }
                    },
                    {
                        "label": "Toggle fullscreen",
                        "click": () =>
                        {
                            if (this.editorWindow.isFullScreen())
                            {
                                this.editorWindow.setFullScreen(false);
                            }
                            else
                            {
                                this.editorWindow.setFullScreen(true);
                            }
                        }
                    },
                    {
                        "label": "Open Dev-Tools",
                        "accelerator": devToolsAcc,
                        "click": () =>
                        {
                            this.editorWindow.webContents.toggleDevTools();
                        }
                    },
                    {
                        "label": "Exit",
                        "accelerator": "CmdOrCtrl+Q",
                        "click": () =>
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
    }

    _switchPatch(patchFile, createNewProject = false)
    {
        logger.debug("SWITCH TO", patchFile, createNewProject);
        if (createNewProject)
        {
            this._createNewCurrentProject(patchFile);
        }
        else
        {
            store.setPatchFile(patchFile);
            let newPatchDir = path.dirname(patchFile);
            store.setCurrentProjectDir(newPatchDir);
        }
        doc.rebuildOpCaches(() =>
        {
            if (this.editorWindow) this.editorWindow.reload();
            if (this.editorWindow) this.editorWindow.setTitle("cables - " + store.getCurrentProject().name);
        }, ["core", "teams", "extensions", "users", "patches"]);
    }

    _createNewCurrentProject(newDir)
    {
        const newProject = store.getNewProject();
        logger.debug("setting new project dir to", newDir);
        store.setCurrentProjectDir(newDir);
        const projectFileName = sanitizeFileName(newProject.name).replace(/ /g, "_") + ".cables.json";
        const newProjectFile = path.join(store.getCurrentProjectDir(), projectFileName);
        logger.debug("new projectfile", store.getCurrentProjectDir(), projectFileName, newProjectFile);
        store.setPatchFile(newProjectFile);
        jsonfile.writeFileSync(newProjectFile, newProject, { "encoding": "utf-8", "spaces": 4 });
    }

    _patchDialog(title, properties, cb = null)
    {
        try
        {
            dialog.showOpenDialog(this.editorWindow, {
                "title": title,
                "properties": properties
            }).then((result) =>
            {
                if (!result.canceled)
                {
                    const selectedPath = result.filePaths[0];
                    const isDir = fs.lstatSync(selectedPath).isDirectory();
                    if (isDir)
                    {
                        const dirFiles = fs.readdirSync(selectedPath);
                        const projectFile = dirFiles.find((file) => { return path.basename(file).endsWith(this.cablesFileExtension); });
                        if (projectFile)
                        {
                            if (cb) cb(path.join(selectedPath, projectFile));
                        }
                        else
                        {
                            if (cb) cb(selectedPath, true);
                            this._switchPatch(selectedPath, true);
                        }
                    }
                    else
                    {
                        if (cb) cb(selectedPath);
                    }
                }
            });
        }
        catch (e)
        {
            dialog.showMessageBox(this.editorWindow, {
                "type": "error",
                "title": "error",
                "message": e.message
            });
        }
    }
}
app.whenReady().then(() =>
{
    electronEndpoints.init();
    electronApp.createWindow();
    electronApp.createMenu();
    app.on("activate", () =>
    {
        if (BrowserWindow.getAllWindows().length === 0) electronApp.createWindow();
    });
});

app.on("window-all-closed", () =>
{
    if (process.platform !== "darwin") app.quit();
});
const electronApp = new ElectronApp();
export default electronApp;
