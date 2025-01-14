import { Logger } from "cables-shared-client";
import ElectronEditor from "./electron_editor.js";
import electronCommands from "./cmd_electron.js";

/**
 * frontend class for cablesElectron
 * initializes the ui, starts the editor and adds functions custom to this platform
 */
export default class CablesElectron
{
    constructor()
    {
        this._electron = window.nodeRequire("electron");
        this._importSync = window.nodeRequire("import-sync");

        window.ipcRenderer = this._electron.ipcRenderer; // needed to have ipcRenderer in electron_editor.js
        this._settings = this._electron.ipcRenderer.sendSync("platformSettings") || {};
        this._usersettings = this._settings.userSettings;
        delete this._settings.userSettings;
        this._config = this._electron.ipcRenderer.sendSync("cablesConfig") || {};
        this.editorIframe = null;

        this._startUpLogItems = this._electron.ipcRenderer.sendSync("getStartupLog") || [];

        if (!this._config.isPackaged) window.ELECTRON_DISABLE_SECURITY_WARNINGS = true;

        this._loadedModules = {};
    }

    /**
     * the `gui` object of the current editor, if initialized
     *
     * @type {Gui|null}
     */
    get gui()
    {
        return this.editorWindow ? this.editorWindow.gui : null;
    }

    /**
     * the current editor window, if initialized
     *
     * @type {{}|null}
     */
    get editorWindow()
    {
        return this.editorIframe.contentWindow;
    }

    /**
     * the CABLES core instance of the current editor window, if initialized
     *
     * @type {{}|null}
     */
    get CABLES()
    {
        return this.editorWindow ? this.editorWindow.CABLES : null;
    }

    /**
     * initialize the editor, wait for core and ui to be ready, add
     * custom functionality
     */
    init()
    {
        this.editorIframe = document.getElementById("editorIframe");
        let src = this._config.uiIndexHtml + window.location.search;
        if (window.location.hash)
        {
            src += window.location.hash;
        }
        this.editorIframe.src = src;
        this.editorIframe.onload = () =>
        {
            if (this.editorWindow)
            {
                const waitForAce = this.editorWindow.waitForAce;
                this.editorWindow.waitForAce = () =>
                {
                    this._logStartup("loading", this._settings.patchFile);

                    this._incrementStartup();
                    this._logStartup("checking/installing op dependencies...");
                    this._electron.ipcRenderer.invoke("talkerMessage", "installProjectDependencies").then((npmResult) =>
                    {
                        this.editorWindow.CABLESUILOADER.cfg.patchConfig.onError = (...args) =>
                        {
                            // npm runtime error...
                            if (args && args[0] === "core_patch" && args[2] && args[2].message && args[2].message.includes("was compiled against a different Node.js version"))
                            {
                                const dirParts = args[2].message.split("/");
                                const opNameIndex = dirParts.findIndex((part) => { return part.startsWith("Ops."); });
                                const opName = dirParts[opNameIndex];
                                const packageName = dirParts[opNameIndex + 2];
                                const onClick = "CABLES.CMD.ELECTRON.openOpDir('', '" + opName + "');";

                                const msg = "try running this <a onclick=\"" + onClick + "\" > in the op dir</a>:";
                                this._log.error(msg);
                                this._log.error("`npm --prefix ./ install " + packageName + "`");
                                this._log.error("`npx \"@electron/rebuild\" -v " + process.versions.electron);
                            }
                        };
                        waitForAce();

                        if (npmResult.error && npmResult.data && npmResult.msg !== "UNSAVED_PROJECT")
                        {
                            npmResult.data.forEach((msg) =>
                            {
                                const opName = msg.opName ? " for " + msg.opName : "";
                                this._log.error("failed dependency" + opName + ": " + msg.stderr);
                            });
                        }
                        else if (npmResult.msg !== "EMPTY" && npmResult.msg !== "UNSAVED_PROJECT")
                        {
                            npmResult.data.forEach((result) =>
                            {
                                const npmText = result.stderr || result.stdout;
                                this._logStartup(result.opName + ": " + npmText);
                            });
                        }


                        if (this.gui)
                        {
                            this.gui.on("uiloaded", () =>
                            {
                                if (this.editor && this.editor.config && !this.editor.config.patchFile) this.gui.setStateUnsaved();
                            });
                        }
                    });
                };
                if (this._settings.uiLoadStart) this.editorWindow.CABLESUILOADER.uiLoadStart -= this._settings.uiLoadStart;
                this._startUpLogItems.forEach((logEntry) =>
                {
                    this._logStartup(logEntry.title);
                });
                if (this.editorWindow.loadjs)
                {
                    this.editorWindow.loadjs.ready("cables_core", this._coreReady.bind(this));
                    this.editorWindow.loadjs.ready("cablesuinew", this._uiReady.bind(this));
                }
            }
        };

        window.addEventListener("message", (event) =>
        {
            if (event.data && event.data.type === "hashchange")
            {
                window.location.hash = event.data.data;
            }
        }, false);

        window.addEventListener("hashchange", () =>
        {
            if (this.editorWindow)
            {
                this.editorWindow.postMessage({ "type": "hashchange", "data": window.location.hash }, "*");
            }
        }, false);

        this.editor = new ElectronEditor({
            "config": {
                ...this._settings,
                "isTrustedPatch": true,
                "platformClass": "PlatformElectron",
                "urlCables": "cables://",
                "urlSandbox": "cables://",
                "communityUrl": this._config.communityUrl,
                "user": this._settings.currentUser,
                "usersettings": { "settings": this._usersettings },
                "isDevEnv": !this._config.isPackaged,
                "env": this._config.env,
                "patchId": this._settings.patchId,
                "patchVersion": "",
                "socketcluster": {},
                "remoteClient": false,
                "buildInfo": this._settings.buildInfo,
                "patchConfig": {
                    "allowEdit": true,
                    "prefixAssetPath": this._settings.currentPatchDir,
                    "assetPath": this._settings.paths.assetPath,
                    "paths": this._settings.paths
                },
            }
        });
    }

    openOpDirsTab()
    {
        if (this.CABLES) this.CABLES.platform.openOpDirsTab();
    }

    _coreReady()
    {
        if (this.CABLES)
        {
            if (this.CABLES.Op)
            {
                const cablesElectron = this;
                this.CABLES.Op.prototype.require = function (moduleName)
                {
                    return cablesElectron._opRequire(moduleName, this, cablesElectron);
                };
            }
        }
    }

    _uiReady()
    {
        this._log = () =>
        {
            CABLES.UI = this.CABLES.UI;
            return new Logger("electron");
        };
        if (this.CABLES)
        {
            this.CABLES.UI.DEFAULTOPNAMES.defaultOpFallback = this.CABLES.UI.DEFAULTOPNAMES.HttpRequest;
            this.CABLES.CMD.ELECTRON = electronCommands.functions;
            this.CABLES.CMD.commands = this.CABLES.CMD.commands.concat(electronCommands.commands);
            Object.assign(this.CABLES.CMD.PATCH, electronCommands.functionOverrides.PATCH);
            Object.assign(this.CABLES.CMD.RENDERER, electronCommands.functionOverrides.RENDERER);
            const commandOverrides = electronCommands.commandOverrides;
            this.CABLES.CMD.commands.forEach((command) =>
            {
                const commandOverride = commandOverrides.find((override) => { return override.cmd === command.cmd; });
                if (commandOverride)
                {
                    Object.assign(command, commandOverride);
                }
            });
        }
    }

    _opRequire(moduleName, op, thisClass)
    {
        if (op) op.setUiError("oprequire", null);
        if (moduleName === "electron") return thisClass._electron;
        if (this._loadedModules[moduleName]) return this._loadedModules[moduleName];

        try
        {
            // load module by directory name
            const modulePath = window.ipcRenderer.sendSync("getOpModuleDir", { "opName": op.objName || op._name, "opId": op.opId, "moduleName": moduleName });
            this._loadedModules[moduleName] = window.nodeRequire(modulePath);
            return this._loadedModules[moduleName];
        }
        catch (ePath)
        {
            try
            {
                // load module by resolved filename from package.json
                const moduleFile = window.ipcRenderer.sendSync("getOpModuleLocation", { "opName": op.objName || op._name, "opId": op.opId, "moduleName": moduleName });
                this._loadedModules[moduleName] = window.nodeRequire(moduleFile);
                return this._loadedModules[moduleName];
            }
            catch (eFile)
            {
                try
                {
                    // load module by module name
                    this._loadedModules[moduleName] = window.nodeRequire(moduleName);
                    return this._loadedModules[moduleName];
                }
                catch (eName)
                {
                    try
                    {
                        const moduleFile = window.ipcRenderer.sendSync("getOpModuleLocation", { "opName": op.objName || op._name, "opId": op.opId, "moduleName": moduleName, });
                        this._loadedModules[moduleName] = this._importSync(moduleFile);
                        return this._loadedModules[moduleName];
                    }
                    catch (eImport)
                    {
                        let errorMessage = "failed to load node module: " + moduleName + "\n\n";
                        errorMessage += "require by import:\n" + eImport + "\n\n";
                        errorMessage += "require by name:\n" + eName + "\n\n";
                        errorMessage += "require by file:\n" + eFile + "\n\n";
                        errorMessage += "require by path:\n" + ePath;
                        if (op) op.setUiError("oprequire", errorMessage);
                        this._log.error(errorMessage, eName, eFile, ePath);
                        return { };
                    }
                }
            }
        }
    }

    _logStartup(title)
    {
        if (this.editorWindow && this.editorWindow.logStartup) this.editorWindow.logStartup(title);
    }

    _incrementStartup()
    {
        if (this.editorWindow && this.editorWindow.logStartup) this.editorWindow.incrementStartup();
    }
}
