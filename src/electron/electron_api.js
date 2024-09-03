import { ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import { marked } from "marked";
import mkdirp from "mkdirp";
import { promisify } from "util";

import jsonfile from "jsonfile";
import sanitizeFileName from "sanitize-filename";
import { utilProvider } from "cables-shared-api";
import cables from "../cables.js";
import logger from "../utils/logger.js";
import doc from "../utils/doc_util.js";
import helper from "../utils/helper_util.js";
import opsUtil from "../utils/ops_util.js";
import subPatchOpUtil from "../utils/subpatchop_util.js";
import settings from "./electron_settings.js";
import projectsUtil from "../utils/projects_util.js";
import electronApp from "./main.js";
import filesUtil from "../utils/files_util.js";
import libsUtil from "../utils/libs_util.js";
import StandaloneZipExport from "../export/export_zip_standalone.js";

class ElectronApi
{
    constructor()
    {
        this._log = logger;
    }

    init()
    {
        ipcMain.handle("talkerMessage", async (event, cmd, data, topicConfig = {}) =>
        {
            try
            {
                return this.talkerMessage(cmd, data, topicConfig);
            }
            catch (e)
            {
                return this.error(e.message, e);
            }
        });

        ipcMain.on("platformSettings", (event, _cmd, _data) =>
        {
            settings.data.buildInfo = settings.getBuildInfo();
            event.returnValue = settings.data;
        });

        ipcMain.on("cablesConfig", (event, _cmd, _data) =>
        {
            event.returnValue = cables.getConfig();
        });

        ipcMain.on("getStartupLog", (event, _cmd, _data) =>
        {
            event.returnValue = this._log.startUpLog || [];
        });

        ipcMain.on("getOpDir", (event, data) =>
        {
            let opName = opsUtil.getOpNameById(data.opId);
            if (!opName) opName = data.opName;
            event.returnValue = opsUtil.getOpAbsolutePath(opName);
        });

        ipcMain.on("getOpModuleDir", (event, data) =>
        {
            let opName = opsUtil.getOpNameById(data.opId);
            if (!opName) opName = data.opName;
            const opDir = opsUtil.getOpAbsolutePath(opName);
            event.returnValue = path.join(opDir, "node_modules", data.moduleName);
        });
    }

    async talkerMessage(cmd, data, topicConfig = {})
    {
        let response = null;
        if (!cmd) return this.error("UNKNOWN_COMMAND");
        if (typeof this[cmd] === "function")
        {
            if (topicConfig.needsProjectFile)
            {
                const projectFile = settings.getCurrentProjectFile();
                if (!projectFile || !projectFile.endsWith(projectsUtil.CABLES_PROJECT_FILE_EXTENSION))
                {
                    const newProjectFile = await electronApp.saveProjectFileDialog();
                    if (newProjectFile)
                    {
                        let patchData = null;
                        let currentProject = settings.getCurrentProject();
                        if (cmd === "savePatch" && data)
                        {
                            patchData = data;
                        }
                        projectsUtil.writeProjectToFile(newProjectFile, currentProject, patchData);
                        this.loadProject(newProjectFile);
                    }
                    else
                    {
                        return this.error("no project dir chosen", null, "info");
                    }
                }
            }
            return this[cmd](data);
        }
        else
        {
            this._log.warn("no method for talkerMessage", cmd);
        }
        return response;
    }

    getOpInfo(data)
    {
        const name = opsUtil.getOpNameById(data.opName) || data.opName;

        let warns = [];
        try
        {
            const currentProject = settings.getCurrentProject();
            if (currentProject)
            {
                const opDocs = doc.getOpDocsInProjectDirs(currentProject);
                opDocs.forEach((opDoc) =>
                {
                    if (opDoc.overrides)
                    {
                        opDoc.overrides.forEach((override) =>
                        {
                            warns.push({
                                "type": "project",
                                "id": "",
                                "text": "this op overrides another op in <a onclick=\"CABLESUILOADER.talkerAPI.send('openDir', { 'dir': '" + override + "'});\">" + override + "</a>"
                            });
                        });
                    }
                });
            }

            warns = warns.concat(opsUtil.getOpCodeWarnings(name));

            if (opsUtil.isOpNameValid(name))
            {
                const result = { "warns": warns };
                result.attachmentFiles = opsUtil.getAttachmentFiles(name);
                return this.success("OK", result, true);
            }
            else
            {
                const result = { "warns": [] };
                result.attachmentFiles = [];
                return this.success("OK", result, true);
            }
        }
        catch (e)
        {
            this._log.warn("error when getting opinfo", name, e.message);
            const result = { "warns": warns };
            result.attachmentFiles = [];
            return this.success("OK", result, true);
        }
    }

    async savePatch(patch)
    {
        const currentProject = settings.getCurrentProject();
        const currentProjectFile = settings.getCurrentProjectFile();

        const re = {
            "msg": "PROJECT_SAVED"
        };
        currentProject.updated = Date.now();
        currentProject.updatedByUser = settings.getCurrentUser().username;
        projectsUtil.writeProjectToFile(currentProjectFile, currentProject, patch);
        this.loadProject(currentProjectFile);
        re.updated = currentProject.updated;
        re.updatedByUser = currentProject.updatedByUser;
        return this.success("OK", re, true);
    }

    async patchCreateBackup()
    {
        const re = {
            "msg": "BACKUP_CREATED"
        };
        const currentProject = settings.getCurrentProject();
        const projectFile = await electronApp.saveProjectFileDialog();
        if (!projectFile)
        {
            logger.info("no backup file chosen");
            return this.error("UNKNOWN_PROJECT");
        }

        const backupProject = projectsUtil.getBackup(currentProject);
        fs.writeFileSync(projectFile, JSON.stringify(backupProject));
        return this.success("OK", re, true);
    }

    getPatch()
    {
        const patchPath = settings.getCurrentProjectFile();
        const currentUser = settings.getCurrentUser();
        let currentProject = settings.getCurrentProject();
        if (patchPath && fs.existsSync(patchPath))
        {
            currentProject = fs.readFileSync(patchPath);
            currentProject = JSON.parse(currentProject.toString("utf-8"));
            if (!currentProject.hasOwnProperty("userList")) currentProject.userList = [currentUser];
            if (!currentProject.hasOwnProperty("teams")) currentProject.teams = [];
        }
        else
        {
            if (!currentProject)
            {
                const newProject = projectsUtil.generateNewProject(settings.getCurrentUser());
                this.loadProject(patchPath, newProject);
                currentProject = newProject;
            }
        }
        currentProject.allowEdit = true;
        currentProject.summary = currentProject.summary || {};
        currentProject.summary.title = currentProject.name;
        currentProject.summary.allowEdit = true;
        return this.success("OK", currentProject, true);
    }

    async newPatch()
    {
        electronApp.openPatch();
        return this.success("OK", true, true);
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
        fs.writeFileSync(path.join(target, data.filename), buffer);
        return this.success("OK", true, true);
    }

    async getAllProjectOps()
    {
        const currentUser = settings.getCurrentUser();
        const project = settings.getCurrentProject();

        let opDocs = [];

        if (!project)
        {
            return this.success("OK", opDocs, true);
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

        // add all ops in any of the project op directory
        const otherDirsOps = doc.getOpDocsInProjectDirs(project).map((opDoc) => { return opDoc.name; });
        projectOps = projectOps.concat(otherDirsOps);

        // now we should have all the ops that are used in the project, walk subPatchOps
        // recursively to get their opdocs
        const subPatchOps = subPatchOpUtil.getOpsUsedInSubPatches(project);
        subPatchOps.forEach((subPatchOp) =>
        {
            const opName = opsUtil.getOpNameById(subPatchOp.opId);
            const nsName = opsUtil.getCollectionNamespace(opName);
            projectOps.push(opName);
            if (opsUtil.isCollection(nsName)) projectNamespaces.push(nsName);
            usedOpIds.push(subPatchOp.opId);
        });

        projectOps = helper.uniqueArray(projectOps);
        usedOpIds = helper.uniqueArray(usedOpIds);
        projectNamespaces = helper.uniqueArray(projectNamespaces);
        projectOps.forEach((opName) =>
        {
            let opDoc = doc.buildOpDocs(opName);
            if (opDoc)
            {
                if (!opDoc.name) opDoc.name = opName;
                opDocs.push(opDoc);
            }
        });

        // get opdocs for all the collected ops
        opDocs = opsUtil.addOpDocsForCollections(projectNamespaces, opDocs);
        opDocs.forEach((opDoc) =>
        {
            if (usedOpIds.includes(opDoc.id)) opDoc.usedInProject = true;
        });

        opsUtil.addPermissionsToOps(opDocs, currentUser, [], project);
        opsUtil.addVersionInfoToOps(opDocs);

        opDocs = doc.makeReadable(opDocs);
        return this.success("OK", opDocs, true);
    }


    async getOpDocsAll()
    {
        const currentUser = settings.getCurrentUser();
        const currentProject = settings.getCurrentProject();
        let opDocs = doc.getOpDocs(true, true);
        opDocs = opDocs.concat(doc.getCollectionOpDocs("Ops.Extension.Standalone", currentUser));
        opDocs = opDocs.concat(doc.getOpDocsInProjectDirs(currentProject));
        const cleanDocs = doc.makeReadable(opDocs);
        opsUtil.addPermissionsToOps(cleanDocs, null);

        const extensions = doc.getAllExtensionDocs(true, true);
        const libs = projectsUtil.getAvailableLibs(currentProject);
        const coreLibs = projectsUtil.getCoreLibs();

        return this.success("OK", {
            "opDocs": cleanDocs,
            "extensions": extensions,
            "teamNamespaces": [],
            "libs": libs,
            "coreLibs": coreLibs
        }, true);
    }

    async getOpDocs(data)
    {
        const opName = opsUtil.getOpNameById(data) || data;
        if (!opName)
        {
            return {};
        }
        const result = {};
        result.opDocs = [];

        const opDoc = doc.getDocForOp(opName);
        result.content = "No docs yet...";

        const opDocs = [];
        if (opDoc)
        {
            opDocs.push(opDoc);
            if (opDoc.dependencies)
            {
                const opPackages = opsUtil.getOpNpmPackages(opName);
                const packageDir = opsUtil.getOpAbsolutePath(opName);
                result.dependenciesOutput = await electronApp.installPackages(packageDir, opPackages, opName);
            }
        }
        result.opDocs = doc.makeReadable(opDocs);
        result.opDocs = opsUtil.addPermissionsToOps(result.opDocs, null);
        const c = doc.getOpDocMd(opName);
        if (c) result.content = marked(c || "");
        return this.success("OK", result, true);
    }

    saveOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opname);
        const code = data.code;
        let returnedCode = code;

        // const format = opsUtil.validateAndFormatOpCode(code);
        // if (format.error)
        // {
        //     const {
        //         line,
        //         message
        //     } = format.message;
        //     this._log.info({
        //         line,
        //         message
        //     });
        //     return {
        //         "error": {
        //             line,
        //             message
        //         }
        //     };
        // }
        // const formatedCode = format.formatedCode;
        const formatedCode = code;
        if (data.format || opsUtil.isCoreOp(opName))
        {
            returnedCode = formatedCode;
        }
        returnedCode = opsUtil.updateOpCode(opName, settings.getCurrentUser(), returnedCode);
        doc.updateOpDocs(opName);

        return this.success("OK", { "opFullCode": returnedCode }, true);
    }

    getOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opId || data.opname);
        if (opsUtil.opExists(opName))
        {
            let code = opsUtil.getOpCode(opName);
            return this.success("OK", {
                "name": opName,
                "id": data.opId,
                "code": code
            }, true);
        }
        else
        {
            let code = "//empty file...";
            return this.success("OK", {
                "name": opName,
                "id": null,
                "code": code
            }, true);
        }
    }

    async opAttachmentAdd(data)
    {
        const opName = opsUtil.getOpNameById(data.opname) || data.opname;
        const attName = data.name;
        const p = opsUtil.addAttachment(opName, "att_" + attName, "hello attachment");
        this._log.info("created attachment!", p);
        doc.updateOpDocs(opName);
        this.success("OK");
    }

    async opAttachmentDelete(data)
    {
        const opName = opsUtil.getOpNameById(data.opname) || data.opname;
        const attName = data.name;
        opsUtil.deleteAttachment(opName, attName);
        this.success("OK");
    }

    async opAddCoreLib(data)
    {
        const opName = opsUtil.getOpNameById(data.opname) || data.opname;
        const libName = sanitizeFileName(data.name);
        const opFilename = opsUtil.getOpJsonPath(data.opname);
        const libFilename = cables.getCoreLibsPath() + libName;
        const existsLib = fs.existsSync(libFilename + ".js");
        if (!existsLib)
        {
            this.error("LIB_NOT_FOUND");
            return;
        }

        try
        {
            const obj = jsonfile.readFileSync(opFilename);
            obj.coreLibs = obj.coreLibs || [];

            if (obj.coreLibs.indexOf(libName) === -1) obj.coreLibs.push(libName);

            try
            {
                jsonfile.writeFileSync(opFilename, obj, {
                    "encoding": "utf-8",
                    "spaces": 4
                });
                doc.updateOpDocs(opName);
                this.success("OK", {});
            }
            catch (writeErr)
            {
                this.error("WRITE_ERROR");
            }
        }
        catch (err)
        {
            this.error("UNKNOWN_ERROR");
        }
    }

    async opAddLib(data)
    {
        const opName = opsUtil.getOpNameById(data.opname) || data.opname;
        const libName = sanitizeFileName(data.name);

        const filename = opsUtil.getOpJsonPath(opName);

        const libExists = libsUtil.libExists(libName);
        if (!libExists)
        {
            this.error("LIB_NOT_FOUND", 400);
            return;
        }

        try
        {
            const obj = jsonfile.readFileSync(filename);
            obj.libs = obj.libs || [];

            if (obj.libs.indexOf(libName) === -1) obj.libs.push(libName);

            try
            {
                jsonfile.writeFileSync(filename, obj, {
                    "encoding": "utf-8",
                    "spaces": 4
                });
                doc.updateOpDocs(opName);
                this.success("OK");
            }
            catch (writeErr)
            {
                this.error("WRITE_ERROR", 500);
            }
        }
        catch (err)
        {
            this.error("UNKNOWN_ERROR", 500);
        }
    }

    async opRemoveLib(data)
    {
        const opName = opsUtil.getOpNameById(data.opname) || data.opname;
        const libName = sanitizeFileName(data.name);

        const filename = opsUtil.getOpJsonPath(opName);

        try
        {
            const obj = jsonfile.readFileSync(filename);
            obj.libs = obj.libs || [];

            if (obj.libs.includes(libName)) obj.libs = obj.libs.filter((lib) => { return lib !== libName; });

            try
            {
                jsonfile.writeFileSync(filename, obj, {
                    "encoding": "utf-8",
                    "spaces": 4
                });
                doc.updateOpDocs(opName);
                this.success("OK");
            }
            catch (writeErr)
            {
                this.error("WRITE_ERROR", 500);
            }
        }
        catch (err)
        {
            this.error("UNKNOWN_ERROR", 500);
        }
    }

    async opRemoveCoreLib(data)
    {
        const opName = opsUtil.getOpNameById(data.opname) || data.opname;
        const libName = sanitizeFileName(data.name);
        const opFilename = opsUtil.getOpJsonPath(opName);

        try
        {
            const obj = jsonfile.readFileSync(opFilename);
            obj.coreLibs = obj.coreLibs || [];

            if (obj.coreLibs.includes(libName)) obj.coreLibs = obj.coreLibs.filter((lib) => { return lib !== libName; });

            try
            {
                jsonfile.writeFileSync(opFilename, obj, {
                    "encoding": "utf-8",
                    "spaces": 4
                });
                doc.updateOpDocs(opName);
                this.success("OK");
            }
            catch (writeErr)
            {
                this.error("WRITE_ERROR", 500);
            }
        }
        catch (err)
        {
            this.error("UNKNOWN_ERROR", 500);
        }
    }

    async opAttachmentGet(data)
    {
        const opName = opsUtil.getOpNameById(data.opname) || data.opname;
        const attName = data.name;
        const content = opsUtil.getAttachment(opName, attName);
        return this.success("OK", { "content": content }, true);
    }

    async getCollectionOpDocs(data)
    {
        let opDocs = [];
        const collectionName = data.name;
        const currentUser = settings.getCurrentUser();
        if (collectionName)
        {
            const opNames = opsUtil.getCollectionOpNames(collectionName, true);
            opDocs = opsUtil.addOpDocsForCollections(opNames, opDocs);
            opDocs = opsUtil.addVersionInfoToOps(opDocs);
            opDocs = opsUtil.addPermissionsToOps(opDocs, currentUser);
        }
        return this.success("OK", { "opDocs": doc.makeReadable(opDocs) }, true);
    }


    getBuildInfo()
    {
        return this.success("OK", settings.getBuildInfo(), true);
    }

    formatOpCode(data)
    {
        const code = data.code;
        if (code)
        {
            // const format = opsUtil.validateAndFormatOpCode(code);
            // if (format.error)
            // {
            //     const {
            //         line,
            //         message
            //     } = format.message;
            //     return {
            //         "error": {
            //             line,
            //             message
            //         }
            //     };
            // }
            // else
            // {
            //     return {
            //         "opFullCode": format.formatedCode,
            //         "success": true
            //     };
            // }

            return this.success("OK", {
                "opFullCode": code
            }, true);
        }
        else
        {
            return this.success("OK", {
                "opFullCode": ""
            }, true);
        }
    }

    saveUserSettings(data)
    {
        if (data && data.settings)
        {
            settings.setUserSettings(data.settings);
        }
    }

    checkProjectUpdated(data)
    {
        const project = settings.getCurrentProject();
        if (project)
        {
            return this.success("OK", {
                "updated": project.updated,
                "updatedByUser": project.updatedByUser,
                "buildInfo": project.buildInfo,
                "maintenance": false,
                "disallowSave": false
            }, true);
        }
        else
        {
            return this.success("OK", {
                "updated": "",
                "updatedByUser": "",
                "buildInfo": settings.getBuildInfo(),
                "maintenance": false,
                "disallowSave": false
            }, true);
        }
    }

    getChangelog(data)
    {
        const obj = {};
        obj.items = [];
        obj.ts = Date.now();
        return this.success("OK", obj, true);
    }

    opAttachmentSave(data)
    {
        let opName = data.opname;
        if (opsUtil.isOpId(data.opname)) opName = opsUtil.getOpNameById(data.opname);
        const result = opsUtil.updateAttachment(opName, data.name, data.content, false);
        return this.success("OK", result, true);
    }

    setIconSaved()
    {
        let title = electronApp.editorWindow.getTitle();
        const pos = title.lastIndexOf(" *");
        let newTitle = title;
        if (pos !== -1) newTitle = title.substring(0, pos);
        electronApp.setDocumentEdited(false);
        electronApp.editorWindow.setTitle(newTitle);
    }

    setIconUnsaved()
    {
        const title = electronApp.editorWindow.getTitle();
        electronApp.setDocumentEdited(true);
        electronApp.editorWindow.setTitle(title + " *");
    }

    saveScreenshot(data)
    {
        const currentProject = settings.getCurrentProject();
        if (!currentProject || !data || !data.screenshot)
        {
            return this.error("NO_PROJECT");
        }
        currentProject.screenshot = data.screenshot;
        projectsUtil.writeProjectToFile(settings.getCurrentProjectFile(), currentProject);
        return this.success("OK", { "msg": "OK" }, true);
    }

    getFilelist(data)
    {
        let files;
        switch (data.source)
        {
        case "patch":
            files = filesUtil.getPatchFiles();
            break;
        case "lib":
            files = filesUtil.getLibraryFiles();
            break;
        default:
            files = [];
            break;
        }
        return this.success("OK", files, true);
    }

    getFileDetails(data)
    {
        let filePath = helper.fileURLToPath(data.filename);
        const fileDb = filesUtil.getFileDb(filePath, settings.getCurrentProject(), settings.getCurrentUser());
        return this.success("OK", filesUtil.getFileInfo(fileDb), true);
    }

    getLibraryFileInfo(data)
    {
        const fileName = filesUtil.realSanitizeFilename(data.filename);
        const fileCategory = filesUtil.realSanitizeFilename(data.fileCategory);

        const filePath = path.join(fileCategory, fileName);
        const libraryPath = cables.getAssetLibraryPath();
        const finalPath = path.join(libraryPath, filePath);

        if (!fs.existsSync(finalPath))
        {
            return this.success("OK", {}, true);
        }
        else
        {
            const infoFileName = finalPath + ".fileinfo.json";
            let filename = "";

            if (fs.existsSync(infoFileName))filename = infoFileName;

            if (filename === "")
            {
                return this.success("OK", {}, true);
            }
            else
            {
                const fileInfo = JSON.parse(fs.readFileSync(filename));
                return this.success("OK", fileInfo, true);
            }
        }
    }

    checkOpName(data)
    {
        const opDocs = doc.getOpDocs(false, false);
        const newName = data.namespace + data.v;
        const sourceName = data.sourceName || null;
        const currentUser = settings.getCurrentUser();
        const result = this._getFullRenameResponse(opDocs, newName, sourceName, currentUser, true, data.rename, data.opTargetDir);
        result.checkedName = newName;
        return this.success("OK", result, true);
    }

    getRecentPatches()
    {
        const recents = settings.getRecentProjects();
        const result = [];
        for (let i = 0; i < recents.length; i++)
        {
            const recentProject = recents[i];
            let screenShot = recentProject.screenshot;
            if (!screenShot)
            {
                screenShot = projectsUtil.getScreenShotFileName(recentProject, "png");
                if (!fs.existsSync(screenShot)) screenShot = path.join(cables.getUiDistPath(), "/img/placeholder_dark.png");
            }
            result[i] = recentProject;
            result[i].thumbnail = screenShot;
        }
        return this.success("OK", result.slice(0, 10), true);
    }

    opCreate(data)
    {
        let opName = data.opname;
        const currentUser = settings.getCurrentUser();
        const opDocDefaults = {
            "layout": data.layout,
            "libs": data.libs,
            "coreLibs": data.coreLibs
        };
        const result = opsUtil.createOp(opName, currentUser, data.code, opDocDefaults, data.attachments, data.opTargetDir);
        filesUtil.registerOpChangeListeners([opName]);

        return this.success("OK", result, true);
    }

    opUpdate(data)
    {
        const opName = data.opname;
        const currentUser = settings.getCurrentUser();
        return this.success("OK", { "data": opsUtil.updateOp(currentUser, opName, data.update, { "formatCode": data.formatCode }) }, true);
    }

    opSaveLayout(data)
    {
        const layout = data.layout;
        const opName = opsUtil.getOpNameById(data.opname) || layout.name;
        return this.success("OK", opsUtil.saveLayout(opName, layout), true);
    }

    opClone(data)
    {
        const newName = data.name;
        const oldName = opsUtil.getOpNameById(data.opname) || data.opname;
        const currentUser = settings.getCurrentUser();
        return this.success("OK", opsUtil.cloneOp(oldName, newName, currentUser, data.opTargetDir), true);
    }

    opRename(data)
    {
        const oldId = data.opname;
        const newName = data.name;
        const oldName = opsUtil.getOpNameById(oldId);

        const currentUser = settings.getCurrentUser();
        let opNamespace = opsUtil.getNamespace(newName);

        const opDocs = doc.getOpDocs(false, false);
        const renameResults = this._getFullRenameResponse(opDocs, newName, oldName, currentUser, opsUtil.isPrivateOp(newName), true);
        if (!oldName)
        {
            renameResults.problems.push("No name for source op given.");
        }

        const result = renameResults;
        result.title = "rename - " + oldName + " - " + newName;
        result.objName = newName;
        result.oldName = oldName;
        result.opId = oldId;
        result.opname = oldName;
        result.opNamespace = opNamespace;
        result.newopname = newName;
        result.shortname = opsUtil.getOpShortName(newName);
        result.oldShortName = opsUtil.getOpShortName(oldName);
        const versions = opsUtil.getOpVersionNumbers(oldName, opDocs);
        result.otherVersions = versions.length > 1 ? versions.filter((v) => { return v.name !== oldName; }) : [];
        result.renamePossible = renameResults.problems.length === 0;

        if (Object.keys(renameResults.problems).length > 0)
        {
            result.problems = Object.values(renameResults.problems);
            return this.success("PROBLEMS", result);
        }

        const start = Date.now();

        result.user = currentUser;
        result.showresult = true;

        let removeOld = true;
        let renameSuccess = false;
        if (opsUtil.isUserOp(newName))
        {
            renameSuccess = opsUtil.renameToUserOp(oldName, newName, currentUser, removeOld);
        }
        else if (opsUtil.isTeamOp(newName))
        {
            renameSuccess = opsUtil.renameToTeamOp(oldName, newName, currentUser, removeOld);
        }
        else if (opsUtil.isExtensionOp(newName))
        {
            renameSuccess = opsUtil.renameToExtensionOp(oldName, newName, currentUser, removeOld);
        }
        else if (opsUtil.isPatchOp(newName))
        {
            renameSuccess = opsUtil.renameToPatchOp(oldName, newName, currentUser, removeOld, false);
        }
        else
        {
            renameSuccess = opsUtil.renameToCoreOp(oldName, newName, currentUser, removeOld);
        }

        if (!renameSuccess)
        {
            return this.error("ERROR", 500);
        }
        else
        {
            this._log.verbose("*" + currentUser.username + " finished after " + Math.round((Date.now() - start) / 1000) + " seconds ");
            return this.success("OK", result);
        }
    }

    async installOpDependencies(opName)
    {
        const results = [];
        if (opName)
        {
            const targetDir = opsUtil.getOpAbsolutePath(opName);
            const opPackages = opsUtil.getOpNpmPackages(opName);
            if (opPackages.length === 0)
            {
                const nodeModulesDir = path.join(targetDir, "node_modules");
                if (fs.existsSync(nodeModulesDir)) fs.rmSync(nodeModulesDir, { "recursive": true });
                results.push({ "stdout": "nothing to install", "packages": [] });
                return this.success("EMPTY", results, false);
            }
            else
            {
                const npmResults = await electronApp.installPackages(targetDir, opPackages, opName);
                if (npmResults.stderr)
                {
                    return this.error(npmResults.stderr);
                }
                else
                {
                    return this.success("OK", npmResults);
                }
            }
        }
        else
        {
            results.push({ "stdout": "nothing to install", "packages": [] });
            return this.success("EMPTY", results, false);
        }
    }

    async installProjectDependencies()
    {
        const currentProject = settings.getCurrentProject();
        if (!currentProject)
        {
            return this.error("UNSAVED_PROJECT", [{ "stdout": "please save your project first", "packages": [] }]);
        }

        const results = [];
        let projectPackages = {};
        currentProject.ops.forEach((op) =>
        {
            const opName = opsUtil.getOpNameById(op.opId);
            if (opName)
            {
                const targetDir = opsUtil.getOpAbsolutePath(opName);
                const opPackages = opsUtil.getOpNpmPackages(opName);
                if (opPackages.length > 0)
                {
                    if (!projectPackages.hasOwnProperty(targetDir)) projectPackages[targetDir] = [];
                    projectPackages[targetDir] = {
                        "opName": opName,
                        "packages": opPackages
                    };
                }
            }
        });
        if (Object.keys(projectPackages).length === 0)
        {
            results.push({ "stdout": "nothing to install", "packages": [] });
            return this.success("EMPTY", results, false);
        }
        else
        {
            const allNpmInstalls = [];
            for (let targetDir in projectPackages)
            {
                const opData = projectPackages[targetDir];
                allNpmInstalls.push(electronApp.installPackages(targetDir, opData.packages, opData.opName));
            }

            const npmResults = await Promise.all(allNpmInstalls);
            return this.success("OK", npmResults);
        }
    }

    async addOpPackage(data)
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        const targetDir = data.targetDir || currentProjectDir;
        const npmResults = await electronApp.addOpPackage(targetDir, data.package);
        return this.success("OK", npmResults);
    }

    async openDir(options)
    {
        if (options && options.dir)
        {
            await shell.openPath(options.dir);
            return this.success("OK", {}, true);
        }
    }

    async openOpDir(options)
    {
        const opName = opsUtil.getOpNameById(options.opId) || options.opName;
        if (!opName) return;
        const opDir = opsUtil.getOpAbsoluteFileName(opName);
        if (opDir)
        {
            shell.showItemInFolder(opDir);
            return this.success("OK", {}, true);
        }
    }

    async openProjectDir()
    {
        const projectFile = settings.getCurrentProjectFile();
        if (projectFile)
        {
            shell.showItemInFolder(projectFile);
            return this.success("OK", {});
        }
    }

    async openAssetDir(data)
    {
        let assetPath = helper.fileURLToPath(data.url, true);
        if (fs.existsSync(assetPath))
        {
            const stats = fs.statSync(assetPath);
            if (stats.isDirectory())
            {
                shell.openPath(assetPath);
                return this.success("OK", {});
            }
            else
            {
                shell.showItemInFolder(assetPath);
                return this.success("OK", {});
            }
        }
        else
        {
            shell.openPath(cables.getAssetPath());
            return this.success("OK", {});
        }
    }

    async selectFile(data)
    {
        if (data && data.url)
        {
            let assetUrl = helper.fileURLToPath(data.url, true);
            let filter = ["*"];
            if (data.filter)
            {
                filter = filesUtil.FILETYPES[data.filter] || ["*"];
            }
            const pickedFileUrl = await electronApp.pickFileDialog(assetUrl, true, filter);
            return this.success("OK", pickedFileUrl, true);
        }
        else
        {
            return this.error("NO_FILE_SELECTED", null, "info");
        }
    }


    checkNumAssetPatches()
    {
        return this.success("OK", { "assets": [], "countPatches": 0, "countOps": 0 }, true);
    }

    async saveProjectAs()
    {
        const projectFile = await electronApp.saveProjectFileDialog();
        if (!projectFile)
        {
            logger.info("no project dir chosen");
            return this.error("UNKNOWN_PROJECT");
        }

        let collaborators = [];
        let usersReadOnly = [];

        const currentUser = settings.getCurrentUser();
        const origProject = settings.getCurrentProject();
        origProject._id = helper.generateRandomId();
        origProject.name = path.basename(projectFile);
        origProject.summary = origProject.summary || {};
        origProject.summary.title = origProject.name;
        origProject.userId = currentUser._id;
        origProject.cachedUsername = currentUser.username;
        origProject.created = Date.now();
        origProject.cloneOf = origProject._id;
        origProject.updated = Date.now();
        origProject.users = collaborators;
        origProject.usersReadOnly = usersReadOnly;
        origProject.visibility = "private";
        origProject.shortId = helper.generateShortId(origProject._id, Date.now());
        projectsUtil.writeProjectToFile(projectFile, origProject);
        this.loadProject(projectFile);
        electronApp.reload();
        return this.success("OK", origProject, true);
    }

    async gotoPatch(data)
    {
        let project = null;
        let projectFile = null;
        if (data && data.id)
        {
            projectFile = settings.getRecentProjectFile(data.id);
            if (projectFile) project = settings.getProjectFromFile(projectFile);
        }
        if (project && projectFile)
        {
            electronApp.openPatch(projectFile);
            return this.success("OK", true, true);
        }
        else
        {
            const file = await electronApp.pickProjectFileDialog();
            return this.success("OK", { "projectFile": file });
        }
    }

    updateFile(data)
    {
        this._log.info("file edit...");
        if (!data || !data.fileName)
        {
            return this.error("UNKNOWN_FILE");
        }


        const project = settings.getCurrentProject();
        const newPath = path.join(projectsUtil.getAssetPath(project._id), "/");
        if (!fs.existsSync(newPath)) mkdirp.sync(newPath);

        const sanitizedFileName = filesUtil.realSanitizeFilename(data.fileName);

        try
        {
            if (fs.existsSync(newPath + sanitizedFileName))
            {
                this._log.info("delete old file ", sanitizedFileName);
                fs.unlinkSync(newPath + sanitizedFileName);
            }
        }
        catch (e) {}

        this._log.info("edit file", newPath + sanitizedFileName);

        fs.writeFileSync(newPath + sanitizedFileName, data.content);
        return this.success("OK", { "filename": sanitizedFileName }, true);
    }

    async setProjectUpdated()
    {
        const now = Date.now();
        const project = settings.getCurrentProject();
        if (project)
        {
            const projectFile = settings.getCurrentProjectFile();
            project.updated = now;
            if (projectFile)
            {
                projectsUtil.writeProjectToFile(projectFile, project);
            }
        }
        return this.success("OK", project);
    }

    getProjectOpDirs()
    {
        const currentProject = settings.getCurrentProject();
        const dirs = projectsUtil.getProjectOpDirs(currentProject, true);
        if (!cables.isPackaged()) dirs.unshift(cables.getOpsPath());
        const dirInfos = [];
        const usedOpFiles = {};
        if (currentProject && currentProject.ops)
        {
            currentProject.ops.forEach((op) =>
            {
                const opName = opsUtil.getOpNameById(op.opId);
                if (opName)
                {
                    const opDir = opsUtil.getOpAbsolutePath(opName);
                    if (opDir)
                    {
                        if (!usedOpFiles.hasOwnProperty(opName)) usedOpFiles[opName] = opDir;
                    }
                }
            });
        }
        dirs.forEach((dir) =>
        {
            const opJsons = helper.getFileNamesRecursive(dir, ".json").map((fileName) => { return path.basename(fileName, ".json"); });
            const opNames = opJsons.filter((jsonName) => { return opsUtil.isOpNameValid(jsonName); });
            let numUsedOps = 0;
            opNames.forEach((opName) =>
            {
                const opFile = usedOpFiles[opName];
                if (opFile && opFile.startsWith(dir) && opFile.endsWith(path.join(opName, "/"))) numUsedOps++;
            });
            dirInfos.push({
                "dir": dir,
                "opNames": opNames,
                "numOps": opNames.length,
                "numUsedOps": numUsedOps,
                "fixedPlace": projectsUtil.isFixedPositionOpDir(dir)
            });
        });
        return this.success("OK", dirInfos);
    }

    async addProjectOpDir()
    {
        let currentProject = settings.getCurrentProject();
        if (!currentProject) return this.error("Please save your project before adding op directories");
        const opDir = await electronApp.pickOpDirDialog();
        if (opDir)
        {
            currentProject = projectsUtil.addOpDir(currentProject, opDir, true);
            projectsUtil.writeProjectToFile(settings.getCurrentProjectFile(), currentProject);
            return this.success("OK", projectsUtil.getProjectOpDirs(currentProject, true));
        }
        else
        {
            return this.error("no project dir chosen", [], "info");
        }
    }

    async removeProjectOpDir(dirName)
    {
        let currentProject = settings.getCurrentProject();
        if (!currentProject || !dirName) return this.success("OK", projectsUtil.getProjectOpDirs(currentProject, true));
        dirName = path.resolve(dirName);
        currentProject = projectsUtil.removeOpDir(currentProject, dirName);

        projectsUtil.writeProjectToFile(settings.getCurrentProjectFile(), currentProject);
        return this.success("OK", projectsUtil.getProjectOpDirs(currentProject, true));
    }

    saveProjectOpDirOrder(order)
    {
        const currentProject = settings.getCurrentProject();
        const currentProjectFile = settings.getCurrentProjectFile();
        if (!currentProject || !order) return this.error("NO_PROJECT");
        const newOrder = [];
        order.forEach((opDir) =>
        {
            if (fs.existsSync(opDir)) newOrder.push(opDir);
        });
        if (!currentProject.dirs) currentProject.dirs = {};
        if (!currentProject.dirs.ops) currentProject.dirs.ops = [];
        currentProject.dirs.ops = newOrder.filter((dir) => { return !projectsUtil.isFixedPositionOpDir(dir); });
        currentProject.dirs.ops = helper.uniqueArray(currentProject.dirs.ops);
        projectsUtil.writeProjectToFile(currentProjectFile, currentProject);
        return this.success("OK", projectsUtil.getProjectOpDirs(currentProject, true));
    }

    setProjectName(options)
    {
        const oldFile = settings.getCurrentProjectFile();
        let project = settings.getCurrentProject();
        project.name = options.name;
        const newFile = path.join(settings.getCurrentProjectDir(), projectsUtil.getProjectFileName(project));
        project.name = path.basename(newFile);
        project.summary = project.summary || {};
        project.summary.title = project.name;
        fs.renameSync(oldFile, newFile);
        settings.replaceInRecentProjects(oldFile, newFile);
        projectsUtil.writeProjectToFile(newFile, project);
        this.loadProject(newFile);
        electronApp.updateTitle();
        return this.success("OK", { "name": project.name });
    }

    cycleFullscreen()
    {
        electronApp.cycleFullscreen();
    }

    collectAssets()
    {
        const currentProject = settings.getCurrentProject();
        const assetFilenames = projectsUtil.getUsedAssetFilenames(currentProject, true);
        const oldNew = {};
        const projectAssetPath = cables.getAssetPath();
        assetFilenames.forEach((oldFile) =>
        {
            const oldUrl = helper.pathToFileURL(oldFile);
            if (!helper.isLocalAssetPath(oldFile) && !oldNew.hasOwnProperty(oldUrl) && fs.existsSync(oldFile))
            {
                const baseName = path.basename(oldFile);
                const newName = this._findNewAssetFilename(projectAssetPath, baseName);
                const newLocation = path.join(projectAssetPath, newName);
                fs.copyFileSync(oldFile, newLocation);
                oldNew[oldUrl] = path.join(projectsUtil.getAssetPathUrl(currentProject), newName);
            }
        });
        this._log.debug("collectAssets", oldNew);
        return this.success("OK", oldNew);
    }

    collectOps()
    {
        const currentProject = settings.getCurrentProject();
        const movedOps = {};
        const allOpNames = [];
        if (currentProject && currentProject.ops)
        {
            currentProject.ops.forEach((op) =>
            {
                const opName = opsUtil.getOpNameById(op.opId);
                allOpNames.push(opName);
                if (!movedOps.hasOwnProperty(opName))
                {
                    const opPath = opsUtil.getOpAbsolutePath(opName);
                    if (!opPath.startsWith(cables.getOpsPath()))
                    {
                        const targetPath = opsUtil.getOpTargetDir(opName, true);
                        const newOpLocation = path.join(cables.getProjectOpsPath(true), targetPath);
                        if (opPath !== newOpLocation)
                        {
                            fs.cpSync(opPath, newOpLocation, { "recursive": true });
                            movedOps[opName] = newOpLocation;
                        }
                    }
                }
            });
        }
        filesUtil.registerOpChangeListeners(allOpNames, true);
        return this.success("OK", movedOps);
    }

    loadProject(projectFile, newProject = null)
    {
        let project = newProject;
        if (projectFile)
        {
            project = settings.getProjectFromFile(projectFile);
            if (project)
            {
                settings.setProject(projectFile, project);
                doc.getOpDocsInProjectDirs(project);
                // add ops in project dirs to lookup
                filesUtil.registerAssetChangeListeners(project, true);
                if (project.ops)
                {
                    const opNames = [];
                    project.ops.forEach((op) =>
                    {
                        const opName = opsUtil.getOpNameById(op.opId);
                        if (opName)
                        {
                            opNames.push(opName);
                        }
                    });
                    filesUtil.registerOpChangeListeners(opNames);
                }
            }
        }
        else
        {
            settings.setProject(null, null);
            doc.getOpDocsInProjectDirs(project);
        }
        electronApp.updateTitle();
    }

    async addOpDependency(options)
    {
        if (!options.opName || !options.name || !options.type) return this.error("INVALID_DATA");
        let version = "";
        if (options.type === "npm")
        {
            const parts = options.name.split("@");
            if (options.name.startsWith("@"))
            {
                version = parts[2] || "";
                options.name = "@" + parts[1];
            }
            else
            {
                version = parts[1] || "";
            }
        }
        const opName = options.opName;
        const dep = {
            "name": options.name,
            "type": options.type,
            "src": [options.name],
            "version": version
        };
        let opDoc = doc.getDocForOp(opName);
        const opDocFile = opsUtil.getOpAbsoluteJsonFilename(opName);
        if (opDoc && fs.existsSync(opDocFile))
        {
            const deps = opDoc.dependencies || [];
            deps.push(dep);
            opDoc.dependencies = deps;
            opDoc = doc.cleanOpDocData(opDoc);
            jsonfile.writeFileSync(opDocFile, opDoc, { "encoding": "utf-8", "spaces": 4 });
            doc.updateOpDocs();
            const npmResult = await this.installOpDependencies(opName);
            if (npmResult.error)
            {
                // remove deps again on install error
                const newDeps = [];
                opDoc.dependencies.forEach((opDep) =>
                {
                    if (!(options.name === opDep.name && options.type === opDep.type)) newDeps.push(opDep);
                });
                opDoc.dependencies = newDeps;
                jsonfile.writeFileSync(opDocFile, opDoc, { "encoding": "utf-8", "spaces": 4 });
                doc.updateOpDocs();
                await this.installOpDependencies(opName);
            }
            return npmResult;
        }
        else
        {
            return this.error("OP_NOT_FOUND");
        }
    }

    async removeOpDependency(options)
    {
        if (!options.opName || !options.name || !options.type) return this.error("INVALID_DATA");
        const opName = options.opName;
        const opDoc = doc.getDocForOp(opName);
        const opDocFile = opsUtil.getOpAbsoluteJsonFilename(opName);
        if (opDoc && fs.existsSync(opDocFile))
        {
            const newDeps = [];
            const deps = opDoc.dependencies || [];
            deps.forEach((dep) =>
            {
                if (!(dep.name === options.name && dep.type === options.type)) newDeps.push(dep);
            });
            opDoc.dependencies = newDeps;
            if (opDoc.dependencies) jsonfile.writeFileSync(opDocFile, opDoc, { "encoding": "utf-8", "spaces": 4 });
            doc.updateOpDocs();
            return this.installOpDependencies(opName);
        }
        else
        {
            return this.error("OP_NOT_FOUND");
        }
    }

    async createFile(data)
    {
        data.fileName = data.name;
        data.content = "this is an empty file...";
        return this.updateFile(data);
    }

    async exportPatch()
    {
        const service = new StandaloneZipExport(utilProvider);

        const exportPromise = promisify(service.doExport.bind(service));

        try
        {
            const result = await exportPromise(null);
            return this.success("OK", result);
        }
        catch (e)
        {
            return this.error("ERROR", e);
        }
    }

    success(msg, data, raw = false)
    {
        if (raw)
        {
            if (data && typeof data === "object") data.success = true;
            return data;
        }
        else
        {
            return { "success": true, "msg": msg, "data": data };
        }
    }

    error(msg, data = null, level = "error")
    {
        const error = { "error": true, "msg": msg, "level": level };
        if (data) error.data = data;
        return error;
    }

    _getFullRenameResponse(opDocs, newName, oldName, currentUser, ignoreVersionGap = false, fromRename = false, targetDir = false)
    {
        let opNamespace = opsUtil.getNamespace(newName);
        let availableNamespaces = ["Ops."];
        if (fromRename) availableNamespaces.unshift(opNamespace);
        availableNamespaces = helper.uniqueArray(availableNamespaces);
        if (opNamespace && !opsUtil.isPatchOp(opNamespace) && !availableNamespaces.includes(opNamespace)) availableNamespaces.unshift(opNamespace);

        let removeOld = newName && !(opsUtil.isExtensionOp(newName) && opsUtil.isCoreOp(newName));
        const result = {
            "namespaces": availableNamespaces,
            "problems": [],
            "consequences": [],
            "action": removeOld ? "Rename" : "Copy"
        };

        if (!newName)
        {
            result.problems.push("No name for new op given.");
            return result;
        }

        const problems = opsUtil.getOpRenameProblems(newName, oldName, currentUser, [], null, null, [], true, targetDir);
        const hints = {};
        const consequences = opsUtil.getOpRenameConsequences(newName, oldName, targetDir);

        const newNamespace = opsUtil.getNamespace(newName);
        const existingNamespace = opsUtil.namespaceExists(newNamespace, opDocs);
        if (!existingNamespace)
        {
            hints.new_namespace = "Renaming will create a new namespace " + newNamespace;
        }

        let newOpDocs = opDocs;
        if (!opsUtil.isCoreOp(newName)) newOpDocs = doc.getCollectionOpDocs(newName, currentUser);

        const nextOpName = opsUtil.getNextVersionOpName(newName, newOpDocs);
        const nextShort = opsUtil.getOpShortName(nextOpName);
        let nextVersion = null;
        let suggestVersion = false;

        if (problems.target_exists)
        {
            suggestVersion = true;
        }

        if (!ignoreVersionGap)
        {
            const wantedVersion = opsUtil.getVersionFromOpName(newName);
            const currentHighest = opsUtil.getHighestVersionNumber(newName, newOpDocs);

            const versionTolerance = currentHighest ? 1 : 2;
            if ((wantedVersion - versionTolerance) > currentHighest)
            {
                hints.version_gap = "Gap in version numbers!";
                suggestVersion = true;
            }
        }

        if (problems.illegal_ops || problems.illegal_references)
        {
            suggestVersion = false;
        }

        if (!fromRename && oldName)
        {
            const hierarchyProblem = opsUtil.getNamespaceHierarchyProblem(oldName, newName);
            if (hierarchyProblem)
            {
                problems.bad_op_hierarchy = hierarchyProblem;
                suggestVersion = false;
            }
        }

        if (suggestVersion)
        {
            const text = "Try creating a new version <a class='button-small versionSuggestion' data-short-name='" + nextShort + "'>" + nextOpName + "</a>";
            nextVersion = {
                "fullName": nextOpName,
                "namespace": opsUtil.getNamespace(nextOpName),
                "shortName": nextShort
            };
            if (problems.target_exists)
            {
                problems.version_suggestion = text;
            }
            else
            {
                hints.version_suggestion = text;
            }
        }

        result.problems = Object.values(problems);
        result.hints = Object.values(hints);
        result.consequences = Object.values(consequences);
        if (nextVersion) result.nextVersion = nextVersion;
        return result;
    }

    _findNewAssetFilename(targetDir, fileName)
    {
        let fileInfo = path.parse(fileName);
        let newName = fileName;
        let counter = 1;
        while (fs.existsSync(path.join(targetDir, newName)))
        {
            newName = path.format({ "name": fileInfo.name + "_" + counter, "ext": fileInfo.ext });
            counter++;
        }
        return newName;
    }
}

export default new ElectronApi();
