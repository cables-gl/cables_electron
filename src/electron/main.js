import { app, BrowserWindow, dialog, Menu, shell, clipboard, nativeTheme } from "electron";
import path from "path";
import localShortcut from "electron-localshortcut";
import fs from "fs";
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
        this.appName = "name" in app ? app.name : app.getName();
        this.editorWindow = null;

        settings.set("uiLoadStart", this._log.loadStart);
        this._log.logStartup("started electron");

        process.on("uncaughtException", (error) =>
        {
            this._handleError(this.appName + " encountered an error", error);
        });

        process.on("unhandledRejection", (error) =>
        {
            this._handleError(this.appName + " encountered an error", error);
        });

        app.on("browser-window-created", (event, win) =>
        {
            if (settings.get(settings.OPEN_DEV_TOOLS_FIELD))
            {
                // win.webContents.once("dom-ready", this._toggleDevTools.bind(this));
            }
        });

        nativeTheme.themeSource = "dark";
    }

    createWindow()
    {
        let patchFile = null;
        const openLast = settings.getUserSetting("openlastproject", false);
        if (openLast)
        {
            const projectFile = settings.getCurrentProjectFile();
            if (fs.existsSync(projectFile)) patchFile = projectFile;
        }
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

        this._initCaches(() =>
        {
            this._registerListeners();
            this._registerShortcuts();
            this.openPatch(patchFile).then(() =>
            {
                this._log.logStartup("electron loaded");
            });
        });
    }

    async pickProjectFileDialog()
    {
        let title = "select patch";
        let properties = ["openFile"];
        return this._projectFileDialog(title, properties);
    }

    async pickFileDialog(filePath, asUrl = false, filter = [])
    {
        let title = "select file";
        let properties = ["openFile"];
        return this._fileDialog(title, filePath, asUrl, filter, properties);
    }

    async saveProjectFileDialog(type = "project")
    {
        const extensions = [];
        extensions.push(projectsUtil.CABLES_PROJECT_FILE_EXTENSION);

        let title = "select patch";
        let properties = ["createDirectory"];
        return dialog.showSaveDialog(this.editorWindow, {
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
                const patchFile = result.filePath;
                if (type === "project")
                {
                    const currentProject = settings.getCurrentProject();
                    if (currentProject)
                    {
                        currentProject.name = path.basename(patchFile);
                        currentProject.summary = currentProject.summary || {};
                        currentProject.summary.title = currentProject.name;
                        projectsUtil.writeProjectToFile(patchFile, currentProject);
                    }
                }
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

    async openPatch(patchFile, rebuildCache = true)
    {
        this._unsavedContentLeave = false;
        const open = async () =>
        {
            electronApi.loadProject(patchFile);
            if (patchFile)
            {
                const npmResults = await electronApi.installProjectDependencies();
                if (npmResults.success && npmResults.msg !== "EMPTY" && npmResults.data.length > 0)
                {
                    npmResults.data.forEach((npmResult) =>
                    {
                        let logEntry = "installed op dependencies for " + npmResult.opName;
                        if (npmResult.packages) logEntry += " (" + npmResult.packages.join(",") + ")";
                        this._log.logStartup(logEntry);
                    });
                }
            }
            this.updateTitle();
            await this.editorWindow.loadFile("index.html");
            this._log.logStartup("loaded", patchFile);
            const userZoom = settings.get(settings.WINDOW_ZOOM_FACTOR); // maybe set stored zoom later
            this.editorWindow.webContents.setZoomFactor(1.0);
        };

        if (this.isDocumentEdited())
        {
            const leave = this._unsavedContentDialog();
            if (leave)
            {
                if (rebuildCache)
                {
                    doc.rebuildOpCaches(open, ["core", "teams", "extensions"], true);
                }
                else
                {
                    await open();
                }
            }
        }
        else
        {
            if (rebuildCache)
            {
                doc.rebuildOpCaches(open, ["core", "teams", "extensions"], true);
            }
            else
            {
                await open();
            }
        }
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
        }
        const projectFile = settings.getCurrentProjectFile();
        if (projectFile)
        {
            title = title + " - " + projectFile;
        }
        const project = settings.getCurrentProject();
        if (project)
        {
            this.sendTalkerMessage("updatePatchName", { "name": project.name });
            this.sendTalkerMessage("updatePatchSummary", { "summary": project.summary });
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

    _projectFileDialog(title, properties)
    {
        const extensions = [];
        extensions.push(projectsUtil.CABLES_PROJECT_FILE_EXTENSION);

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
                let projectFile = result.filePaths[0];
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
        const projectFile = settings.getCurrentProjectFile();
        this.openPatch(projectFile, false).then(() => { this._log.debug("reloaded", projectFile); });
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
        localShortcut.register(this.editorWindow, "CmdOrCtrl+=", this._zoomIn.bind(this));
        localShortcut.register(this.editorWindow, "CmdOrCtrl+Plus", this._zoomIn.bind(this));
        localShortcut.register(this.editorWindow, "CmdOrCtrl+-", this._zoomOut.bind(this));
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
            if (!this._unsavedContentLeave && this.isDocumentEdited())
            {
                const leave = this._unsavedContentDialog();
                if (leave) event.preventDefault();
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

    _zoomIn()
    {
        let newZoom = this.editorWindow.webContents.getZoomFactor() + 0.2;
        this.editorWindow.webContents.setZoomFactor(newZoom);
        settings.set(settings.WINDOW_ZOOM_FACTOR, newZoom);
    }

    _zoomOut()
    {
        let newZoom = this.editorWindow.webContents.getZoomFactor() - 0.2;
        newZoom = Math.round(newZoom * 100) / 100;
        if (newZoom > 0)
        {
            this.editorWindow.webContents.setZoomFactor(newZoom);
            settings.set(settings.WINDOW_ZOOM_FACTOR, newZoom);
        }
    }

    _initCaches(cb)
    {
        doc.addOpsToLookup([], true);
        cb();
    }

    _handleError(title, error)
    {
        this._log.error(title, error);
        if (app.isReady())
        {
            const buttons = [
                "Reload",
                "New Patch",
                process.platform === "darwin" ? "Copy Error" : "Copy error",
            ];
            const buttonIndex = dialog.showMessageBoxSync({
                "type": "error",
                buttons,
                "defaultId": 0,
                "noLink": true,
                "message": title,
                "detail": error.stack,
            });
            if (buttonIndex === 0)
            {
                this.reload();
            }
            if (buttonIndex === 1)
            {
                this.openPatch(null);
            }
            if (buttonIndex === 2)
            {
                clipboard.writeText(title + "\n" + error.stack);
            }
        }
        else
        {
            dialog.showErrorBox(title, (error.stack));
        }
    }

    _unsavedContentDialog()
    {
        if (this._unsavedContentLeave) return true;
        const choice = dialog.showMessageBoxSync(this.editorWindow, {
            "type": "question",
            "buttons": ["Leave", "Stay"],
            "title": "unsaved content!",
            "message": "unsaved content!",
            "defaultId": 0,
            "cancelId": 1
        });
        this._unsavedContentLeave = (choice === 0);
        return this._unsavedContentLeave;
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
