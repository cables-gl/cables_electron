import { TalkerAPI } from "cables-shared-client";

export default class ElectronEditor
{
    constructor(params)
    {
        const frame = document.getElementById("editorIframe");
        this._talker = new TalkerAPI(frame.contentWindow);
        this._patchId = params.config.patchId;

        this._talker.addEventListener("requestPatchData", (data, next) =>
        {
            if (next) next(params.config);
        });

        this._talker.addEventListener("sendBrowserInfo", (data, next) =>
        {
            if (next) next();
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
                window.ipcRenderer.invoke("talkerMessage", "fileUpload", options, { "needsProjectDir": true })
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
                window.ipcRenderer.invoke("talkerMessage", "updateFile", options, { "needsProjectDir": true })
                    .then((r) =>
                    {
                        next(null, r);
                        this._talker.send("fileUpdated", { "filename": options.fileName });
                    });
            });

        const talkerTopics = {
            "getOpInfo": {},
            "savePatch": {
                "needsProjectDir": true,
                "needsProjectFile": true
            },
            "getPatch": {},
            "newPatch": { "needsProjectDir": true },
            "getBuildInfo": {},
            "getAllProjectOps": {},
            "getOpDocsAll": {},
            "getOpDocs": {},
            "saveOpCode": { "needsProjectDir": true },
            "getOpCode": {},
            "formatOpCode": {},
            "saveUserSettings": {},
            "checkProjectUpdated": {},
            "getCoreLibCode": {},
            "getLibCode": {},
            "getChangelog": {},
            "opAttachmentSave": { "needsProjectDir": true },
            "setIconSaved": {},
            "setIconUnsaved": {},
            "saveScreenshot": { "needsProjectDir": true },
            "getFilelist": {},
            "getFileDetails": {},
            "checkOpName": { "needsProjectDir": true },
            "getRecentPatches": {},
            "opCreate": { },
            "opUpdate": { "needsProjectDir": true },
            "opSaveLayout": { "needsProjectDir": true },
            "opClone": { "needsProjectDir": true },
            "checkNumAssetPatches": {},
            "saveProjectAs": {},
            "gotoPatch": {},
            "setProjectUpdated": {},
            "getOpTargetDirs": {},
            "openDir": {}
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
