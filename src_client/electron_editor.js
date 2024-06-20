import { TalkerAPI } from "cables-shared-client";

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

        this._talker.addEventListener("requestPatchData", (data, next) =>
        {
            if (next) next(this._config);
        });

        this._talker.addEventListener("sendBrowserInfo", (data, next) =>
        {
            if (next) next();
        });

        this._talker.addEventListener("updatePatchName", (opts, next) =>
        {
            if (next) next(null, opts);
        });

        this._talker.addEventListener("reload", (options) =>
        {
            document.location.reload();
        });

        this._talker.addEventListener("fileUploadStr", (options, next) =>
        {
            window.ipcRenderer.invoke("talkerMessage", "fileUpload", options, {})
                .then((r) =>
                {
                    const error = r && r.hasOwnProperty("error") ? r.error : null;
                    this._talker.send("refreshFileManager");
                    this._talker.send("fileUpdated", { "filename": options.filename });
                    next(error, r);
                });
        });

        this._talker.addEventListener("updateFile", (options, next) =>
        {
            window.ipcRenderer.invoke("talkerMessage", "updateFile", options, {}).then((r) =>
            {
                const error = r && r.hasOwnProperty("error") ? r.error : null;
                next(error, r);
                this._talker.send("fileUpdated", { "filename": options.fileName });
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
