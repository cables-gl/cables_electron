import { TalkerAPI } from "cables-shared-client";

/**
 * @name EditorParams
 * @type {object}
 * @property {{}} config config options for the ui
 * @property {boolean} config.isTrustedPatch does the user have write permission in the patch, always true in standalone
 * @property {string} config.platformClass the platform class to use in the ui, allows for hooks and overrides in community vs standalone
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
 * @property {boolean} config.patchConfig.allowEdit is the user allowed to edit the pacht, always true in standalone
 * @property {string} config.patchConfig.prefixAssetPath where to look for assets that are set to relative paths in the project
 */

/**
 * cables editor instance for electron standalone version
 * handles ipc messages from and to the ui
 *
 * @param {EditorParams} params
 */
export default class ElectronEditor
{
    constructor(params)
    {
        this._config = params.config;
        const frame = document.getElementById("editorIframe");
        this._talker = new TalkerAPI(frame.contentWindow);
        this._patchId = this._config.patchId;

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
        this._talker.addEventListener("requestPatchData", (data, next) =>
        {
            if (next) next(this._config);
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
        this._talker.addEventListener("updatePatchName", (data, next) =>
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
        this._talker.addEventListener("reload", (data, next) =>
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
        this._talker.addEventListener("fileUploadStr", (data, next) =>
        {
            window.ipcRenderer.invoke("talkerMessage", "fileUpload", data, {}).then((r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                this._talker.send("refreshFileManager");
                this._talker.send("fileUpdated", { "filename": data.filename });

                if (error) this._talker.send("logError", { "level": "error", "message": error.msg || error });
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
        this._talker.addEventListener("updateFile", (data, next) =>
        {
            window.ipcRenderer.invoke("talkerMessage", "updateFile", data, {}).then((r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                if (error) this._talker.send("logError", { "level": "error", "message": error.msg || error });
                next(error, r);
                this._talker.send("fileUpdated", { "filename": data.fileName });
            });
        });

        /**
         * remove directory with ops from project
         *
         * @param string data directory name
         */
        this._talker.addEventListener("removeProjectOpDir", (data, next) =>
        {
            window.ipcRenderer.invoke("talkerMessage", "removeProjectOpDir", data, {}).then((r) =>
            {
                if (next) next(r);
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
            "opCreate": { },
            "opUpdate": {},
            "opSaveLayout": { },
            "opClone": { },
            "opRename": { },
            "checkNumAssetPatches": {},
            "saveProjectAs": {},
            "gotoPatch": {},
            "setProjectUpdated": {},
            "getProjectOpDirs": {},
            "openDir": {},
            "selectFile": {},
            "setProjectName": { "needsProjectFile": true },
            "collectAssets": { "needsProjectFile": true },
            "collectOps": { "needsProjectFile": true },
            "getCollectionOpDocs": {},
            "patchCreateBackup": { "needsProjectFile": true },
            "addOpDependency": {},
            "removeOpDependency": {},
            "saveProjectOpDirOrder": { "needsProjectFile": true }
        };

        Object.keys(this._talkerTopics).forEach((talkerTopic) =>
        {
            this._talker.addEventListener(talkerTopic, (data, next) =>
            {
                const topicConfig = this._talkerTopics[talkerTopic];
                window.ipcRenderer.invoke("talkerMessage", talkerTopic, data, topicConfig).then((r) =>
                {
                    const error = r && r.hasOwnProperty("error") ? r : null;
                    if (error) this._talker.send("logError", { "level": "error", "message": error.msg || error });
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
            if (error) this._talker.send("logError", { "level": "error", "message": error.msg || error });
            next(error, r);
        });
    }

    editor(cmd, data, next)
    {
        this._talker.send(cmd, data, next);
    }
}
