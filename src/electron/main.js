import { app, BrowserWindow, dialog, Menu, shell, clipboard, nativeTheme, nativeImage } from "electron";
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
// this needs to be imported like this to not have to asarUnpack the entire nodejs world - sm,25.07.2024
import Npm from "../../node_modules/npm/lib/npm.js";

app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("unsafely-disable-devtools-self-xss-warnings");
app.commandLine.appendSwitch("lang", "EN");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("no-user-gesture-required", "true");

logger.info("--- starting");

class ElectronApp
{
    constructor()
    {
        this._log = logger;
        this.appName = "name" in app ? app.name : app.getName();
        this.appIcon = nativeImage.createFromPath("../../resources/cables.png");

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
                win.webContents.once("dom-ready", this._toggleDevTools.bind(this));
            }
        });

        nativeTheme.themeSource = "dark";
    }

    init()
    {
        this._createWindow();
        this._createMenu();
        this._loadNpm();
    }

    _loadNpm(cb = null)
    {
        try
        {
            this._npm = new Npm({
                "argv": [
                    "--no-save",
                    "--no-package-lock",
                    "--legacy-peer-deps",
                    "--no-progress",
                    "--no-color",
                    "--yes",
                    "--no-fund",
                    "--no-audit"
                ],
                "excludeNpmCwd": true,
            });
            this._npm.load().then(() =>
            {
                this._log.info("loaded npm", this._npm.version);
            });
        }
        catch (e)
        {
            this._log.error("failed to load npm", e);
        }
    }

    async installPackages(targetDir, packageNames, opName = null)
    {
        if (!targetDir || !packageNames || packageNames.length === 0) return { "stdout": "nothing to install", "packages": [] };
        let result = { "stdout": "", "stderr": "", "packages": packageNames, "targetDir": targetDir };
        if (opName) result.opName = opName;
        this._npm.config.localPrefix = targetDir;
        const logToVariable = (level, ...args) =>
        {
            switch (level)
            {
            case "standard":
                args.forEach((arg) =>
                {
                    result.stdout += arg;
                });
                break;
            case "error":
                args.forEach((arg) =>
                {
                    result.stderr += arg;
                });
                break;
            case "buffer":
            case "flush":
            default:
            }
        };
        process.on("output", logToVariable);
        this._log.debug("installing", packageNames, "to", opName, targetDir);
        try
        {
            await this._npm.exec("install", packageNames);
        }
        catch (e)
        {
            result.stderr += e;
        }
        process.off("output", logToVariable);
        if (fs.existsSync(path.join(targetDir, "package.json"))) fs.rmSync(path.join(targetDir, "package.json"));
        if (fs.existsSync(path.join(targetDir, "package-lock.json"))) fs.rmSync(path.join(targetDir, "package-lock.json"));
        return result;
    }

    _createWindow()
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
            "backgroundColor": "#222",
            "icon": this.appIcon,
            "autoHideMenuBar": true,
            "webPreferences": {
                "defaultEncoding": "utf-8",
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
                "v8CacheOptions": "none",
                "backgroundThrottling": false,
                "autoplayPolicy": "no-user-gesture-required"
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

    async saveProjectFileDialog()
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
                let patchFile = result.filePath;
                if (!patchFile.endsWith(projectsUtil.CABLES_PROJECT_FILE_EXTENSION))
                {
                    patchFile += "." + projectsUtil.CABLES_PROJECT_FILE_EXTENSION;
                }
                const currentProject = settings.getCurrentProject();
                if (currentProject)
                {
                    currentProject.name = path.basename(patchFile);
                    currentProject.summary = currentProject.summary || {};
                    currentProject.summary.title = currentProject.name;
                    projectsUtil.writeProjectToFile(patchFile, currentProject);
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

    _createMenu()
    {
        const isOsX = process.platform === "darwin";
        let devToolsAcc = "CmdOrCtrl+Shift+I";
        let inspectElementAcc = "CmdOrCtrl+Shift+C";
        let consoleAcc = "CmdOrCtrl+Shift+J";
        if (isOsX)
        {
            devToolsAcc = "CmdOrCtrl+Option+I";
            inspectElementAcc = "CmdOrCtrl+Option+C";
            consoleAcc = "CmdOrCtrl+Option+J";
        }

        const menuTemplate = [
            {
                "role": "appMenu",
                "label": "cables",
                "submenu": [
                    {
                        "label": "About Cables",
                        "click": () =>
                        {
                            this._showAbout();
                        }
                    },
                    {
                        "type": "separator"
                    },
                    {
                        "role": "quit",
                        "label": "Quit",
                        "accelerator": "CmdOrCtrl+Q",
                        "click": () =>
                        {
                            app.quit();
                        }
                    }
                ]
            },
            {
                "label": "File",
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
                ]
            },
            {
                "label": "Edit",
                "submenu": [
                    { "role": "undo" }, { "role": "redo" },
                    { "type": "separator" },
                    { "role": "cut" },
                    { "role": "copy" },
                    { "role": "paste" },
                ]
            },
            {
                "label": "Window",
                "submenu": [
                    {
                        "role": "minimize",
                    },
                    {
                        "role": "zoom",
                        "visible": isOsX
                    },
                    { "role": "togglefullscreen" },
                    { "type": "separator" },
                    {
                        "label": "Zoom In",
                        "accelerator": "CmdOrCtrl+Plus",
                        "click": () =>
                        {
                            this._zoomIn();
                        }
                    },
                    {
                        "label": "Zoom Out",
                        "accelerator": "CmdOrCtrl+-",
                        "click": () =>
                        {
                            this._zoomOut();
                        }
                    },
                    {
                        "label": "Reset Zoom",
                        "click": () =>
                        {
                            this._resetZoom();
                        }
                    },
                    { "type": "separator" },
                    {
                        "label": "Developer Tools",
                        "accelerator": devToolsAcc,
                        "click": () =>
                        {
                            this._toggleDevTools();
                        }
                    },
                    {
                        "label": "Insepect elements",
                        "accelerator": inspectElementAcc,
                        "click": () =>
                        {
                            this._inspectElements();
                        }
                    },
                    {
                        "label": "JavaScript Console",
                        "accelerator": consoleAcc,
                        "click": () =>
                        {
                            this._toggleDevTools();
                        }
                    },
                    { "role": "close", "visible": false }
                ]
            }
        ];
        // prevent osx from showin currently running process as name (e.g. `npm`)
        if (process.platform == "darwin") { menuTemplate.unshift({ "label": "" }); }
        let menu = Menu.buildFromTemplate(menuTemplate);

        Menu.setApplicationMenu(menu);
    }

    async openPatch(patchFile, rebuildCache = true)
    {
        this._unsavedContentLeave = false;
        const open = async () =>
        {
            electronApi.loadProject(patchFile);
            this.updateTitle();
            await this.editorWindow.loadFile("index.html");
            this._log.logStartup("loaded", patchFile);
            const userZoom = settings.get(settings.WINDOW_ZOOM_FACTOR); // maybe set stored zoom later
            this._resetZoom();
            if (rebuildCache) doc.rebuildOpCaches(() => { this._log.logStartup("rebuild op caches"); }, ["core", "teams", "extensions"], true);
        };

        if (this.isDocumentEdited())
        {
            const leave = this._unsavedContentDialog();
            if (leave)
            {
                await open();
            }
        }
        else
        {
            await open();
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
        app.on("browser-window-created", (e, win) =>
        {
            win.setMenuBarVisibility(false);
        });

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

    _resetZoom()
    {
        this.editorWindow.webContents.setZoomFactor(1.0);
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
                "&Reload",
                "&New Patch",
                "&Quit",
                process.platform === "darwin" ? "Copy Error" : "Copy error",
            ];
            const buttonIndex = dialog.showMessageBoxSync({
                "type": "error",
                buttons,
                "defaultId": 0,
                "noLink": true,
                "message": title,
                "detail": error.stack,
                "normalizeAccessKeys": true
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
                app.quit();
            }
            if (buttonIndex === 3)
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

    _showAbout()
    {
        const options = {
            "icon": this.appIcon,
            "type": "info",
            "buttons": [],
            "message": "cables standalone",
        };

        const buildInfo = settings.getBuildInfo();
        if (buildInfo)
        {
            let versionText = "";
            if (buildInfo.api.git)
            {
                if (buildInfo.api.version)
                {
                    versionText += "version: " + buildInfo.api.version + "\n";
                }
                else
                {
                    versionText += "local build" + "\n\n";
                    if (buildInfo.api.git)
                    {
                        versionText += "branch: " + buildInfo.api.git.branch + "\n";
                        versionText += "message: " + buildInfo.api.git.message + "\n";
                    }
                }
                if (buildInfo.api.git.tag) versionText += "tag: " + buildInfo.api.git.tag + "\n";
            }
            if (buildInfo.api.platform)
            {
                versionText += "\n";
                if (buildInfo.api.platform.node) versionText += "node: " + buildInfo.api.platform.node + "\n";
                if (buildInfo.api.platform.npm) versionText += "npm: " + buildInfo.api.platform.npm;
            }
            options.detail = versionText;
        }
        dialog.showMessageBox(options);
    }
}
Menu.setApplicationMenu(null);


app.whenReady().then(() =>
{
    electronApp.init();
    electronApi.init();
    electronEndpoint.init();
    app.on("activate", () =>
    {
        if (BrowserWindow.getAllWindows().length === 0) electronApp.init();
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
