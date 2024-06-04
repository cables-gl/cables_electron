import { TalkerAPI } from "cables-shared-client";

export default class ElectronEditor
{
    constructor(params)
    {
        const frame = document.getElementById("editorIframe");
        this._talker = new TalkerAPI(frame.contentWindow);
        this._patchId = params.config.patchId;

        window.ipcRenderer.on("talkerMessage", (_event, data) =>
        {
            this._talker.send(data.cmd, data.data);
        });

        this._talker.addEventListener("requestPatchData", (data, next) =>
        {
            if (next) next(params.config);
        });

        this._talker.addEventListener("sendBrowserInfo", (data, next) =>
        {
            if (next) next();
        });

        this._talker.addEventListener("updatePatchName", (opts, next) =>
        {
            if (next) next(null, opts);
        });

        this._talker.addEventListener(
            "reload",
            (options) =>
            {
                if (options && options.patchId)
                {
                    document.location.href = "/edit/" + options.patchId;
                }
                else
                {
                    document.location.reload();
                }
            });

        this._talker.addEventListener(
            "fileUploadStr",
            (options, next) =>
            {
                window.ipcRenderer.invoke("talkerMessage", "fileUpload", options, {})
                    .then((r) =>
                    {
                        this._talker.send("refreshFileManager");
                        this._talker.send("fileUpdated", { "filename": options.filename });
                        next(null, r);
                    });
            });

        this._talker.addEventListener(
            "updateFile",
            (options, next) =>
            {
                window.ipcRenderer.invoke("talkerMessage", "updateFile", options, {})
                    .then((r) =>
                    {
                        next(null, r);
                        this._talker.send("fileUpdated", { "filename": options.fileName });
                    });
            });

        const talkerTopics = {
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
            "setProjectName": { "needsProjectFile": true }
        };

        Object.keys(talkerTopics)
            .forEach((talkerTopic) =>
            {
                this._talker.addEventListener(talkerTopic, (data, next) =>
                {
                    const topicConfig = talkerTopics[talkerTopic];
                    window.ipcRenderer.invoke("talkerMessage", talkerTopic, data, topicConfig)
                        .then((r) =>
                        {
                            next(null, r);
                        });
                });
            });
    }
}
