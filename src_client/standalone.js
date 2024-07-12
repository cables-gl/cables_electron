import log from "electron-log/renderer.js";
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
        this._log = log;
        const logFormat = "{text}";
        this._log.initialize();
        this._log.transports.console.format = logFormat;
        this._log.transports.ipc.level = "debug";

        Object.assign(console, this._log.functions);

        window.ipcRenderer = this._electron.ipcRenderer; // needed to have ipcRenderer in electron_editor.js
        this._settings = this._electron.ipcRenderer.sendSync("settings");
        this._config = this._electron.ipcRenderer.sendSync("config");
        this.editorIframe = null;

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
            if (this.editorWindow && this.editorWindow.loadjs)
            {
                this.editorWindow.loadjs.ready("cables_core", this._coreReady.bind(this));
                this.editorWindow.loadjs.ready("cablesuinew", this._uiReady.bind(this));
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

    _coreReady(depsNotFound)
    {
        if (!depsNotFound && this.CABLES)
        {
            if (this.CABLES.Op)
            {
                const standAlone = this;
                this.CABLES.Op.prototype.require = function (moduleName)
                {
                    standAlone._opRequire(moduleName, standAlone, this);
                };
                Object.defineProperty(this.CABLES.Op.prototype, "__dirname", { "get": function ()
                {
                    return window.ipcRenderer.sendSync("getOpDir", { "name": this.name, "opId": this.opId });
                } });
            }
            if (this.CABLES.Patch)
            {
                Object.defineProperty(this.CABLES.Patch.prototype, "__dirname", { "get": this._patchDir.bind(this) });
            }
        }
    }

    _uiReady(depsNotFound)
    {
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
        }
    }

    _opRequire(moduleName, thisClass, op)
    {
        if (op) op.setUiError("oprequire", null);
        if (moduleName === "electron") return thisClass._electron;
        try
        {
            const modulePath = thisClass._path.join(thisClass._settings.currentPatchDir, "node_modules", moduleName);
            console.debug("trying to load", modulePath);
            return window.nodeRequire(modulePath);
        }
        catch (e)
        {
            try
            {
                console.debug("trying to load native module", moduleName);
                return window.nodeRequire(moduleName);
            }
            catch (e2)
            {
                const errorMessage = "failed to load node module \"" + moduleName + "\" do you need to run `npm install`?";
                if (op) op.setUiError("oprequire", errorMessage);
                console.error(errorMessage, e2);
                return "";
            }
        }
    }

    _patchDir(...args)
    {
        return this._settings.currentPatchDir;
    }
}
