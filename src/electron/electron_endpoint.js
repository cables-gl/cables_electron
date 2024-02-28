import { ipcMain, protocol } from "electron";
import fs from "fs";
import path from "path";
import marked from "marked";
import jsonfile from "jsonfile";
import crypto from "crypto";
import pako from "pako";
import mkdirp from "mkdirp";
import cables from "../cables.js";
import logger from "../utils/logger.js";
import doc from "../utils/doc_util.js";
import helper from "../utils/helper_util.js";
import opsUtil from "../utils/ops_util.js";
import subPatchOpUtil from "../utils/subpatchop_util.js";
import store from "./electron_store.js";
import electronApp from "./main.js";
import projectsUtil from "../utils/projects_util.js";

protocol.registerSchemesAsPrivileged([{ "scheme": "cables", "privileges": { "bypassCSP": true, "supportFetchAPI": true } }]);

class ElectronEndpoint
{
    constructor()
    {
        this._log = logger;
        this._store = store;
        this._store.set("currentUser", this.getCurrentUser());
    }

    init()
    {
        ipcMain.handle("talkerMessage", async (event, cmd, data) =>
        {
            return this.talkerMessage(cmd, data);
        });

        ipcMain.on("store", (event, cmd, data) =>
        {
            event.returnValue = this._store.data;
        });

        global.handleTalkerMessage = this.talkerMessage;
        protocol.handle("cables", (request) =>
        {
            const url = new URL(request.url);
            const urlPath = url.pathname;
            if (urlPath.startsWith("/api/corelib/"))
            {
                const libName = urlPath.split("/", 4)[3];
                const libCode = this.getCoreLibCode(libName);
                return new Response(libCode, {
                    "headers": { "content-type": "application/javascript" }
                });
            }
            else if (urlPath.startsWith("/api/lib/"))
            {
                const libName = urlPath.split("/", 4)[3];
                const libCode = this.getLibCode(libName);
                return new Response(libCode, {
                    "headers": { "content-type": "application/javascript" }
                });
            }
            else if (urlPath === "/api/errorReport")
            {
                return new Response(JSON.stringify({ "success": true }));
            }
            else if (urlPath === "/api/changelog")
            {
                return new Response(JSON.stringify({ "ts": Date.now(), "items": [] }), {
                    "headers": { "content-type": "application/json" }
                });
            }
            else if (urlPath === "/api/ping")
            {
                return new Response(JSON.stringify({ "maintenance": false }), {
                    "headers": { "content-type": "application/json" }
                });
            }
            else if (urlPath.startsWith("/api/ops/code/project"))
            {
                return this.getProjectOpsCode().then((code) =>
                {
                    return new Response(code, {
                        "headers": { "content-type": "application/json" }
                    });
                });
            }
            else if (urlPath.startsWith("/api/ops/code"))
            {
                return this.getCoreOpsCode().then((code) =>
                {
                    return new Response(code, {
                        "headers": { "content-type": "application/javascript" }
                    });
                });
            }
            else if (urlPath.startsWith("/api/op/"))
            {
                let opName = urlPath.split("/", 4)[3];
                if (opsUtil.isOpId(opName))
                {
                    opName = opsUtil.getOpNameById(opName);
                }
                const opCode = this.apiGetOpCode({ "opName": opName });
                return new Response(opCode, {
                    "headers": { "content-type": "application/javascript" }
                });
            }
            else
            {
                return new Response("", {
                    "headers": { "content-type": "application/javascript" }
                });
            }
        });
    }

    async talkerMessage(cmd, data)
    {
        let response = null;
        if (!cmd) return null;
        if (typeof this[cmd] === "function")
        {
            response = this[cmd](data);
        }
        return response;
    }

    getOpInfo(data)
    {
        const name = data.opName;
        let warns = [];
        try
        {
            warns = opsUtil.getOpCodeWarnings(name);

            if (opsUtil.isOpNameValid(name))
            {
                const result = { "warns": warns };
                result.attachmentFiles = opsUtil.getAttachmentFiles(name);
                return result;
            }
            else
            {
                const result = { "warns": warns };
                result.attachmentFiles = [];
                return result;
            }
        }
        catch (e)
        {
            this._log.warn("error when getting opinfo", name, e.message);
            const result = { "warns": warns };
            result.attachmentFiles = [];
            return result;
        }
    }

    async getCoreOpsCode(data)
    {
        const opDocs = doc.getOpDocs(true, true);
        return opsUtil.buildCode(cables.getCoreOpsPath(), null, opDocs, true, true);
    }

    async getProjectOpsCode()
    {
        const project = this.getCurrentProject();
        const opDocs = doc.getOpDocs(true, true);
        let code = "";
        if (project && project.ops)
        {
            let missingOps = project.ops.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
            const ops = subPatchOpUtil.getOpsUsedInSubPatches(project);
            missingOps = missingOps.concat(ops);
            missingOps = missingOps.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
            missingOps = missingOps.filter((obj, index) => { return missingOps.findIndex((item) => { return item.opId === obj.opId; }) === index; });
            code = opsUtil.buildFullCode(missingOps, opsUtil.PREFIX_OPS, opDocs);
            return code;
        }
        else
        {
            return code;
        }
    }

    savePatch(patch)
    {
        const project = this.getPatch();
        if (patch.data || patch.dataB64)
        {
            try
            {
                let buf = patch.data;
                if (patch.dataB64) buf = Buffer.from(patch.dataB64, "base64");

                const qData = JSON.parse(pako.inflate(buf, { "to": "string" }));

                if (qData.ops) project.ops = qData.ops;
                if (qData.ui) project.ui = qData.ui;
            }
            catch (e)
            {
                this._log.error("patch save error/invalid data", e);
                return;
            }
        }
        else
        {
            this._log.error("body does not contain patch data");
        }

        // filter imported ops, so we do not save these to the database
        project.ops = project.ops.filter((op) =>
        {
            return !(op.storage && op.storage.blueprint);
        });

        project.updated = new Date();

        project.opsHash = crypto
            .createHash("sha1")
            .update(JSON.stringify(project.ops))
            .digest("hex");
        project.buildInfo = patch.buildInfo;

        const patchPath = this._store.getPatchFile();
        jsonfile.writeFileSync(patchPath, project);

        const re = {
            "success": true,
            "msg": "PROJECT_SAVED"
        };
        re.updated = project.updated;
        re.updatedByUser = project.updatedByUser;

        return re;
    }

    getPatch(data)
    {
        const patchPath = this._store.getPatchFile();
        if (patchPath && fs.existsSync(patchPath))
        {
            let patch = fs.readFileSync(patchPath);
            patch = JSON.parse(patch.toString("utf-8"));
            return patch;
        }
        else
        {
            return {
                "ops": [],
                "shortId": "invalid"
            };
        }
    }

    async newPatch(data)
    {
        const currentUser = this.getCurrentUser();
        let name = data.name || "new offline project";
        this._log.info("project", "created", name);
        const id = this._generateRandomId();
        const newFile = path.join(this._store.getCurrentProjectDir(), id + ".json");
        const project = {
            "_id": id,
            "name": name,
            "shortId": "sh0r7Id",
            "userId": currentUser._id,
            "cachedUsername": currentUser.username,
            "created": new Date(),
            "updated": new Date(),
            "visibility": "public",
            "settings": {},
            "ops": []
        };
        fs.writeFileSync(newFile, JSON.stringify(project));
        this._store.setPatchFile(newFile);
        return project;
    }


    getBuildInfo()
    {
        return {
            "updateWarning": false,
            "core": {
                "timestamp": 1700734919296,
                "created": "2023-11-23T10:21:59.296Z",
                "git": {
                    "branch": "develop",
                    "commit": "04f23fcd2b2830840ed0c62595104fc7c3d96ae3",
                    "date": "2023-11-22T16:18:12.000Z",
                    "message": "viztexture aspect ratio/color picking etc"
                }
            },
            "ui": {
                "timestamp": 1700746574919,
                "created": "2023-11-23T13:36:14.919Z",
                "git": {
                    "branch": "develop",
                    "commit": "7acf5719f001a0ec07034fbe4c0fdfe15946dd7b",
                    "date": null,
                    "message": null
                }
            },
            "api": {
                "timestamp": 1700748324495,
                "created": "2023-11-23T14:05:24.495Z",
                "git": {
                    "branch": "master",
                    "commit": "ac06849ffb3e594b368bd2f5a63bd6eed62ea1a9",
                    "date": "2023-11-23T11:11:29.000Z",
                    "message": "patreon api hotfixes"
                }
            }
        };
    }

    fileUpload(data)
    {
        const target = cables.getAssetPath();
        if (!data.fileStr) return;
        if (!data.filename)
        {
            return;
        }
        const buffer = Buffer.from(data.fileStr.split(",")[1], "base64");
        return fs.writeFileSync(path.join(target, data.filename), buffer);
    }

    async getAllProjectOps()
    {
        const currentUser = this.getCurrentUser();
        const project = this.getCurrentProject();

        let opDocs = [];

        if (!project)
        {
            return opDocs;
        }

        let projectOps = [];
        let projectNamespaces = [];
        let usedOpIds = [];
        // add all ops that are used in the toplevel of the project, save them as used
        project.ops.forEach((projectOp) =>
        {
            projectOps.push((opsUtil.getOpNameById(projectOp.opId)));
            usedOpIds.push(projectOp.opId);
        });

        // add all userops of the current user
        projectNamespaces.push(opsUtil.getUserNamespace(currentUser.username));

        // add all the patchops of the current patch
        const patchOps = opsUtil.getPatchOpsNamespaceForProject(project);
        if (patchOps) projectNamespaces.push(patchOps);

        // now we should have all the ops that are used in the project, walk blueprints
        // recursively to get their opdocs
        const bpOps = subPatchOpUtil.getOpsUsedInSubPatches(project);
        bpOps.forEach((bpOp) =>
        {
            const opName = opsUtil.getOpNameById(bpOp.opId);
            const nsName = opsUtil.getCollectionNamespace(opName);
            projectOps.push(opName);
            if (opsUtil.isCollection(nsName)) projectNamespaces.push(nsName);
            usedOpIds.push(bpOp.opId);
        });

        projectOps = helper.uniqueArray(projectOps);
        usedOpIds = helper.uniqueArray(usedOpIds);
        projectNamespaces = helper.uniqueArray(projectNamespaces);

        projectOps.forEach((opName) =>
        {
            const opDoc = doc.getDocForOp(opName);
            if (opDoc) opDocs.push(opDoc);
        });

        // get opdocs for all the collected ops
        opDocs = opsUtil.addOpDocsForCollections(projectNamespaces, opDocs);
        opDocs.forEach((opDoc) => { opDoc.usedInProject = true; });

        opsUtil.addPermissionsToOps(opDocs, currentUser, [], project);
        opsUtil.addVersionInfoToOps(opDocs);

        opDocs = doc.makeReadable(opDocs);
        return opDocs;
    }


    async getOpDocsAll()
    {
        const opDocs = doc.getOpDocs(true, true);
        const cleanDocs = doc.makeReadable(opDocs);
        opsUtil.addPermissionsToOps(cleanDocs, null);

        const extensions = doc.getAllExtensionDocs();
        const _libs = fs.readdirSync(cables.getLibsPath());
        const libs = [];
        for (let i = 0; i < _libs.length; i++)
        {
            let skip = false;
            if (_libs[i].endsWith(".js"))
            {
                const libName = path.parse(_libs[i]);
                if (libName)
                {
                    let jsonName = path.join(cables.getLibsPath(), libName.name);
                    jsonName += ".json";
                    if (fs.existsSync(jsonName))
                    {
                        const json = JSON.parse(fs.readFileSync(jsonName));
                        if (json.hidden)
                        {
                            skip = true;
                        }
                    }
                }
                if (!skip)
                {
                    libs.push(_libs[i]);
                }
            }
        }

        const _coreLibs = fs.readdirSync(cables.getCoreLibsPath());
        const coreLibs = [];
        for (let i = 0; i < _coreLibs.length; i++)
        {
            const coreFilename = _coreLibs[i];
            if (coreFilename.endsWith(".max.js"))
            {
                coreLibs.push(coreFilename.split(".")[0]);
            }
        }

        return {
            "opDocs": cleanDocs,
            "extensions": extensions,
            "teamNamespaces": [],
            "libs": libs,
            "coreLibs": coreLibs
        };
    }

    getOpDocs(data)
    {
        const opName = opsUtil.getOpNameById(data.op.opId);
        if (!opName)
        {
            return {};
        }
        const result = {};
        result.opDocs = [];

        const opDoc = doc.getDocForOp(opName);
        result.content = "No docs yet...";

        const opDocs = [];
        if (opDoc) opDocs.push(opDoc);
        result.opDocs = doc.makeReadable(opDocs);
        result.opDocs = opsUtil.addPermissionsToOps(result.opDocs, null);
        const c = doc.getOpDocMd(opName);
        if (c) result.content = marked(c || "");
        return result;
    }

    saveOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opname);
        const opDir = opsUtil.getOpSourceDir(opName);
        if (!fs.existsSync(opDir))
        {
            mkdirp.sync(opDir);
        }
        const fn = opsUtil.getOpAbsoluteFileName(opName);
        this._log.info("save op ", opName, fn);

        const code = data.code;
        let returnedCode = code;

        const format = opsUtil.validateAndFormatOpCode(code);
        if (format.error)
        {
            const {
                line,
                message
            } = format.message;
            this._log.info({
                line,
                message
            });
            return {
                "error": {
                    line,
                    message
                }
            };
        }
        const formatedCode = format.formatedCode;
        if (opsUtil.existingCoreOp(opName) || data.format)
        {
            returnedCode = formatedCode;
        }
        returnedCode = helper.removeTrailingSpaces(returnedCode);

        fs.writeFileSync(fn, returnedCode);
        const jsonFile = opsUtil.getOpJsonPath(opName);
        let jsonData = jsonfile.readFileSync(jsonFile);
        if (!jsonData) jsonData = {};
        if (jsonData.updated) delete jsonData.updated;
        jsonfile.writeFileSync(jsonFile, jsonData, {
            "encoding": "utf-8",
            "spaces": 4
        });

        setTimeout(() =>
        {
            doc.updateOpDocs(opName);
            opsUtil.setOpDefaults(opName, null);
        }, 1000);

        return {
            "success": true,
            "opFullCode": returnedCode
        };
    }

    apiGetOpCode(params)
    {
        const opName = params.opName;
        let code = "";
        const currentProject = this.getCurrentProject();
        try
        {
            const attachmentOps = opsUtil.getSubPatchOpAttachment(opName);
            const bpOps = subPatchOpUtil.getOpsUsedInSubPatches(attachmentOps);
            if (!bpOps)
            {
                return code;
            }
            else
            {
                let opNames = [];
                for (let i = 0; i < bpOps.length; i++)
                {
                    const bpOp = bpOps[i];
                    const bpOpName = opsUtil.getOpNameById(bpOp.opId);
                    if (opsUtil.isCoreOp(bpOpName) && (!opsUtil.isOpOldVersion(bpOpName) && !opsUtil.isDeprecated(bpOpName))) continue;
                    if (currentProject && currentProject.ops && currentProject.ops.some((projectOp) => { return projectOp.opId === bpOp.opId; })) continue;
                    opNames.push(bpOpName);
                }

                if (opsUtil.isExtension(opName) || opsUtil.isTeamNamespace(opName))
                {
                    const collectionName = opsUtil.getCollectionNamespace(opName);
                    opNames = opNames.concat(opsUtil.getCollectionOpNames(collectionName));
                }
                else
                {
                    opNames.push(opName);
                }

                const ops = [];
                opNames.forEach((name) =>
                {
                    ops.push({
                        "objName": name,
                        "opId": opsUtil.getOpIdByObjName(name)
                    });
                });
                code = opsUtil.buildFullCode(ops, "none");
                return code;
            }
        }
        catch (e)
        {
            return code;
        }
    }

    getOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opId || data.opname);
        if (opsUtil.opExists(opName))
        {
            let code = opsUtil.getOpCode(opName);
            return {
                "name": opName,
                "id": data.opId,
                "code": code
            };
        }
        else
        {
            let code = "//empty file...";
            return {
                "name": opName,
                "id": null,
                "code": code
            };
        }
    }

    getBlueprintOps()
    {
        return { "data": { "ops": [] } };
    }

    formatOpCode(data)
    {
        const code = data.code;
        if (code)
        {
            const format = opsUtil.validateAndFormatOpCode(code);
            if (format.error)
            {
                const {
                    line,
                    message
                } = format.message;
                return {
                    "error": {
                        line,
                        message
                    }
                };
            }
            else
            {
                return {
                    "opFullCode": format.formatedCode,
                    "success": true
                };
            }
        }
        else
        {
            return {
                "opFullCode": "",
                "success": true
            };
        }
    }

    saveUserSettings(data)
    {
        if (data && data.settings)
        {
            this._store.setUserSettings(data.settings);
        }
    }

    checkProjectUpdated(data)
    {
        const project = this.getPatch();

        return {
            "updated": project.updated,
            "updatedByUser": project.updatedByUser,
            "buildInfo": project.buildInfo,
            "maintenance": false,
            "disallowSave": false
        };
    }

    getCoreLibCode(name)
    {
        const suffix = cables.getConfig().env === "live" ? ".min.js" : ".max.js";
        const fn = path.join(cables.getCoreLibsPath(), name + suffix);

        if (fs.existsSync(fn))
        {
            let info = fs.readFileSync(fn);

            info = info + "\n\nCABLES.loadedCoreLib(\"" + name + "\")";
            return info;
        }
        else
        {
            return "";
        }
    }

    getLibCode(name)
    {
        const fn = path.join(cables.getLibsPath(), name);
        if (fs.existsSync(fn))
        {
            let info = fs.readFileSync(fn);
            info = info + "\n\nCABLES.loadedLib(\"" + name + "\")";
            return info;
        }
        else
        {
            return "";
        }
    }

    getChangelog(data)
    {
        const obj = {};
        obj.items = [];
        obj.ts = Date.now();
        return obj;
    }

    opAttachmentSave(data)
    {
        opsUtil.updateAttachment(data.opname, data.name, data.content, false);
        return true;
    }

    setIconSaved()
    {
        let title = electronApp.editorWindow.getTitle();
        const pos = title.lastIndexOf(" *");
        let newTitle = title;
        if (pos !== -1) newTitle = title.substring(0, pos);
        electronApp.editorWindow.setTitle(newTitle);
    }

    setIconUnsaved()
    {
        const title = electronApp.editorWindow.getTitle();
        electronApp.editorWindow.setTitle(title + " *");
    }

    saveScreenshot(data)
    {
        const currentProject = this.getCurrentProject();
        if (!currentProject || !data || !data.screenshot)
        {
            return;
        }
        return projectsUtil.saveProjectScreenshot(currentProject, data.screenshot);
    }

    getFilelist(data)
    {
        switch (data.source)
        {
        case "patch":
            return this._getPatchFiles();
        case "lib":
            return this._getLibraryFiles();
        default:
            return [];
        }
    }

    getFileDetails(data)
    {
        console.log("DATA", data);
        return {};
    }

    getCurrentUser()
    {
        return store.getCurrentUser();
    }

    getCurrentProject()
    {
        return store.getCurrentProject();
    }

    _getPatchFiles()
    {
        const p = cables.getAssetPath();
        return this._readAssetDir(0, p, p, "assets/");
    }

    _getLibraryFiles()
    {
        const p = cables.getAssetLibraryPath();
        return this._readAssetDir(0, p, p, "public/assets/library/");
    }

    _getFileIconName(fileDb)
    {
        let icon = "file";

        if (fileDb.type === "SVG") icon = "pen-tool";
        else if (fileDb.type === "image") icon = "image";
        else if (fileDb.type === "gltf" || fileDb.type === "3d json") icon = "cube";
        else if (fileDb.type === "video") icon = "film";
        else if (fileDb.type === "font") icon = "type";
        else if (fileDb.type === "JSON") icon = "code";
        else if (fileDb.type === "audio") icon = "headphones";

        return icon;
    }

    _readAssetDir(lvl, filePath, origPath, urlPrefix = "")
    {
        const arr = [];
        const files = fs.readdirSync(filePath);
        for (const i in files)
        {
            const fullPath = path.join(filePath, "/", files[i]);
            const urlPath = path.join(urlPrefix, fullPath.substr(origPath.length, fullPath.length - origPath.length));

            if (files[i] && !files[i].startsWith("."))
            {
                const s = fs.statSync(fullPath);
                if (s.isDirectory() && fs.readdirSync(fullPath).length > 0)
                {
                    arr.push({
                        "d": true, "n": files[i], "t": "dir", "l": lvl, "c": this._readAssetDir(lvl + 1, path.join(fullPath, "/"), origPath, urlPrefix), "p": urlPath
                    });
                }
                else if (files[i].toLowerCase().endsWith(".fileinfo.json")) continue;
                else
                {
                    let type = "unknown";
                    if (files[i].endsWith("jpg") || files[i].endsWith("png") || files[i].endsWith("jpeg"))type = "image";
                    else if (files[i].endsWith("mp3") || files[i].endsWith("ogg") || files[i].endsWith("wav"))type = "audio";
                    else if (files[i].endsWith("3d.json"))type = "3d json";
                    else if (files[i].endsWith("json"))type = "json";
                    else if (files[i].endsWith("mp4"))type = "video";

                    const fileData = { "d": false, "n": files[i], "t": type, "l": lvl, "p": urlPath, "type": type, "updated": "bla" };
                    fileData.icon = this._getFileIconName(fileData);
                    let stats = fs.statSync(fullPath);
                    if (stats && stats.mtime)
                    {
                        fileData.updated = new Date(stats.mtime).getTime();
                    }

                    arr.push(fileData);
                }
            }
        }
        return arr;
    }
}
export default new ElectronEndpoint();
