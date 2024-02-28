import { TalkerAPI } from "cables-shared-client";

export default class ElectronEditor
{
    constructor(params)
    {
        const frame = document.getElementById("editorIframe");
        this._talker = new TalkerAPI(frame.contentWindow);
        this._patchId = params.config.patchId;
        this._patchVersion = params.config.patchVersion;

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
                window.ipcRenderer.invoke("talkerMessage", "fileUpload", options).then((r) =>
                {
                    next(null, r);
                });
            });

        this._talker.addEventListener(
            "gotoPatch",
            (options) =>
            {
                window.location.reload();
            });

        const talkerTopics = [
            "getOpInfo",
            "getCoreOpsCode",
            "getProjectOpsCode",
            "savePatch",
            "getPatch",
            "newPatch",
            "getBuildInfo",
            "getAllProjectOps",
            "getOpDocsAll",
            "getOpDocs",
            "saveOpCode",
            "getOpCode",
            "getBlueprintOps",
            "formatOpCode",
            "saveUserSettings",
            "checkProjectUpdated",
            "getCoreLibCode",
            "getLibCode",
            "getChangelog",
            "opAttachmentSave",
            "setIconSaved",
            "setIconUnsaved",
            "saveScreenshot",
            "getFilelist"
        ];

        talkerTopics.forEach((talkerTopic) =>
        {
            this._talker.addEventListener(talkerTopic, (data, next) =>
            {
                window.ipcRenderer.invoke("talkerMessage", talkerTopic, data).then((r) =>
                {
                    next(null, r);
                });
            });
        });
    }
}
