// eslint-disable-next-line import/no-extraneous-dependencies
import { app, BrowserWindow, dialog, Menu, shell, clipboard, nativeTheme, nativeImage, screen } from "electron";
import path from "path";
import localShortcut from "electron-localshortcut";
import fs from "fs";
import os from "os";
import jsonfile from "jsonfile";
import { TalkerAPI } from "cables-shared-client";
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
import opsUtil from "../utils/ops_util.js";
import cables from "../cables.js";

app.commandLine.appendSwitch("disable-http-cache", "true");
if (!app.commandLine.hasSwitch("dont-force-dgpu")) app.commandLine.appendSwitch("force_high_performance_gpu", "true");
if (app.commandLine.hasSwitch("force-igpu"))
{
    logger.warn("forcing use of internal GPU, this might be slow!");
    app.commandLine.appendSwitch("force_low_power_gpu", "true");
}
app.commandLine.appendSwitch("lang", "EN");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("no-user-gesture-required", "true");
app.commandLine.appendSwitch("disable-hid-blocklist", "true");
app.commandLine.appendSwitch("enable-web-bluetooth");
app.disableDomainBlockingFor3DAPIs();

logger.info("--- starting");

class ElectronApp
{
    constructor()
    {
        this._log = logger;
        this.appName = "name" in app ? app.name : app.getName();
        this.appIcon = nativeImage.createFromPath("../../resources/cables.png");

        let _cliHelpText = "\n";
        _cliHelpText += "Options:\n";
        _cliHelpText += "  --help                Show this help.\n";
        _cliHelpText += "  --fullscreen          Open in fullscreen mode.\n";
        _cliHelpText += "  --maximize-renderer   Switch renderer to fullscreen on start (ESC to exit).\n";
        _cliHelpText += "  --force-igpu          Force using integrated GPU when there are multiple GPUs available.\n";
        _cliHelpText += "  --dont-force-dgpu     DO NOT force using discrete GPU when there are multiple GPUs available.\n";
        _cliHelpText += "\n";

        if (app.commandLine.hasSwitch("help") || app.commandLine.hasSwitch("usage"))
        {
            console.log(_cliHelpText);
            process.exit(0);
        }

        let openFullscreen = settings.getUserSetting("openfullscreen", false);
        if (!openFullscreen && app.commandLine.hasSwitch("fullscreen")) openFullscreen = true;
        this._openFullscreen = openFullscreen;

        let maximizeRenderer = settings.getUserSetting("maximizerenderer", false);
        if (!maximizeRenderer && app.commandLine.hasSwitch("maximize-renderer")) maximizeRenderer = true;
        this._maximizeRenderer = maximizeRenderer;

        this._defaultWindowBounds = {
            "width": 1920,
            "height": 1080
        };

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

        const initialDevToolsOpen = (event, win) =>
        {
            if (settings.get(settings.OPEN_DEV_TOOLS_FIELD))
            {
                win.webContents.once("dom-ready", this._toggleDevTools.bind(this));
            }
            app.off("browser-window-created", initialDevToolsOpen);
        };
        app.on("browser-window-created", initialDevToolsOpen);

        nativeTheme.themeSource = "dark";
    }

    init()
    {
        const displays = screen.getAllDisplays();
        this._displaySetupId = "";
        if (displays)
        {
            displays.forEach((display, index) =>
            {
                if (index > 0) this._displaySetupId += ":";
                this._displaySetupId += display.id + "@";
                if (display.size && display.size.width)
                {
                    this._displaySetupId += display.size.width;
                }
                else
                {
                    this._displaySetupId += "unknown";
                }
                this._displaySetupId += "/";
                if (display.size && display.size.height)
                {
                    this._displaySetupId += display.size.height;
                }
                else
                {
                    this._displaySetupId += "unknown";
                }
            });
        }
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
                "excludeNpmCwd": true
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
        if (!targetDir || !packageNames || packageNames.length === 0) return {
            "stdout": "nothing to install",
            "packages": []
        };

        const result = await this._installNpmPackages(packageNames, targetDir, opName);
        if (opName) result.opName = opName;

        if (fs.existsSync(path.join(targetDir, "package.json"))) fs.rmSync(path.join(targetDir, "package.json"));
        if (fs.existsSync(path.join(targetDir, "package-lock.json"))) fs.rmSync(path.join(targetDir, "package-lock.json"));
        return result;
    }

    async addOpPackage(targetDir, opPackageLocation)
    {
        if (!targetDir || !opPackageLocation) return {
            "stdout": "nothing to install",
            "packages": []
        };

        const dirName = path.join(os.tmpdir(), "cables-oppackage-");
        const tmpDir = fs.mkdtempSync(dirName);

        const result = await this._installNpmPackages([opPackageLocation], tmpDir);

        const nodeModulesDir = path.join(tmpDir, "node_modules");
        if (fs.existsSync(nodeModulesDir))
        {
            const importedDocs = doc.getOpDocsInDir(nodeModulesDir);
            Object.keys(importedDocs).forEach((opDocFile) =>
            {
                const opDoc = importedDocs[opDocFile];
                const opName = opDoc.name;
                const sourceDir = path.join(nodeModulesDir, path.dirname(opDocFile));
                let opTargetDir = path.join(targetDir, opsUtil.getOpTargetDir(opName, true));
                fs.cpSync(sourceDir, opTargetDir, { "recursive": true });
                result.packages.push(opName);
            });
            fs.rmSync(tmpDir, { "recursive": true });
        }
        return result;
    }

    async _installNpmPackages(packageNames, targetDir, opName = null)
    {
        this._npm.config.localPrefix = targetDir;
        let result = {
            "stdout": "",
            "stderr": "",
            "packages": packageNames,
            "targetDir": targetDir
        };

        // packaged ops have node_modules installed already
        if (cables.inPackage(targetDir)) return result;

        const oldConsole = console.log;
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
                    result.error = true;
                    result.stderr += arg;
                });
                break;
            case "buffer":
            case "flush":
            default:
            }
        };
        process.on("output", logToVariable);
        console.log = (l) => { result.stdout += l; };
        this._log.debug("installing", packageNames, "to", targetDir);
        try
        {
            await this._npm.exec("install", packageNames);
        }
        catch (e)
        {
            result.exception = String(e);
            result.error = true;
            result.stderr += e + e.stderr;
            if (e.script && e.script.includes("gyp")) result.nativeCompile = true;
        }
        process.off("output", logToVariable);
        console.log = oldConsole;
        if (result.exception && result.exception === "Error: command failed")
        {
            if (result.nativeCompile)
            {
                if (targetDir.includes(" "))
                {
                    result.stderr = "tried to compile native module <a href=\"https://github.com/nodejs/node-gyp/issues/65\" target=\"_blank\">with a space in the pathname</a>, try moving your op...";
                }
                else
                {
                    result.stderr = "failed to natively compile using node-gyp";
                    if (opName)
                    {
                        const onClick = "CABLES.CMD.ELECTRON.openOpDir('', '" + opName + "');";
                        const opDir = opsUtil.getOpSourceDir(opName);
                        result.stderr += ", try running `npm --prefix ./ install " + packageNames.join(" ") + "` manually <a onclick=\"" + onClick + "\">in the op dir</a>: `" + opDir + "`";
                    }
                }
            }
        }
        return result;
    }

    _createWindow()
    {
        let patchFile = null;
        const openLast = settings.getUserSetting("openlastproject", false) || this._initialPatchFile;
        if (openLast)
        {
            const projectFile = this._initialPatchFile || settings.getCurrentProjectFile();
            if (fs.existsSync(projectFile)) patchFile = projectFile;
            this._initialPatchFile = null;
        }

        const defaultWindowOptions = {
            "width": 1920,
            "height": 1080,
            "backgroundColor": "#222",
            "icon": this.appIcon,
            "autoHideMenuBar": true,
            "fullscreen": this._openFullscreen,
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
        };

        this.editorWindow = new BrowserWindow(defaultWindowOptions);
        this.editorWindow.setFullScreenable(true);

        let windowBounds = this._defaultWindowBounds;
        if (settings.getUserSetting("storeWindowBounds", true))
        {
            const userWindowBounds = settings.get(settings.WINDOW_BOUNDS);
            if (userWindowBounds)
            {
                if (userWindowBounds.x && userWindowBounds.y && userWindowBounds.width && userWindowBounds.height)
                {
                    // migrate old stored bounds
                    userWindowBounds[this._displaySetupId] = {
                        "x": userWindowBounds.x,
                        "y": userWindowBounds.y,
                        "width": userWindowBounds.width,
                        "height": userWindowBounds.height
                    };
                    delete userWindowBounds.x;
                    delete userWindowBounds.y;
                    delete userWindowBounds.width;
                    delete userWindowBounds.height;
                }
                if (userWindowBounds[this._displaySetupId])
                {
                    windowBounds = userWindowBounds[this._displaySetupId];
                }
            }

        }

        this.editorWindow.setBounds(windowBounds);

        this._initCaches(() =>
        {
            this._registerListeners();
            this._registerShortcuts();
            this.openPatch(patchFile, false).then(() =>
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

    async saveFileDialog(defaultPath, title = null, properties = [], filters = [])
    {
        title = title || "select directory";
        properties = properties || ["createDirectory"];
        return dialog.showSaveDialog(this.editorWindow, {
            "title": title,
            "defaultPath": defaultPath,
            "properties": properties,
            "filters": filters
        }).then((result) =>
        {
            if (!result.canceled)
            {
                return result.filePath;
            }
            else
            {
                return null;
            }
        });
    }

    async pickDirDialog(defaultPath = null)
    {
        let title = "select file";
        let properties = ["openDirectory", "createDirectory"];
        return this._dirDialog(title, properties, defaultPath);
    }

    async exportProjectFileDialog(exportName)
    {
        const extensions = [];
        extensions.push("zip");

        let title = "select directory";
        let properties = ["createDirectory"];
        return dialog.showSaveDialog(this.editorWindow, {
            "title": title,
            "defaultPath": exportName,
            "properties": properties,
            "filters": [{
                "name": "cables project",
                "extensions": extensions
            }]
        }).then((result) =>
        {
            if (!result.canceled)
            {
                return result.filePath;
            }
            else
            {
                return null;
            }
        });
    }

    async saveProjectFileDialog(defaultPath)
    {
        const extensions = [];
        extensions.push(projectsUtil.CABLES_PROJECT_FILE_EXTENSION);

        let title = "select patch";
        let properties = ["createDirectory"];
        return dialog.showSaveDialog(this.editorWindow, {
            "title": title,
            "properties": properties,
            "defaultPath": defaultPath,
            "filters": [{
                "name": "cables project",
                "extensions": extensions
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
        const aboutMenu = [];
        aboutMenu.push({
            "label": "About Cables",
            "click": () => { this._showAbout(); }
        });
        aboutMenu.push({ "type": "separator" });
        if (isOsX)
        {
            aboutMenu.push({ "role": "services" });
            aboutMenu.push({ "type": "separator" });
            aboutMenu.push({
                "role": "hide",
                "label": "Hide Cables"
            });
            aboutMenu.push({ "role": "hideOthers" });
            aboutMenu.push({ "role": "unhide" });
            aboutMenu.push({ "type": "separator" });
        }

        aboutMenu.push({
            "role": "quit",
            "label": "Quit",
            "accelerator": "CmdOrCtrl+Q",
            "click": () => { app.quit(); }
        });

        const menuTemplate = [
            {
                "role": "appMenu",
                "label": "Cables",
                "submenu": aboutMenu
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
                    {
                        "label": "Open Recent",
                        "role": "recentdocuments",
                        "submenu": [
                            {
                                "label": "Clear Recent",
                                "role": "clearrecentdocuments"
                            }
                        ]
                    }
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
                    { "role": "selectAll" }

                ]
            },
            {
                "label": "Window",
                "submenu": [
                    {
                        "role": "minimize"
                    },
                    {
                        "role": "zoom",
                        "visible": isOsX
                    },
                    { "role": "togglefullscreen" },
                    {
                        "label": "Reset Size and Position",
                        "click": () =>
                        {
                            this._resetSizeAndPostion();
                        }
                    },
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
                        "label": "Insepect Elements",
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
                    {
                        "role": "close",
                        "visible": false
                    }
                ]
            }
        ];
        // prevent osx from showin currently running process as name (e.g. `npm`)
        if (process.platform == "darwin") menuTemplate.unshift({ "label": "" });
        let menu = Menu.buildFromTemplate(menuTemplate);

        Menu.setApplicationMenu(menu);
    }

    openFile(patchFile)
    {
        if (this.editorWindow)
        {
            this.openPatch(patchFile, true);
        }
        else
        {
            // opened by double-clicking and starting the app
            this._initialPatchFile = patchFile;
        }
    }

    async openPatch(patchFile, rebuildCache = true)
    {
        this._unsavedContentLeave = false;
        const open = async () =>
        {
            electronApi.loadProject(patchFile, null, rebuildCache);
            this.updateTitle();
            await this.editorWindow.loadFile("index.html");
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
            this.sendTalkerMessage(TalkerAPI.CMD_UI_UPDATE_PATCH_NAME, { "name": project.name });
        }

        this.editorWindow.setTitle(title);
    }

    _dirDialog(title, properties, defaultPath = null)
    {
        const options = {
            "title": title,
            "properties": properties
        };
        if (defaultPath) options.defaultPath = defaultPath;
        return dialog.showOpenDialog(this.editorWindow, options).then((result) =>
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

    _fileDialog(title, filePath = null, asUrl = false, filters = [], properties = null)
    {
        if (filters)
        {
            filters.forEach((filter, i) =>
            {
                filter.extensions.forEach((ext, j) =>
                {
                    if (ext.startsWith(".")) filters[i].extensions[j] = ext.replace(".", "");
                });
            });
        }
        const options = {
            "title": title,
            "properties": properties,
            "filters": filters || []
        };
        if (filePath) options.defaultPath = filePath;
        return dialog.showOpenDialog(this.editorWindow, options).then((result) =>
        {
            if (!result.canceled)
            {
                if (!asUrl) return result.filePaths[0];
                return helper.pathToFileURL(result.filePaths[0]);
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
                "extensions": extensions
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
        this.editorWindow.setDocumentEdited(edited);
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
        this.editorWindow.webContents.send("talkerMessage", {
            "cmd": cmd,
            "data": data
        });
    }

    openFullscreen()
    {
        return this._openFullscreen;
    }

    maximizeRenderer()
    {
        return this._maximizeRenderer;
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
        let currentWindow = BrowserWindow.getFocusedWindow();
        if (!currentWindow) currentWindow = this.editorWindow;

        if (currentWindow.webContents.isDevToolsOpened())
        {
            currentWindow.webContents.closeDevTools();
        }
        else
        {
            currentWindow.webContents.openDevTools({ "mode": "previous" });
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

        this.editorWindow.on("close", () =>
        {
            if (this._openFullscreen) return;
            if (settings.getUserSetting("storeWindowBounds", true))
            {
                const windowBounds = settings.get(settings.WINDOW_BOUNDS) || {};
                windowBounds[this._displaySetupId] = this.editorWindow.getBounds();
                settings.set(settings.WINDOW_BOUNDS, windowBounds);
            }
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

        this.editorWindow.webContents.session.on("will-download", (event, item, webContents) =>
        {
            if (item)
            {
                const filename = item.getFilename();
                const savePath = path.join(settings.getDownloadPath(), filename);
                // Set the save path, making Electron not to prompt a save dialog.
                item.setSavePath(savePath);
                const fileUrl = helper.pathToFileURL(savePath);
                const cablesUrl = fileUrl.replace("file:", "cables:///openDir/");
                const link = "<a href=\"" + cablesUrl + "\" download>" + savePath + "</a>";
                this.sendTalkerMessage(TalkerAPI.CMD_UI_NOTIFY, { "msg": "File saved to " + link });
            }
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

    _resetSizeAndPostion()
    {
        if (this.editorWindow)
        {
            this.editorWindow.setBounds(this._defaultWindowBounds);
            this.editorWindow.center();
        }
    }

    _initCaches(cb)
    {
        doc.addOpsToLookup([], true);
        const opDocsFile = cables.getOpDocsFile();
        if (fs.existsSync(cables.getOpDocsFile()))
        {
            jsonfile.readFile(opDocsFile).then((cachedOpDocs) =>
            {
                if (!cachedOpDocs || !cachedOpDocs.opDocs || cachedOpDocs.opDocs.length === 0)
                {
                    this._rebuildOpDocCache(cb);
                    return;
                }
                cb();
            }).catch((e) =>
            {
                this._log.logStartup("failed to parse opdocs cache file!", e);
                this._rebuildOpDocCache(cb);
            });
        }
        else
        {
            this._rebuildOpDocCache(cb);
        }

    }

    _rebuildOpDocCache(cb)
    {
        this._log.logStartup("rebuilding op caches");
        doc.rebuildOpCaches(() =>
        {
            this._log.logStartup("rebuild op caches");
            cb();
        }, ["core", "teams", "extensions"], true);
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
                process.platform === "darwin" ? "Copy Error" : "Copy error"
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
            "message": "cables standalone"
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
                versionText += "\nbuilt with:\n";
                if (buildInfo.api.platform.node) versionText += "node: " + buildInfo.api.platform.node + "\n";
                if (buildInfo.api.platform.npm) versionText += "npm: " + buildInfo.api.platform.npm;
            }
            if (process.versions)
            {
                versionText += "\n\nrunning in:\n";
                if (process.versions.electron) versionText += "electron: " + process.versions.electron + "\n";
                if (process.versions.chrome) versionText += "chrome: " + process.versions.chrome + "\n";
                if (process.versions.v8) versionText += "v8: " + process.versions.v8 + "\n";

                if (process.versions.node) versionText += "node: " + process.versions.node + "\n";
                if (buildInfo.api.platform.npm) versionText += "npm: " + buildInfo.api.platform.npm;
            }

            options.detail = versionText;
        }
        dialog.showMessageBox(options);
    }

}

Menu.setApplicationMenu(null);

const electronApp = new ElectronApp();

app.on("open-file", (e, p) =>
{
    if (p.endsWith("." + projectsUtil.CABLES_PROJECT_FILE_EXTENSION) && fs.existsSync(p))
    {
        electronApp.openFile(p);
    }
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

export default electronApp;
