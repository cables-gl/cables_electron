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
            "fileUploadStr",
            (options, next) =>
            {
                window.ipcRenderer.invoke("talkerMessage", "fileUpload", options, { "needsProjectDir": true }).then((r) =>
                {
                    this._talker.send("refreshFileManager");
                    this._talker.send("fileUpdated", { "filename": options.filename });
                    next(null, r);
                });
            });

        this._talker.addEventListener(
            "gotoPatch",
            (options) =>
            {
                window.location.reload();
            });

        const talkerTopics = {
            "getOpInfo": { "needsProjectDir": false },
            "getCoreOpsCode": { "needsProjectDir": false },
            "getProjectOpsCode": { "needsProjectDir": false },
            "savePatch": { "needsProjectDir": true, "needsProjectFile": true },
            "getPatch": { "needsProjectDir": false },
            "newPatch": { "needsProjectDir": true },
            "getBuildInfo": { "needsProjectDir": false },
            "getAllProjectOps": { "needsProjectDir": false },
            "getOpDocsAll": { "needsProjectDir": false },
            "getOpDocs": { "needsProjectDir": false },
            "saveOpCode": { "needsProjectDir": true },
            "getOpCode": { "needsProjectDir": false },
            "getBlueprintOps": { "needsProjectDir": false },
            "formatOpCode": { "needsProjectDir": false },
            "saveUserSettings": { "needsProjectDir": false },
            "checkProjectUpdated": { "needsProjectDir": false },
            "getCoreLibCode": { "needsProjectDir": false },
            "getLibCode": { "needsProjectDir": false },
            "getChangelog": { "needsProjectDir": false },
            "opAttachmentSave": { "needsProjectDir": true },
            "setIconSaved": { "needsProjectDir": false },
            "setIconUnsaved": { "needsProjectDir": false },
            "saveScreenshot": { "needsProjectDir": true },
            "getFilelist": { "needsProjectDir": false },
            "getFileDetails": { "needsProjectDir": false },
            "checkOpName": { "needsProjectDir": true },
            "getRecentPatches": { "needsProjectDir": false },
            "opCreate": { "needsProjectDir": true },
            "opUpdate": { "needsProjectDir": true },
            "opSaveLayout": { "needsProjectDir": true },
            "opClone": { "needsProjectDir": true },
            "checkNumAssetPatches": { "needsProjectDir": false }
        };

        Object.keys(talkerTopics).forEach((talkerTopic) =>
        {
            this._talker.addEventListener(talkerTopic, (data, next) =>
            {
                const topicConfig = talkerTopics[talkerTopic];
                window.ipcRenderer.invoke("talkerMessage", talkerTopic, data, topicConfig).then((r) =>
                {
                    next(null, r);
                });
            });
        });
    }
}
