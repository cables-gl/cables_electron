import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import path from "path";
import fs from "fs";
import localShortcut from "electron-localshortcut";
import electronEndpoint from "./electron_endpoint.js";
import electronApi from "./electron_api.js";
import logger from "../utils/logger.js";
import settings from "./electron_settings.js";
import doc from "../utils/doc_util.js";
import projectsUtil from "../utils/projects_util.js";
import filesUtil from "../utils/files_util.js";
import helper from "../utils/helper_util.js";

app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("force_high_performance_gpu");

logger.info("--- starting");

class ElectronApp
{
    constructor()
    {
        this._log = logger;
        this.editorWindow = null;

        app.on("browser-window-created", (event, win) =>
        {
            if (settings.get(settings.OPEN_DEV_TOOLS_FIELD))
            {
                win.webContents.once("dom-ready", this._toggleDevTools.bind(this));
            }
        });
    }

    createWindow()
    {
        let patchFile = null;
        this.editorWindow = new BrowserWindow({
            "width": 1920,
            "height": 1080,
            "autoHideMenuBar": true,
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
                    "buttons": ["create new", "open patch", "open export"],
                    "defaultId": 0,
                    "cancelId": 1
                }).then((button) =>
                {
                    if (button && button.response !== 0)
                    {
                        const type = button.response === 2 ? "export" : "project";
                        this.pickProjectFileDialog(type);
                    }
                });
            }
        }

        this._registerListeners();
        this._registerShortcuts();
        this.openPatch(patchFile);
    }

    async pickProjectFileDialog(type)
    {
        let title = "select patch";
        let properties = ["openFile"];
        return this._projectFileDialog(title, properties, type);
    }

    async pickFileDialog(filePath, asUrl = false, filter = [])
    {
        let title = "select file";
        let properties = ["openFile"];
        return this._fileDialog(title, filePath, asUrl, filter, properties);
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
                "extensions": [projectsUtil.CABLES_PROJECT_FILE_EXTENSION],
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
        let menu = Menu.buildFromTemplate([
            {
                "label": "Menu",
                "submenu": [
                    {
                        "label": "New patch",
                        "click": () =>
                        {
                            this.openPatch();
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
                    { "role": "cut" },
                    { "role": "copy" },
                    { "role": "paste" }
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
                    settings.loadProject();
                }
                this.updateTitle();
            });
        }, ["core", "teams", "extensions"], true);
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

    _fileDialog(title, filePath = null, asUrl = false, extensions = ["*"], properties = null)
    {
        if (extensions)
        {
            extensions.forEach((ext, i) =>
            {
                if (ext.startsWith(".")) extensions[i] = ext.replace(".", "");
            });
        }
        const options = {
            "title": title,
            "properties": properties,
            "filters": [{ "name": "Assets", "extensions": extensions }]
        };
        if (filePath) options.defaultPath = filePath;
        return dialog.showOpenDialog(this.editorWindow, options).then((result) =>
        {
            if (!result.canceled)
            {
                if (!asUrl) return result.filePaths[0];
                return helper.pathToFileURL(result.filePaths[0], true);
            }
            else
            {
                return null;
            }
        });
    }

    _projectFileDialog(title, properties, type = "project")
    {
        const extensions = [];
        if (type === "project") extensions.push(projectsUtil.CABLES_PROJECT_FILE_EXTENSION);
        if (type === "export") extensions.push(projectsUtil.CABLES_STANDALONE_EXPORT_FILE_EXTENSION);

        return dialog.showOpenDialog(this.editorWindow, {
            "title": title,
            "properties": properties,
            "filters": [{
                "name": "cables project",
                "extensions": extensions,
            }]
        }).then((result) =>
        {
            if (!result.canceled)
            {
                const patchFile = result.filePaths[0];
                let projectFile = patchFile;
                if (patchFile.endsWith(projectsUtil.CABLES_STANDALONE_EXPORT_FILE_EXTENSION))
                {
                    let exportedProject = fs.readFileSync(patchFile);
                    exportedProject = JSON.parse(exportedProject.toString("utf-8"));
                    projectFile = patchFile.substring(0, patchFile.lastIndexOf(projectsUtil.CABLES_STANDALONE_EXPORT_FILE_EXTENSION)) + projectsUtil.CABLES_PROJECT_FILE_EXTENSION;
                    if (!fs.existsSync(projectFile))
                    {
                        projectsUtil.writeProjectToFile(projectFile, exportedProject);
                    }
                    else
                    {
                        const choice = dialog.showMessageBoxSync(this.editorWindow, {
                            "type": "question",
                            "buttons": ["Cancel", "OK"],
                            "title": "project file already exists!",
                            "message": "existing project file will be overwritten",
                            "detail": projectFile,
                            "defaultId": 0,
                            "cancelId": 1
                        });
                        const save = (choice === 1);
                        if (save)
                        {
                            projectsUtil.writeProjectToFile(projectFile, exportedProject);
                        }
                        else
                        {
                            return null;
                        }
                    }
                }
                settings.loadProject(projectFile);
                this.openPatch(projectFile);
                return projectFile;
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
        settings.reloadProject();
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

    _registerShortcuts()
    {
        let devToolsAcc = "CmdOrCtrl+Shift+I";
        let inspectElementAcc = "CmdOrCtrl+Shift+C";
        if (process.platform === "darwin") devToolsAcc = "CmdOrCtrl+Option+I";

        // https://github.com/sindresorhus/electron-debug/blob/main/index.js
        localShortcut.register(this.editorWindow, inspectElementAcc, this._inspectElements.bind(this));
        localShortcut.register(this.editorWindow, devToolsAcc, this._toggleDevTools.bind(this));
        localShortcut.register(this.editorWindow, "F12", this._toggleDevTools.bind(this));
        localShortcut.register(this.editorWindow, "CommandOrControl+R", this._reloadWindow.bind(this));
        localShortcut.register(this.editorWindow, "F5", this._reloadWindow.bind(this));
        localShortcut.register(this.editorWindow, "CmdOrCtrl+O", this.pickProjectFileDialog.bind(this));
    }

    _toggleDevTools()
    {
        if (this.editorWindow.webContents.isDevToolsOpened())
        {
            this.editorWindow.webContents.closeDevTools();
        }
        else
        {
            this.editorWindow.webContents.openDevTools({ "mode": "previous" });
        }
    }

    _inspectElements()
    {
        const inspect = () =>
        {
            this.editorWindow.devToolsWebContents.executeJavaScript("DevToolsAPI.enterInspectElementMode()");
        };

        if (this.editorWindow.webContents.isDevToolsOpened())
        {
            inspect();
        }
        else
        {
            this.editorWindow.webContents.once("devtools-opened", inspect);
            this.editorWindow.openDevTools();
        }
    }

    _reloadWindow()
    {
        this.editorWindow.webContents.reloadIgnoringCache();
    }

    _registerListeners()
    {
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

        this.editorWindow.webContents.on("devtools-opened", (event, win) =>
        {
            settings.set(settings.OPEN_DEV_TOOLS_FIELD, true);
        });

        this.editorWindow.webContents.on("devtools-closed", (event, win) =>
        {
            settings.set(settings.OPEN_DEV_TOOLS_FIELD, false);
        });
    }
}
Menu.setApplicationMenu(null);
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
app.on("will-quit", (event) =>
{
    event.preventDefault();
    filesUtil.unregisterChangeListeners().then(() =>
    {
        process.exit(0);
    }).catch((e) =>
    {
        console.error("error during shutdown", e);
        process.exit(1);
    });
});
const electronApp = new ElectronApp();
export default electronApp;
