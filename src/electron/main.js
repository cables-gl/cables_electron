import { app, BrowserWindow, Menu, dialog } from "electron";
import path from "path";
import fs from "fs";
import mkdirp from "mkdirp";
import electronEndpoints from "./electron_endpoint.js";
import logger from "../utils/logger.js";
import settings from "./electron_settings.js";
import doc from "../utils/doc_util.js";

logger.debug("--- starting");

class ElectronApp
{
    constructor()
    {
        this.cablesFileExtension = ".cables.json";
        this.editorWindow = null;
        this.settings = settings;
        this.documentsPath = path.join(app.getPath("documents"), "cables");
        if (!fs.existsSync(this.documentsPath)) mkdirp.sync(this.documentsPath);
    }

    createWindow()
    {
        let patchFile = null;
        if (this.settings.getProjectFile())
        {
            if (fs.existsSync(this.settings.getProjectFile()))
            {
                patchFile = this.settings.getProjectFile();
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
        this.editorWindow.webContents.on("will-prevent-unload", (event) =>
        {
            if (this.editorWindow.isDocumentEdited())
            {
                const choice = dialog.showMessageBoxSync(this.editorWindow, {
                    "type": "question",
                    "buttons": ["Leave", "Stay"],
                    "title": "unsaved content!",
                    "message": "unsaved content!",
                    "defaultId": 0,
                    "cancelId": 1
                });
                const leave = (choice === 0);
                if (leave)
                {
                    event.preventDefault();
                }
            }
        });

        this.openPatch(patchFile);
    }

    openPatchDialog()
    {
        let title = "select patch";
        let properties = ["openFile"];
        return this._patchDialog(title, properties);
    }

    async pickProjectDirDialog()
    {
        const title = "select workspace directory";
        const properties = ["openDirectory", "createDirectory"];
        return this._dirDialog(title, properties);
    }

    async createNewPatchDialog()
    {
        const title = "select workspace directory";
        const properties = ["openDirectory", "createDirectory"];
        return this._dirDialog(title, properties);
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
                            this.openPatch();
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

    openPatch(patchFile)
    {
        doc.rebuildOpCaches(() =>
        {
            this.editorWindow.loadFile("index.html").then(() =>
            {
                let title = "cables";
                if (patchFile)
                {
                    this.settings.loadProject(patchFile);
                    title = "cables - " + this.settings.getCurrentProject().name;
                }
                else
                {
                    this.settings.setProjectFile(null);
                    this.settings.setCurrentProjectDir(null);
                    this.settings.setCurrentProject(null);
                }
                this.editorWindow.setTitle(title);
            });
        }, ["core", "teams", "extensions", "users", "patches"]);
    }

    _dirDialog(title, properties)
    {
        return dialog.showOpenDialog(this.editorWindow, {
            "title": title,
            "properties": properties
        }).then((result) =>
        {
            if (!result.canceled)
            {
                return result.filePaths[0];
            }
            else
            {
                return null;
            }
        });
    }

    _patchDialog(title, properties, cb = null)
    {
        dialog.showOpenDialog(this.editorWindow, {
            "title": title,
            "properties": properties,
            "filters": [{
                "name": "cables project",
                "extensions": [this.cablesFileExtension],
            }]
        }).then((result) =>
        {
            if (!result.canceled)
            {
                const patchFile = result.filePaths[0];
                this.settings.setCurrentProjectDir(path.dirname(patchFile));
                this.settings.setProjectFile(patchFile);
                this.openPatch(patchFile);
                return result.filePaths[0];
            }
            else
            {
                return null;
            }
        });
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
