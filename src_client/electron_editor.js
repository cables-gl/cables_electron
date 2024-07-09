import { TalkerAPI } from "cables-shared-client";

/**
 * cables editor instance for electron standalone version
 * handles ipc messages from and to the ui
 *
 * @param {{}} params
 * @param {{}} params.config config options for the ui
 * @param {boolean} params.config.isTrustedPatch does the user have write permission in the patch, always true in standalone
 * @param {string} params.config.platformClass the platform class to use in the ui, allows for hooks and overrides in community vs standalone
 * @param {string} params.config.urlCables url used for links to outside the sandbox on community platform
 * @param {string} params.config.urlSandbox url used for links to inside the sandbox on community platform
 * @param {{}} params.config.user current user object
 * @param {{}} params.config.usersettings current user settings
 * @param {{}} params.config.usersettings.settings current user editor preferences
 * @param {boolean} params.config.isDevEnv handle current environment as development environment?
 * @param {string} params.config.env string identifying the current environment
 * @param {string} params.config.patchId current patchid
 * @param {string} params.config.patchVersion current patchid if working on a backup version of a patch
 * @param {{}} params.config.socketcluster config for websocket connection in community platform
 * @param {boolean} params.config.remoteClient are we a remote client?
 * @param {{}} params.config.buildInfo buildinfo for the currently running version
 * @param {{}} params.config.patchConfig configuration handed over to the loaded patch
 * @param {boolean} params.config.patchConfig.allowEdit is the user allowed to edit the pacht, always true in standalone
 * @param {string} params.config.patchConfig.prefixAssetPath where to look for assets that are set to relative paths in the project
 *
 */
export default class ElectronEditor
{
    constructor(params)
    {
        this._config = params.config;
        const frame = document.getElementById("editorIframe");
        this._talker = new TalkerAPI(frame.contentWindow);
        this._patchId = this._config.patchId;


        window.ipcRenderer.on("talkerMessage", (_event, data) =>
        {
            this._talker.send(data.cmd, data.data);
        });

        /**
         * send patch config to ui
         *
         * @augments ElectronEditor
         * @name requestPatchData
         * @param {*} data unused
         * @param {function} next callback
         * @listens this._talker#requestPatchData
         */
        this._talker.addEventListener("requestPatchData", (data, next) =>
        {
            if (next) next(this._config);
        });

        /**
         * send browser info to ui, no-op in electron
         *
         * @namespace TalkerAPI
         * @name TalkerAPI#sendBrowserInfo
         * @param {*} data unused
         * @param {function} next callback
         * @listens this._talker#sendBrowserInfo
         */
        this._talker.addEventListener("sendBrowserInfo", (data, next) =>
        {
            if (next) next();
        });

        /**
         * notify ui of patch name change
         *
         * @param {{}} data
         * @param {string} data.name the new patch name
         * @param {function} next callback
         * @listens this._talker#updatePatchName
         */
        this._talker.addEventListener("updatePatchName", (data, next) =>
        {
            if (next) next(null, data);
        });

        /**
         * reload the page
         *
         * @param {*} data unused
         * @param {function} next unused
         * @listens this._talker#reload
         */
        this._talker.addEventListener("reload", (data, next) =>
        {
            document.location.reload();
        });

        /**
         * upload a file via the ui
         *
         * @param {*} data
         * @param {string} data.fileStr the file content as data-url
         * @param {string} data.filename the name of the file
         * @param {function} next callback
         * @listens this._talker#fileUploadStr
         * @fires this._talker#refreshFileManager
         * @fires this._talker#fileUpdated
         */
        this._talker.addEventListener("fileUploadStr", (data, next) =>
        {
            window.ipcRenderer.invoke("talkerMessage", "fileUpload", data, {}).then((r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                this._talker.send("refreshFileManager");
                this._talker.send("fileUpdated", { "filename": data.filename });
                next(error, r);
            });
        });

        /**
         * update a file from the ui (e.g. edit a textfile)
         *
         * @param {*} data
         * @param {string} data.content raw content of the file written to disk (e.g. ASCII)
         * @param {string} data.filename the name of the file
         * @param {function} next callback
         * @listens this._talker#updateFile
         * @fires this._talker#fileUpdated
         */
        this._talker.addEventListener("updateFile", (data, next) =>
        {
            window.ipcRenderer.invoke("talkerMessage", "updateFile", data, {}).then((r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                next(error, r);
                this._talker.send("fileUpdated", { "filename": data.fileName });
            });
        });

        this._talkerTopics = {
            "getOpInfo": {},
            "savePatch": { "needsProjectFile": true },
            "getPatch": {},
            "newPatch": { },
            "getBuildInfo": {},
            "getAllProjectOps": {},
            "getOpDocsAll": {},
            "getOpDocs": {},
            "saveOpCode": {},
            "getOpCode": {},
            "formatOpCode": {},
            "saveUserSettings": {},
            "checkProjectUpdated": {},
            "getCoreLibCode": {},
            "getLibCode": {},
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
            "checkNumAssetPatches": {},
            "saveProjectAs": {},
            "gotoPatch": {},
            "setProjectUpdated": {},
            "getOpTargetDirs": {},
            "openDir": {},
            "selectFile": {},
            "setProjectName": { "needsProjectFile": true },
            "collectAssets": { "needsProjectFile": true },
            "collectOps": { "needsProjectFile": true },
            "getCollectionOpDocs": {},
            "patchCreateBackup": { "needsProjectFile": true }
        };

        Object.keys(this._talkerTopics).forEach((talkerTopic) =>
        {
            /**
             * delegate ui talkerapi call to electron_api "backend
             *
             * @param {*} data
             * @param {function} next callback
             * @listens this._talker#getOpInfo
             * @listens this._talker#savePatch
             * @listens this._talker#getPatch
             * @listens this._talker#newPatch
             * @listens this._talker#getBuildInfo
             * @listens this._talker#getAllProjectOps
             * @listens this._talker#getOpDocsAll
             * @listens this._talker#getOpDocs
             * @listens this._talker#saveOpCode
             * @listens this._talker#getOpCode
             * @listens this._talker#formatOpCode
             * @listens this._talker#saveUserSettings
             * @listens this._talker#checkProjectUpdated
             * @listens this._talker#getCoreLibCode
             * @listens this._talker#getLibCode
             * @listens this._talker#getChangelog
             * @listens this._talker#opAttachmentSave
             * @listens this._talker#setIconSaved
             * @listens this._talker#setIconUnsaved
             * @listens this._talker#saveScreenshot
             * @listens this._talker#getFilelist
             * @listens this._talker#getFileDetails
             * @listens this._talker#getLibraryFileInfo
             * @listens this._talker#checkOpName
             * @listens this._talker#getRecentPatches
             * @listens this._talker#opCreate
             * @listens this._talker#opUpdate
             * @listens this._talker#opSaveLayout
             * @listens this._talker#opClone
             * @listens this._talker#checkNumAssetPatches
             * @listens this._talker#saveProjectAs
             * @listens this._talker#gotoPatch
             * @listens this._talker#setProjectUpdated
             * @listens this._talker#getOpTargetDirs
             * @listens this._talker#openDir
             * @listens this._talker#selectFile
             * @listens this._talker#setProjectName
             * @listens this._talker#collectAssets
             * @listens this._talker#collectOps
             * @listens this._talker#getCollectionOpDocs
             * @listens this._talker#patchCreateBackup
             */
            this._talker.addEventListener(talkerTopic, (data, next) =>
            {
                const topicConfig = this._talkerTopics[talkerTopic];
                window.ipcRenderer.invoke("talkerMessage", talkerTopic, data, topicConfig).then((r) =>
                {
                    const error = r && r.hasOwnProperty("error") ? r.error : null;
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
            const error = r && r.hasOwnProperty("error") ? r.error : null;
            next(error, r);
        });
    }
}
