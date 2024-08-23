import { Logger } from "cables-shared-client";
import ElectronEditor from "./electron_editor.js";
import electronCommands from "./cmd_electron.js";

/**
 * frontend class for cables standalone
 * initializes the ui, starts the editor and adds functions custom to this platform
 */
export default class CablesStandalone
{
    constructor()
    {
        this._path = window.nodeRequire("path");
        this._electron = window.nodeRequire("electron");
        window.ipcRenderer = this._electron.ipcRenderer; // needed to have ipcRenderer in electron_editor.js
        this._settings = this._electron.ipcRenderer.sendSync("platformSettings") || {};
        this._config = this._electron.ipcRenderer.sendSync("cablesConfig") || {};
        this.editorIframe = null;

        this._startUpLogItems = this._electron.ipcRenderer.sendSync("getStartupLog") || [];

        if (!this._config.isPackaged) window.ELECTRON_DISABLE_SECURITY_WARNINGS = true;
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
                    this._incrementStartup();
                    this._logStartup("checking/installing op dependencies...");
                    this._electron.ipcRenderer.invoke("talkerMessage", "installProjectDependencies").then((npmResult) =>
                    {
                        if (npmResult.msg !== "EMPTY" && npmResult.msg !== "UNSAVED_PROJECT")
                        {
                            npmResult.data.forEach((result) =>
                            {
                                const npmText = result.stderr || result.stdout;
                                this._logStartup(result.opName + ": " + npmText);
                            });
                        }
                        waitForAce();
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
                "isTrustedPatch": true,
                "platformClass": "PlatformStandalone",
                "urlCables": "cables://",
                "urlSandbox": "cables://",
                "user": this._settings.currentUser,
                "usersettings": { "settings": this._settings.userSettings },
                "isDevEnv": !this._config.isPackaged,
                "env": this._config.env,
                "patchId": this._settings.patchId,
                "patchVersion": "",
                "socketcluster": {},
                "remoteClient": false,
                "buildInfo": this._settings.buildInfo,
                "patchConfig": {
                    "allowEdit": true,
                    "prefixAssetPath": this._settings.currentPatchDir
                }
            }
        });
    }

    _coreReady()
    {
        if (this.CABLES)
        {
            if (this.CABLES.Op)
            {
                const standAlone = this;
                this.CABLES.Op.prototype.require = function (moduleName)
                {
                    return standAlone._opRequire(moduleName, this, standAlone);
                };
            }
            if (this.CABLES.Patch)
            {
                Object.defineProperty(this.CABLES.Patch.prototype, "patchDir", { "get": this._patchDir.bind(this) });
            }
        }
    }

    _uiReady()
    {
        this.CABLES.UI.standaloneLogger = () =>
        {
            CABLES.UI = this.CABLES.UI;
            return new Logger("standalone");
        };
        this._log = this.CABLES.UI.standaloneLogger();
        if (this.CABLES)
        {
            const getOpsForFilename = this.CABLES.UI.getOpsForFilename;
            this.CABLES.UI.getOpsForFilename = (filename) =>
            {
                let defaultOps = getOpsForFilename(filename);
                if (defaultOps.length === 0)
                {
                    defaultOps.push(this.CABLES.UI.DEFAULTOPNAMES.HttpRequest);
                    const addOpCb = this.gui.corePatch().on("onOpAdd", (newOp) =>
                    {
                        const contentPort = newOp.getPortByName("Content", false);
                        if (contentPort) contentPort.set("String");
                        this.gui.corePatch().off(addOpCb);
                    });
                }
                return defaultOps;
            };
            this.CABLES.CMD.STANDALONE = electronCommands.functions;
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
        try
        {
            const opDir = window.ipcRenderer.sendSync("getOpDir", { "opName": op.objName || op._name, "opId": op.opId });
            const modulePath = thisClass._path.join(opDir, "node_modules", moduleName);
            const theModule = window.nodeRequire(modulePath);
            this._log.info("trying to load", modulePath);
            return theModule;
        }
        catch (e)
        {
            try
            {
                this._log.info("trying to load native module", moduleName);
                return window.nodeRequire(moduleName);
            }
            catch (e2)
            {
                const errorMessage = "failed to load node module: " + moduleName;
                if (op) op.setUiError("oprequire", errorMessage);
                this._log.error(errorMessage, e2, e);
                return "";
            }
        }
    }

    _patchDir(...args)
    {
        return this._settings.currentPatchDir;
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
