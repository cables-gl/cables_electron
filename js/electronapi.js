var CABLES = CABLES || {};

CABLES.ElectronEditor = function (params) {
    const frame = document.getElementById("editorIframe");
    CABLES.talker = new CABLES.TalkerAPI(frame.contentWindow);
    CABLES.patchId = params.config.patchId;
    CABLES.patchVersion = params.config.patchVersion;

    CABLES.talker.addEventListener("requestPatchData", function (data, next) {
        if (next) next(params.config);
    });

    CABLES.talker.addEventListener("sendBrowserInfo", function (data, next) {
        if (next) next(platform);
    });

    const talkerTopics = [
        "getCoreOpsCode",
        "getProjectOpsCode",
        "patchCreateBackup",
        "savePatch",
        "getPatch",
        "newPatch",
        "saveProjectAs",
        "saveScreenshot",
        "setProjectName",
        "getBuildInfo",
        "getFilelist",
        "fileConvert",
        "getFileDetails",
        "getLibraryFileInfo",
        "deleteFile",
        "createFile",
        "fileUploadStr",
        "getAllProjectOps",
        "getAllOps",
        "getOpDocsAll",
        "getOpDocs",
        "getCollectionOpDocs",
        "opCreate",
        "saveOpCode",
        "getOpCode",
        "getBlueprintOps",
        "formatOpCode",
        "opSaveLayout",
        "opAddLib",
        "opRemoveLib",
        "opAddCoreLib",
        "opRemoveCoreLib",
        "opClone",
        "opAttachmentAdd",
        "opAttachmentGet",
        "opAttachmentDelete",
        "opAttachmentSave",
        "saveUserSettings",
        "checkOpName",
        "setIconUnsaved",
        "setIconSaved",
        "checkProjectUpdated"
    ];

    talkerTopics.forEach((talkerTopic) => {
        CABLES.talker.addEventListener(talkerTopic, function (data, next) {
            console.log(talkerTopic + " electron");
            window.electronAPI.talkerMessage(talkerTopic, data).then(function (r) {
                next(null, r);
            });
        });
    });

}
