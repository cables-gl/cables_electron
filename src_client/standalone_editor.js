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
            if (next) next(platform);
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
            "fileUploadStr",
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
            "saveScreenshot"
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

    uploadFormadata(formData, filename)
    {
        const url = "/api/project/" + this._patchId + "/file";

        this._talker.send("jobStart", {
            "id": "upload" + filename,
            "title": "Uploading " + filename
        });

        // now post a new XHR request
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.upload.onprogress = (event) =>
        {
            if (event.lengthComputable)
            {
                const complete = (event.loaded / event.total * 100 | 0);
                this._talker.send("jobProgress", {
                    "id": "upload" + filename,
                    "progress": complete
                });

                if (complete === 100)
                {
                    this._talker.send("notify", { "msg": "File Uploaded" });
                    this._talker.send("jobFinish", { "id": "upload" + filename });

                    setTimeout(() =>
                    {
                        this._talker.send("refreshFileManager");
                        this._talker.send("fileUpdated", { "filename": filename });
                    }, 500);
                }
            }
        };

        xhr.onload = (e, r) =>
        {
            let msg = "";
            let res = "";

            try
            {
                res = JSON.parse(e.target.response);
            }
            catch (ex)
            {
                console.log(ex);
            }

            if (xhr.status === 502)
            {
                console.warn("ajax 502 error ! possibly upload ?");
                return;
            }

            if (xhr.status === 200)
            {
                this._talker.send("refreshFileManager");
            }
            else
            {
                if (res.msg) msg = res.msg;
                if (xhr.status === 402)
                {
                    this._talker.send("notifyError", { "msg": "Warning: " + (res.msg || ""), "options": { "force": true, "closeable": true, "timeout": 1000000000 } });
                }
                else
                {
                    this._talker.send("notifyError", { "msg": "Upload error: " + (res.msg || "") });
                }
                this._talker.send("refreshFileManager");
                console.error("upload error", msg);
            }

            if (res.hasOwnProperty("success") && !res.success)
            {
                this._talker.send("notifyError", { "msg": "Upload error: " + (res.msg || "") });
                console.error("upload error", res.msg);
            }
        };

        xhr.send(formData);

        window.addEventListener("pageshow", (event) =>
        {
            if (event.persisted)
            {
                console.log("reloading because of persisted navigation stuff.....");
                this.document.location.reload();
            }
        });
    }

    dataUriToFormData(dataURI, filename)
    {
        let byteString;
        if (dataURI.split(",")[0].indexOf("base64") >= 0) byteString = atob(dataURI.split(",")[1]);
        else byteString = unescape(dataURI.split(",")[1]);

        // separate out the mime component
        const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];

        // write the bytes of the string to a typed array
        const ia = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++)
        {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ia], { "type": mimeString });
        const fd = new FormData();
        fd.append(0, blob, filename);
        return fd;
    }

    changeFavicon(src)
    {
        let link = document.createElement("link");
        let oldLink = document.getElementById("dynamic-favicon");
        link.id = "dynamic-favicon";
        link.rel = "shortcut icon";
        link.href = src;
        if (oldLink)
        {
            document.head.removeChild(oldLink);
        }

        document.head.appendChild(link);
    }
}
