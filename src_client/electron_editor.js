import { TalkerAPI } from "cables-shared-client";
import cablesElectron from "./renderer.js";

/**
 * @name EditorParams
 * @type {object}
 * @property {{}} config config options for the ui
 * @property {boolean} config.isTrustedPatch does the user have write permission in the patch, always true in cablesElectron
 * @property {string} config.platformClass the platform class to use in the ui, allows for hooks and overrides in community vs cablesElectron
 * @property {string} config.urlCables url used for links to outside the sandbox on community platform
 * @property {string} config.urlSandbox url used for links to inside the sandbox on community platform
 * @property {{}} config.user current user object
 * @property {{}} config.usersettings current user settings
 * @property {{}} config.usersettings.settings current user editor preferences
 * @property {boolean} config.isDevEnv handle current environment as development environment?
 * @property {string} config.env string identifying the current environment
 * @property {string} config.patchId current patchid
 * @property {string} config.patchVersion current patchid if working on a backup version of a patch
 * @property {{}} config.socketcluster config for websocket connection in community platform
 * @property {boolean} config.remoteClient are we a remote client?
 * @property {{}} config.buildInfo buildinfo for the currently running version
 * @property {{}} config.patchConfig configuration handed over to the loaded patch
 * @property {boolean} config.patchConfig.allowEdit is the user allowed to edit the pacht, always true in cablesElectron
 * @property {string} config.patchConfig.prefixAssetPath where to look for assets that are set to relative paths in the project
 */

/**
 * cables editor instance for electron cablesElectron version
 * handles ipc messages from and to the ui
 *
 * @param {EditorParams} params
 */
export default class ElectronEditor
{
    constructor(params)
    {
        this.config = params.config;
        const frame = document.getElementById("editorIframe");
        this._talker = new TalkerAPI(frame.contentWindow);
        this._patchId = this.config.patchId;

        window.addEventListener("unhandledrejection", (e) =>
        {
            this._talker.send("logError", { "level": "error", "message": e.reason });
        });

        window.addEventListener("error", (e) =>
        {
            this._talker.send("logError", { "level": "error", "message": e.error });
        });

        window.ipcRenderer.on("talkerMessage", (_event, data) =>
        {
            this._talker.send(data.cmd, data.data);
        });

        /**
         * send patch config to ui
         *
         * @name ElectronEditor#requestPatchData
         * @param {*} data unused
         * @param {function} next callback
         * @listens TalkerAPI#requestPatchData
         */
        this._talker.on("requestPatchData", (data, next) =>
        {
            if (next) next(this.config);
        });

        /**
         * notify ui of patch name change
         *
         * @name ElectronEditor#updatePatchName
         * @param {{}} data
         * @param {string} data.name the new patch name
         * @param {function} next callback
         * @listens TalkerAPI#updatePatchName
         */
        this._talker.on("updatePatchName", (data, next) =>
        {
            if (next) next(null, data);
        });

        /**
         * reload the page
         *
         * @name ElectronEditor#reload
         * @param {*} data unused
         * @param {function} next unused
         * @listens TalkerAPI#reload
         */
        this._talker.on("reload", (data, next) =>
        {
            document.location.reload();
        });

        /**
         * upload a file via the ui
         *
         * @name ElectronEditor#fileUploadStr
         * @param {*} data
         * @param {string} data.fileStr the file content as data-url
         * @param {string} data.filename the name of the file
         * @param {function} next callback
         * @listens TalkerAPI#fileUploadStr
         * @fires TalkerAPI#refreshFileManager
         * @fires TalkerAPI#fileUpdated
         */
        this._talker.on("fileUploadStr", (data, next) =>
        {
            this.api("fileUpload", data, (err, r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                this._talker.send("refreshFileManager");
                this._talker.send("fileUpdated", { "filename": r.filename });

                if (error) this._talker.send("logError", { "level": error.level, "message": error.msg || error });
                next(error, r);
            });
        });

        /**
         * update a file from the ui (e.g. edit a textfile)
         *
         * @name ElectronEditor#updateFile
         * @param {*} data
         * @param {string} data.content raw content of the file written to disk (e.g. ASCII)
         * @param {string} data.filename the name of the file
         * @param {function} next callback
         * @listens TalkerAPI#updateFile
         * @fires TalkerAPI#fileUpdated
         */
        this._talker.on("updateFile", (data, next) =>
        {
            this.api("updateFile", data, (err, r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                if (error) this._talker.send("logError", { "level": error.level, "message": error.msg || error });
                next(error, r);
                this._talker.send("fileUpdated", { "filename": data.fileName });
            });
        });

        this._talker.on("createFile", (data, next) =>
        {
            this.api("createFile", data, (error, r) =>
            {
                if (error)
                {
                    this._talker.send("logError", { "level": error.level, "message": error.msg || error });
                }
                else
                {
                    if (window.cablesElectron && window.cablesElectron.gui && r)
                    {
                        window.cablesElectron.gui.patchView.addAssetOpAuto(r);
                        window.cablesElectron.gui.fileManagerEditor.editAssetTextFile("file:" + r, "text");
                    }
                }
                next(error, r);
            });
        });

        this._talker.on("addOpPackage", (data, next) =>
        {
            let opTargetDir = null;
            this.api("getProjectOpDirs", {}, (err, res) =>
            {
                let html = "";
                let opDirSelect = "Choose target directory:<br/><br/>";
                opDirSelect += "<select id=\"opTargetDir\" name=\"opTargetDir\">";
                for (let i = 0; i < res.data.length; i++)
                {
                    const dirInfo = res.data[i];
                    if (i === 0) opTargetDir = dirInfo.dir;
                    opDirSelect += "<option value=\"" + dirInfo.dir + "\">" + dirInfo.dir + "</option>";
                }
                opDirSelect += "</select>";
                opDirSelect += "<hr/>";
                html += opDirSelect;
                html += "Enter <a href=\"https://docs.npmjs.com/cli/v10/commands/npm-install\">package.json</a> location (git, npm, thz, url, ...):";

                new cablesElectron.CABLES.UI.ModalDialog({
                    "prompt": true,
                    "title": "Install ops from package",
                    "html": html,
                    "promptOk": (packageLocation) =>
                    {
                        const loadingModal = cablesElectron.gui.startModalLoading("Installing ops...");
                        const packageOptions = { "targetDir": opTargetDir, "package": packageLocation };
                        this.api("addOpPackage", packageOptions, (_err, result) =>
                        {
                            const r = result.data;
                            if (r)
                            {
                                if (r.targetDir)
                                {
                                    loadingModal.setTask("installing to " + r.targetDir);
                                }
                                if (r.packages && r.packages.length > 0)
                                {
                                    loadingModal.setTask("found ops");
                                    r.packages.forEach((p) =>
                                    {
                                        loadingModal.setTask(p);
                                    });
                                }
                                if (r.stdout)
                                {
                                    loadingModal.setTask(r.stdout);
                                }
                                if (r.stderr)
                                {
                                    loadingModal.setTask(r.stderr);
                                }
                                loadingModal.setTask("done");
                                if (next) next(_err, r);
                                setTimeout(() => { cablesElectron.gui.endModalLoading(); }, 3000);
                            }
                        });
                    }
                });

                const dirSelect = cablesElectron.editorWindow.ele.byId("opTargetDir");
                if (dirSelect)
                {
                    dirSelect.addEventListener("change", () =>
                    {
                        opTargetDir = dirSelect.value;
                    });
                }
            });
        });

        this._talkerTopics = {
            "getOpInfo": {},
            "savePatch": { "needsProjectFile": true },
            "getPatch": {},
            "newPatch": { },
            "getAllProjectOps": {},
            "getOpDocsAll": {},
            "getOpDocs": {},
            "saveOpCode": {},
            "getOpCode": {},
            "opAttachmentGet": {},
            "formatOpCode": {},
            "saveUserSettings": {},
            "checkProjectUpdated": {},
            "opAddLib": {},
            "opAddCoreLib": {},
            "opAttachmentAdd": {},
            "opAttachmentDelete": {},
            "opRemoveLib": {},
            "opRemoveCoreLib": {},
            "getChangelog": {},
            "opAttachmentSave": {},
            "setIconSaved": {},
            "setIconUnsaved": {},
            "saveScreenshot": { },
            "getFilelist": {},
            "getFileDetails": {},
            "getLibraryFileInfo": {},
            "checkOpName": {},
            "getRecentPatches": {},
            "opCreate": { "needsProjectFile": true },
            "opRename": { },
            "opUpdate": {},
            "opDelete": {},
            "opClone": { },
            "opSaveLayout": { },
            "opSetSummary": { },
            "checkNumAssetPatches": {},
            "saveProjectAs": { },
            "gotoPatch": {},
            "getProjectOpDirs": {},
            "openDir": {},
            "selectFile": {},
            "selectDir": {},
            "setProjectName": { "needsProjectFile": true },
            "collectAssets": { "needsProjectFile": true },
            "collectOps": { "needsProjectFile": true },
            "getCollectionOpDocs": {},
            "patchCreateBackup": { "needsProjectFile": true },
            "addOpDependency": {},
            "removeOpDependency": {},
            "saveProjectOpDirOrder": { "needsProjectFile": true },
            "removeProjectOpDir": { "needsProjectFile": true },
            "exportPatch": { "needsProjectFile": true },
            "exportPatchBundle": { "needsProjectFile": true },
            "addProjectOpDir": { "needsProjectFile": true },
            "uploadFileToOp": {},
            "errorReport": {}
        };

        Object.keys(this._talkerTopics).forEach((talkerTopic) =>
        {
            this._talker.addEventListener(talkerTopic, (data, next) =>
            {
                const topicConfig = this._talkerTopics[talkerTopic];
                window.ipcRenderer.invoke("talkerMessage", talkerTopic, data, topicConfig).then((r) =>
                {
                    const error = r && r.hasOwnProperty("error") ? r : null;
                    if (error) this._talker.send("logError", { "level": error.level, "message": error.msg || error });
                    next(error, r);
                });
            });
        });
    }

    /**
     * make a call to a method in electron_api
     *
     * @param cmd
     * @param data
     * @param next
     */
    api(cmd, data, next)
    {
        const topicConfig = this._talkerTopics[cmd];
        window.ipcRenderer.invoke("talkerMessage", cmd, data, topicConfig).then((r) =>
        {
            const error = r && r.hasOwnProperty("error") ? r : null;
            if (error) this._talker.send("logError", { "level": error.level, "message": error.msg || error });
            next(error, r);
        });
    }

    editor(cmd, data, next)
    {
        this._talker.send(cmd, data, next);
    }

    notify(msg)
    {
        if (!msg) return;
        this._talker.send("notify", { "msg": msg });
    }
}
