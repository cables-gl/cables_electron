import { app, BrowserWindow, Menu, dialog, shell, screen } from "electron";
import path, { dirname } from "path";
import fs from "fs";
import electronEndpoint from "./electron_endpoint.js";
import electronApi from "./electron_api.js";
import logger from "../utils/logger.js";
import settings from "./electron_settings.js";
import doc from "../utils/doc_util.js";
import projectsUtil from "../utils/projects_util.js";

app.commandLine.appendSwitch("disable-http-cache");
logger.debug("--- starting");

class ElectronApp
{
    constructor()
    {
        this._log = logger;
        this.cablesFileExtensions = [projectsUtil.CABLES_PROJECT_FILE_EXTENSION, projectsUtil.CABLES_STANDALONE_EXPORT_FILE_EXTENSION];
        this.editorWindow = null;
    }

    createWindow()
    {
        let patchFile = null;
        this.editorWindow = new BrowserWindow({
            "width": 1920,
            "height": 1080,
            "webPreferences": {
                "partition": settings.SESSION_PARTITION,
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

        if (settings.getCurrentProjectFile())
        {
            if (fs.existsSync(settings.getCurrentProjectFile()))
            {
                patchFile = settings.getCurrentProjectFile();
            }
            else
            {
                dialog.showMessageBox(this.editorWindow, {
                    "type": "warning",
                    "title": "missing project",
                    "message": "failed to open:\n" + settings.getCurrentProjectFile(),
                    "buttons": ["create new", "open patch"],
                    "defaultId": 0,
                    "cancelId": 1
                }).then((button) =>
                {
                    if (button && button.response === 1)
                    {
                        this.pickProjectFileDialog();
                    }
                });
            }
        }

        if (settings.get(settings.OPEN_DEV_TOOLS_FIELD)) this.editorWindow.openDevTools();
        this.editorWindow.webContents.on("will-prevent-unload", (event) =>
        {
            if (this.isDocumentEdited())
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
            else
            {
                event.preventDefault();
            }
        });


        this.editorWindow.webContents.setWindowOpenHandler(({ url }) =>
        {
            if (url && url.startsWith("http"))
            {
                shell.openExternal(url);
                return { "action": "deny" };
            }
            return { "action": "allow" };
        });


        this.openPatch(patchFile);
    }

    async pickProjectFileDialog()
    {
        let title = "select patch";
        let properties = ["openFile"];
        return this._projectFileDialog(title, properties);
    }

    async saveProjectFileDialog()
    {
        let title = "select patch";
        let properties = ["createDirectory"];
        return dialog.showSaveDialog(this.editorWindow, {
            "title": title,
            "properties": properties,
            "filters": [{
                "name": "cables project",
                "extensions": this.cablesFileExtensions,
            }]
        }).then((result) =>
        {
            if (!result.canceled)
            {
                const patchFile = result.filePath;
                const currentProject = settings.getCurrentProject();
                if (currentProject)
                {
                    currentProject.name = path.basename(patchFile);
                    currentProject.summary = currentProject.summary || {};
                    currentProject.summary.title = currentProject.name;
                    projectsUtil.writeProjectToFile(patchFile, currentProject);
                }
                settings.loadProject(patchFile);
                return patchFile;
            }
            else
            {
                return null;
            }
        });
    }

    async pickOpDirDialog()
    {
        const title = "select op directory";
        const properties = ["openDirectory", "createDirectory"];
        return this._dirDialog(title, properties);
    }

    createMenu()
    {
        let devToolsAcc = "CmdOrCtrl+Shift+I";
        let inspectElementAcc = "CmdOrCtrl+Shift+C";

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
                            this.pickProjectFileDialog();
                        }
                    },
                    {
                        "label": "Open working directory",
                        "click": () =>
                        {
                            electronApi.openProjectDir();
                        }
                    },
                    {
                        "label": "Add Op directory",
                        "click": () =>
                        {
                            electronApi.addProjectOpDir();
                        }
                    },
                    {
                        "label": "Reload patch",
                        "accelerator": "CmdOrCtrl+R",
                        "click": () =>
                        {
                            this.reload();
                        }
                    },
                    {
                        "label": "Toggle fullscreen",
                        "click": () =>
                        {
                            this.cycleFullscreen();
                        }
                    },
                    {
                        "label": "Open Dev-Tools",
                        "accelerator": devToolsAcc,
                        "click": () =>
                        {
                            const stateBefore = this.editorWindow.webContents.isDevToolsOpened();
                            this.editorWindow.webContents.toggleDevTools();
                            settings.set(settings.OPEN_DEV_TOOLS_FIELD, !stateBefore);
                        }
                    },
                    {
                        "label": "Inspect Element",
                        "accelerator": inspectElementAcc,
                        "click": () =>
                        {
                            let mousePos = screen.getCursorScreenPoint();
                            if (mousePos)
                            {
                                this.editorWindow.inspectElement(mousePos.x, mousePos.y);
                            }
                            else
                            {
                                this.editorWindow.inspectElement(0, 0);
                            }
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
        doc.rebuildOpCaches((opDocs) =>
        {
            this.editorWindow.loadFile("index.html").then(() =>
            {
                if (patchFile)
                {
                    settings.loadProject(patchFile);
                }
                else
                {
                    settings.loadProject(null);
                }
                this.updateTitle();
            });
        }, ["core", "teams", "extensions", "users", "patches"], true);
    }

    updateTitle()
    {
        const buildInfo = settings.getBuildInfo();
        let title = "cables";
        if (buildInfo && buildInfo.api)
        {
            if (buildInfo.api.version)
            {
                title += " - " + buildInfo.api.version;
            }
            else if (buildInfo.api.git && buildInfo.api.git.tag)
            {
                title += " - " + buildInfo.api.git.tag;
            }
        }
        const projectFile = settings.getCurrentProjectFile();
        if (projectFile)
        {
            title = title + " - " + projectFile;
        }
        this.editorWindow.setTitle(title);
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

    _projectFileDialog(title, properties, cb = null)
    {
        return dialog.showOpenDialog(this.editorWindow, {
            "title": title,
            "properties": properties,
            "filters": [{
                "name": "cables project",
                "extensions": this.cablesFileExtensions,
            }]
        }).then((result) =>
        {
            if (!result.canceled)
            {
                const patchFile = result.filePaths[0];
                settings.loadProject(patchFile);
                this.openPatch(patchFile);
                return patchFile;
            }
            else
            {
                return null;
            }
        });
    }

    reload()
    {
        this.updateTitle();
        this.editorWindow.reload();
    }

    setDocumentEdited(edited)
    {
        this._contentChanged = edited;
    }


    isDocumentEdited()
    {
        return this._contentChanged || this.editorWindow.isDocumentEdited();
    }

    cycleFullscreen()
    {
        if (this.editorWindow.isFullScreen())
        {
            this.editorWindow.setMenuBarVisibility(true);
            this.editorWindow.setFullScreen(false);
        }
        else
        {
            this.editorWindow.setMenuBarVisibility(false);
            this.editorWindow.setFullScreen(true);
        }
    }

    sendTalkerMessage(cmd, data)
    {
        this.editorWindow.webContents.send("talkerMessage", { "cmd": cmd, "data": data });
    }
}
app.whenReady().then(() =>
{
    electronApi.init();
    electronEndpoint.init();
    electronApp.createWindow();
    electronApp.createMenu();
    app.on("activate", () =>
    {
        if (BrowserWindow.getAllWindows().length === 0) electronApp.createWindow();
    });
});

app.on("window-all-closed", () =>
{
    app.quit();
});
const electronApp = new ElectronApp();
export default electronApp;
