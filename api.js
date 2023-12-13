import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import marked from "marked";
import jsonfile from "jsonfile";
import crypto from "crypto";
import pako from "pako";
import opsUtil from "./api/utils/ops_util.js";
import cables from "./api/cables.js";
import doc from "./api/utils/doc_util.js";
import helper from "./api/utils/helper_util.js";
import SubPatchOpUtil from "./api/utils/subpatchop_util.js";

export default class ElectronApi
{
    constructor(store)
    {
        this._log = console;
        this._store = store;
    }

    init()
    {
        ipcMain.handle("talkerMessage", async (event, cmd, data) =>
        {
            this._log.info("[electron] calling", cmd);
            let response = null;
            if (!cmd) return null;
            if (typeof this[cmd] === "function")
            {
                response = this[cmd](data);
            }
            return response;
        });

        ipcMain.on("store", (event, cmd, data) =>
        {
            event.returnValue = this._store.data;
        });
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
        const project = JSON.parse(fs.readFileSync(this._store.getPatchFile()));
        const opDocs = doc.getOpDocs(true, true);
        let code = "";
        if (project.ops)
        {
            let missingOps = project.ops.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });

            const subpatchopUtil = new SubPatchOpUtil();
            const ops = subpatchopUtil.getOpsUsedInBlueprints(project);
            missingOps = missingOps.concat(ops);
            missingOps = missingOps.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
            missingOps = missingOps.filter((obj, index) => { return missingOps.findIndex((item) => { return item.opId == obj.opId; }) === index; });
            code = opsUtil.buildFullCode(missingOps, opsUtil.PREFIX_OPS, opDocs);
            return code;
        }
        else
        {
            return code;
        }
    }

    patchCreateBackup()
    {
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
            this._log.error("[apiUpdateProject] body does not contain patch data");
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
        if (patchPath)
        {
            const patch = fs.readFileSync(patchPath);
            return JSON.parse(patch.toString("utf-8"));
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
        let name = data.name || "new offline project";
        this._log.info("project", "created", name);
        const id = this._generateRandomId();
        const newFile = path.join(this._store.getCurrentPatchDir(), id + ".json");
        const project = {
            "_id": id,
            "name": name,
            "shortId": "sh0r7Id",
            "userId": "localhorst",
            "cachedUsername": "electron",
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

    saveProjectAs()
    {
    }

    saveScreenshot()
    {
    }

    setProjectName()
    {
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

    getFilelist()
    {
    }

    fileConvert()
    {
    }

    getFileDetails()
    {
    }

    getLibraryFileInfo()
    {
    }

    deleteFile()
    {
    }

    createFile()
    {
    }

    fileUploadStr(data)
    {
        const target = path.join(this._store.getCurrentPatchDir(), "/assets/");
        if (!data.fileStr) return;
        if (!data.filename)
        {
            return;
        }
        fs.writeFileSync(path.join(target, data.filename), data.fileStr);
    }

    async getAllProjectOps()
    {
        const project = JSON.parse(fs.readFileSync(this._store.getPatchFile()));

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
        // if (currentUser) projectNamespaces.push(opsUtil.getUserNamespace(currentUser.username));

        // add all the userops of the patchcreator
        // res.startTime("addOwnerOps");
        // const patchOwner = await User.findOne({ "_id": project.userId });
        // if (patchOwner) projectNamespaces.push(opsUtil.getUserNamespace(patchOwner.username));
        // res.endTime("addOwnerOps");

        // add all the userops of all the collaborators
        // res.startTime("addCollaboratorOps");
        // let userid = null;
        // if (currentUser && currentUser._id) userid = currentUser._id;
        // const collaboratorIds = [];
        // let projectUsers = project.users || [];
        // for (let i = 0; i < projectUsers.length; i++)
        // {
        //     const collaboratorId = projectUsers[i];
        //     if (collaboratorId !== userid)
        //     {
        //         collaboratorIds.push(collaboratorId);
        //     }
        // }
        // const collaborators = await User.find({ "_id": { "$in": collaboratorIds } });
        // if (collaborators)
        // {
        //     collaborators.forEach((collaborator) =>
        //     {
        //         projectNamespaces.push(opsUtil.getUserNamespace(collaborator.username));
        //     });
        // }
        // res.endTime("addCollaboratorOps");

        // add all the patchops of the current patch
        const patchOps = opsUtil.getPatchOpsNamespaceForProject(project);
        if (patchOps) projectNamespaces.push(patchOps);

        // add all collections (teamops/extensions/patchops) used in project
        /// res.startTime("collectionNames");
        /// const extensionNames = projectsUtil.getCollectionNamespacesUsedInProject(project);
        /// projectNamespaces = projectNamespaces.concat(extensionNames);
        /// res.endTime("collectionNames");

        // add all ops used in blueprints, recursively
        //
        // now we should have all the ops that are used in the project, walk blueprints
        // recursively to get their opdocs
        // res.startTime("blueprintOps");
        const subpatchopUtil = new SubPatchOpUtil();
        const bpOps = subpatchopUtil.getOpsUsedInBlueprints(project);
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

        opDocs.forEach((opDoc) =>
        {
            if (usedOpIds.includes(opDoc.id)) opDoc.usedInProject = true;
        });

        // opsUtil.addPermissionsToOps(opDocs, currentUser, teams, project);
        opDocs = doc.makeReadable(opDocs);
        return opDocs;

        // Team.findTeamsWithNamespaceForUser(currentUser).then((teams) =>
        // {
        //     opsUtil.addPermissionsToOps(opDocs, currentUser, teams, project);
        //     res.endTime("addPermissions");
        //     opDocs = doc.makeReadable(opDocs);
        //     this.successRaw(res, opDocs);
        // });
    }

    getAllOps()
    {
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

    getCollectionOpDocs()
    {
    }

    opCreate()
    {
    }

    saveOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opname);
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

    getOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opname);
        const currentProject = JSON.parse(fs.readFileSync(this._store.getPatchFile()));
        let code = "";

        const subpatchopUtil = new SubPatchOpUtil();
        const attachmentOps = subpatchopUtil.getBlueprintAttachment(opName);
        const bpOps = subpatchopUtil.getOpsUsedInBlueprints(attachmentOps);
        let opNames = [];
        for (let i = 0; i < bpOps.length; i++)
        {
            const bpOp = bpOps[i];
            const bpOpName = opsUtil.getOpNameById(bpOp.opId);
            if (opsUtil.isCoreOp(bpOpName) && !opsUtil.isOpOldVersion(bpOpName)) continue;
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
        const opDocs = [];
        const ops = [];
        opNames.forEach((name) =>
        {
            const opDoc = doc.getDocForOp(name);
            if (opDoc)
            {
                opDocs.push(opDoc);
                ops.push({ "objName": opDoc.name, "opId": opDoc.id });
            }
            else
            {
                this._log.error("OPDOCS NOT FOUND FOR", name);
            }
        });
        code = opsUtil.buildFullCode(ops, "none", opDocs);
        return code;
    }

    getBlueprintOps()
    {
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

    opSaveLayout()
    {
    }

    opAddLib()
    {
    }

    opRemoveLib()
    {
    }

    opAddCoreLib()
    {
    }

    opRemoveCoreLib()
    {
    }

    opClone()
    {
    }

    opAttachmentAdd()
    {
    }

    opAttachmentGet()
    {
    }

    opAttachmentDelete()
    {
    }

    opAttachmentSave()
    {
    }

    saveUserSettings(data)
    {
        if (data && data.settings)
        {
            this._store.setUserSettings(data.settings);
        }
    }

    checkOpName()
    {
    }

    setIconUnsaved()
    {
    }

    setIconSaved()
    {
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

    _generateRandomId()
    {
        // https://gist.github.com/solenoid/1372386
        let timestamp = (new Date().getTime() / 1000 | 0).toString(16);
        return timestamp + "xxxxxxxxxxxxxxxx".replace(/[x]/g, function ()
        {
            return (Math.random() * 16 | 0).toString(16);
        }).toLowerCase();
    }
}
