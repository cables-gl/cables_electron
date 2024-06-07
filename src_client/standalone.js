import { Logger } from "cables-shared-client";
import ElectronEditor from "./electron_editor.js";
import electronCommands from "./cmd_electron.js";

class CablesStandalone
{
    constructor()
    {
        this._path = window.nodeRequire("path");
        this._electron = window.nodeRequire("electron");
        this._log = new Logger("standalone");
        window.ipcRenderer = this._electron.ipcRenderer; // needed to have ipcRenderer in electron_editor.js
        this._settings = this._electron.ipcRenderer.sendSync("settings");
        this._config = this._electron.ipcRenderer.sendSync("config");
        this.editorIframe = null;
    }

    get gui()
    {
        return this.editorIframe.contentWindow.gui;
    }

    init()
    {
        this.editorIframe = document.getElementById("editorIframe");
        let src = this._settings.uiDistPath + "/index.html" + window.location.search;
        if (window.location.hash)
        {
            src += window.location.hash;
        }
        this.editorIframe.src = src;
        this.editorIframe.onload = () =>
        {
            const iframeWindow = this.editorIframe.contentWindow;
            if (iframeWindow && iframeWindow.loadjs)
            {
                iframeWindow.loadjs.ready("cables_core", this._coreReady.bind(this));
                iframeWindow.loadjs.ready("cablesuinew", this._uiReady.bind(this));
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
            const patchIframe = document.getElementById("editorIframe");
            if (patchIframe)
            {
                patchIframe.contentWindow.postMessage({ "type": "hashchange", "data": window.location.hash }, "*");
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
                    "prefixAssetPath": this._settings.currentPatchDir
                }
            }
        });
    }

    _coreReady(depsNotFound)
    {
        console.log("_coreReady", depsNotFound);

        const iframeWindow = this.editorIframe.contentWindow;
        const iframeCables = iframeWindow.CABLES;
        if (!depsNotFound && (iframeCables && iframeCables.Op))
        {
            iframeCables.Op.prototype.require = (moduleName) =>
            {
                if (moduleName === "electron") return this._electron;
                try
                {
                    const modulePath = this._path.join(this._settings.currentPatchDir, "node_modules", moduleName);
                    console.info("trying to load", modulePath);
                    return window.nodeRequire(modulePath);
                }
                catch (e)
                {
                    try
                    {
                        console.info("trying to load native module", moduleName);
                        return window.nodeRequire(moduleName);
                    }
                    catch (e2)
                    {
                        console.error("failed to load node module \"" + moduleName + "\" do you need to run `npm install`?", e2);
                        return "";
                    }
                }
            };
        }
    }

    _uiReady(depsNotFound)
    {
        console.log("_uiReady", depsNotFound);

        const iframeWindow = this.editorIframe.contentWindow;
        const iframeCables = iframeWindow.CABLES;
        if (iframeCables)
        {
            const getOpsForFilename = iframeCables.UI.getOpsForFilename;
            iframeCables.UI.getOpsForFilename = function (filename)
            {
                let defaultOps = getOpsForFilename(filename);
                if (defaultOps.length === 0)
                {
                    defaultOps.push(iframeCables.UI.DEFAULTOPNAMES.defaultOpJson);
                    const addOpCb = iframeWindow.gui.corePatch().on("onOpAdd", (newOp) =>
                    {
                        const contentPort = newOp.getPortByName("Content", false);
                        if (contentPort) contentPort.set("String");
                        iframeWindow.gui.corePatch().off(addOpCb);
                    });
                }
                return defaultOps;
            };
            iframeCables.CMD.STANDALONE = electronCommands.functions;
            iframeCables.CMD.commands = iframeCables.CMD.commands.concat(electronCommands.commands);
            Object.assign(iframeCables.CMD.PATCH, electronCommands.functionOverrides.PATCH);
            Object.assign(iframeCables.CMD.RENDERER, electronCommands.functionOverrides.RENDERER);
        }
    }
}
export default new CablesStandalone();
