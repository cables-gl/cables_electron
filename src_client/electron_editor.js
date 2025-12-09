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
            this._talker.send(TalkerAPI.CMD_UI_LOG_ERROR, { "level": "error", "message": e.reason });
        });

        window.addEventListener("error", (e) =>
        {
            this._talker.send(TalkerAPI.CMD_UI_LOG_ERROR, { "level": "error", "message": e.error });
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
        this._talker.on(TalkerAPI.CMD_REQUEST_PATCH_DATA, (data, next) =>
        {
            if (next) next(this.config);
        });

        /**
         * notififed by ui of patch name change
         *
         * @name ElectronEditor#updatePatchName
         * @param {{}} data
         * @param {string} data.name the new patch name
         * @param {function} next callback
         * @listens TalkerAPI#updatePatchName
         */
        this._talker.on(TalkerAPI.CMD_UPDATE_PATCH_NAME, (data, next) =>
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
        this._talker.on(TalkerAPI.CMD_RELOAD_PATCH, (data, next) =>
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
        this._talker.on(TalkerAPI.CMD_UPLOAD_FILE, (data, next) =>
        {
            this.api("fileUpload", data, (err, r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                this._talker.send(TalkerAPI.CMD_UI_REFRESH_FILEMANAGER, {});
                this._talker.send(TalkerAPI.CMD_UI_FILE_UPDATED, { "filename": r.filename });
                if (error) this._talker.send(TalkerAPI.CMD_UI_LOG_ERROR, { "level": error.level, "message": error.msg || error });
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
        this._talker.on(TalkerAPI.CMD_UPDATE_FILE, (data, next) =>
        {
            this.api("updateFile", data, (err, r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                if (error) this._talker.send(TalkerAPI.CMD_UI_LOG_ERROR, { "level": error.level, "message": error.msg || error });
                next(error, r);
                this._talker.send(TalkerAPI.CMD_UI_FILE_UPDATED, { "filename": data.fileName });
            });
        });

        this._talker.on(TalkerAPI.CMD_CREATE_NEW_FILE, (data, next) =>
        {
            this.api("createFile", data, (error, r) =>
            {
                if (error)
                {
                    this._talker.send(TalkerAPI.CMD_UI_LOG_ERROR, { "level": error.level, "message": error.msg || error });
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

        this._talker.on(TalkerAPI.CMD_ADD_OP_PACKAGE, (data, next) =>
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

        this._talkerTopics = {};
        this._talkerTopics[TalkerAPI.CMD_GET_OP_INFO] = {};
        this._talkerTopics[TalkerAPI.CMD_SAVE_PATCH] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_GET_PATCH] = {};
        this._talkerTopics[TalkerAPI.CMD_CREATE_NEW_PATCH] = { };
        this._talkerTopics[TalkerAPI.CMD_GET_PROJECT_OPS] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_ALL_OPDOCS] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_OP_DOCS] = {};
        this._talkerTopics[TalkerAPI.CMD_SAVE_OP_CODE] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_OP_CODE] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_OP_ATTACHMENT] = {};
        this._talkerTopics[TalkerAPI.CMD_FORMAT_OP_CODE] = {};
        this._talkerTopics[TalkerAPI.CMD_SAVE_USER_SETTINGS] = {};
        this._talkerTopics[TalkerAPI.CMD_CHECK_PATCH_UPDATED] = {};
        this._talkerTopics[TalkerAPI.CMD_ADD_OP_LIBRARY] = {};
        this._talkerTopics[TalkerAPI.CMD_ADD_OP_CORELIB] = {};
        this._talkerTopics[TalkerAPI.CMD_ADD_OP_ATTACHMENT] = {};
        this._talkerTopics[TalkerAPI.CMD_REMOVE_OP_ATTACHMENT] = {};
        this._talkerTopics[TalkerAPI.CMD_REMOVE_OP_LIBRARY] = {};
        this._talkerTopics[TalkerAPI.CMD_REMOVE_OP_CORELIB] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_CABLES_CHANGELOG] = {};
        this._talkerTopics[TalkerAPI.CMD_SAVE_OP_ATTACHMENT] = {};
        this._talkerTopics[TalkerAPI.CMD_SET_ICON_SAVED] = {};
        this._talkerTopics[TalkerAPI.CMD_SET_ICON_UNSAVED] = {};
        this._talkerTopics[TalkerAPI.CMD_SAVE_PATCH_SCREENSHOT] = { };
        this._talkerTopics[TalkerAPI.CMD_GET_FILE_LIST] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_FILE_DETAILS] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_LIBRARYFILE_DETAILS] = {};
        this._talkerTopics[TalkerAPI.CMD_CHECK_OP_NAME] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_RECENT_PATCHES] = {};
        this._talkerTopics[TalkerAPI.CMD_CREATE_OP] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_UPDATE_OP] = {};
        this._talkerTopics[TalkerAPI.CMD_CLONE_OP] = { };
        this._talkerTopics[TalkerAPI.CMD_SAVE_OP_LAYOUT] = { };
        this._talkerTopics[TalkerAPI.CMD_GET_ASSET_USAGE_COUNT] = {};
        this._talkerTopics[TalkerAPI.CMD_SAVE_PATCH_AS] = { };
        this._talkerTopics[TalkerAPI.CMD_GOTO_PATCH] = {};
        this._talkerTopics[TalkerAPI.CMD_SET_PATCH_NAME] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_GET_COLLECTION_OPDOCS] = {};
        this._talkerTopics[TalkerAPI.CMD_CREATE_PATCH_BACKUP] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_ADD_OP_DEPENDENCY] = {};
        this._talkerTopics[TalkerAPI.CMD_REMOVE_OP_DEPENDENCY] = {};
        this._talkerTopics[TalkerAPI.CMD_UPLOAD_OP_DEPENDENCY] = {};
        this._talkerTopics[TalkerAPI.CMD_GET_PATCH_SUMMARY] = {};
        this._talkerTopics[TalkerAPI.CMD_SEND_ERROR_REPORT] = {};

        this._talkerTopics[TalkerAPI.CMD_ELECTRON_RENAME_OP] = { };
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_DELETE_OP] = {};
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_SET_OP_SUMMARY] = { };
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_GET_PROJECT_OPDIRS] = {};
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_OPEN_DIR] = {};
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_SELECT_FILE] = {};
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_SELECT_DIR] = {};
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_COLLECT_ASSETS] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_COLLECT_OPS] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_SAVE_PROJECT_OPDIRS_ORDER] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_REMOVE_PROJECT_OPDIR] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_EXPORT_PATCH] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_EXPORT_PATCH_BUNDLE] = { "needsProjectFile": true };
        this._talkerTopics[TalkerAPI.CMD_ELECTRON_ADD_PROJECT_OPDIR] = { "needsProjectFile": true };

        Object.keys(this._talkerTopics).forEach((talkerTopic) =>
        {
            this._talker.addEventListener(talkerTopic, (data, next) =>
            {
                const topicConfig = this._talkerTopics[talkerTopic];
                window.ipcRenderer.invoke("talkerMessage", talkerTopic, data, topicConfig).then((r) =>
                {
                    const error = r && r.hasOwnProperty("error") ? r : null;
                    if (error) this._talker.send(TalkerAPI.CMD_UI_LOG_ERROR, { "level": error.level, "message": error.msg || error });
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
            if (error) this._talker.send(TalkerAPI.CMD_UI_LOG_ERROR, { "level": error.level, "message": error.msg || error });
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
        this._talker.send(TalkerAPI.CMD_UI_NOTIFY, { "msg": msg });
    }
}
