// eslint-disable-next-line import/no-extraneous-dependencies
import { app, ipcMain, net, shell } from "electron";
import fs from "fs";
import path from "path";
import mkdirp from "mkdirp";
import { promisify } from "util";

import jsonfile from "jsonfile";
import sanitizeFileName from "sanitize-filename";
import { utilProvider } from "cables-shared-api";
import { createRequire } from "module";
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
import HtmlExportElectron from "../export/export_html_electron.js";
import PatchExportElectron from "../export/export_patch_electron.js";

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
            settings.data.openFullscreen = electronApp.openFullscreen();
            settings.data.maximizeRenderer = electronApp.maximizeRenderer();
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

        ipcMain.on("getOpModuleLocation", (event, data) =>
        {
            let opName = opsUtil.getOpNameById(data.opId);
            if (!opName) opName = data.opName;
            const opDir = opsUtil.getOpAbsolutePath(opName);
            const moduleDir = path.join(opDir, "node_modules");
            const moduleRequire = createRequire(moduleDir);
            if (moduleRequire)
            {
                try
                {
                    let location = moduleRequire.resolve(data.moduleName);
                    if (data.asUrl) location = helper.pathToFileURL(location);
                    event.returnValue = location;
                }
                catch (e)
                {
                    this._log.error(data.moduleName + " " + moduleDir);
                    event.returnValue = null;
                }
            }
            else
            {
                event.returnValue = null;
            }
        });

        ipcMain.on("getOpModules", (event, data) =>
        {
            let deps = [];
            if (!data.opName) return [];
            const opName = data.opName;
            const opDocFile = opsUtil.getOpAbsoluteJsonFilename(opName);
            if (fs.existsSync(opDocFile))
            {
                let opDoc = jsonfile.readFileSync(opDocFile);
                if (opDoc)
                {
                    deps = opDoc.dependencies || [];
                }
            }
            event.returnValue = deps.filter((dep) => { return dep.type === "npm"; }).map((dep) => { return dep.src[0]; });
        });
    }

    async talkerMessage(cmd, data, topicConfig = {})
    {
        let response = null;
        if (!cmd) return this.error("UNKNOWN_COMMAND", null, "warn");
        if (typeof this[cmd] === "function")
        {
            if (topicConfig.needsProjectFile)
            {
                const projectFile = settings.getCurrentProjectFile();
                if (!projectFile)
                {
                    const newName = data ? data.name : projectsUtil.getNewProjectName();
                    const newProjectFile = await electronApp.saveProjectFileDialog(newName);
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
                        return this.error("CANCELLED", null, "info");
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
        const opName = opsUtil.getOpNameById(data.opName) || data.opName;

        let warns = [];
        try
        {
            const currentProject = settings.getCurrentProject();
            if (currentProject)
            {
                let opDocs = projectsUtil.getOpDocsInProjectDirs(currentProject);
                opDocs = opDocs.filter((opDoc) => { return opDoc.name === opName; });
                opDocs.forEach((opDoc) =>
                {
                    if (opDoc.overrides)
                    {
                        opDoc.overrides.forEach((override) =>
                        {
                            warns.push({
                                "type": "project",
                                "id": "",
                                "text": "<a onclick=\"CABLESUILOADER.talkerAPI.send('openDir', { 'dir': '" + override + "'});\"><span class=\"icon icon-folder\"></span> this op overrides another op</a>"
                            });
                        });
                    }
                });
            }

            warns = warns.concat(opsUtil.getOpCodeWarnings(opName));

            if (opsUtil.isOpNameValid(opName))
            {
                const result = { "warns": warns };
                result.attachmentFiles = opsUtil.getAttachmentFiles(opName);

                const opDocs = doc.getDocForOp(opName);
                let changelogEntries = [];
                if (opDocs && opDocs.changelog)
                {
                    // copy array to not modify reference
                    changelogEntries = changelogEntries.concat(opDocs.changelog);
                    if (data.sort === "asc")
                    {
                        changelogEntries.sort((a, b) => { return a.date - b.date; });
                    }
                    else
                    {
                        changelogEntries.sort((a, b) => { return b.date - a.date; });
                    }
                    const numChangelogEntries = data.cl || 5;
                    result.changelog = changelogEntries.slice(0, numChangelogEntries);
                }
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
            this._log.warn("error when getting opinfo", opName, e.message);
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
            return this.error("no backup file chosen", null, "info");
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
        let saveAs = data.filename;
        if (!path.isAbsolute(data.filename)) saveAs = path.join(target, path.join("/", data.filename));
        const buffer = Buffer.from(data.fileStr.split(",")[1], "base64");
        fs.writeFileSync(saveAs, buffer);
        return this.success("OK", { "filename": path.basename(saveAs) }, true);
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
        const otherDirsOps = projectsUtil.getOpDocsInProjectDirs(project, true, true).map((opDoc) => { return opDoc.name; });
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
        const coreOpDocs = doc.getOpDocs();
        projectOps.forEach((opName) =>
        {
            let opDoc = doc.getDocForOp(opName, coreOpDocs);
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

        opDocs = opsUtil.addPermissionsToOps(opDocs, currentUser, [], project);
        opDocs = opsUtil.addVersionInfoToOps(opDocs);

        opDocs = doc.makeReadable(opDocs);
        return this.success("OK", opDocs, true);
    }

    async getOpDocsAll()
    {
        const currentUser = settings.getCurrentUser();
        const currentProject = settings.getCurrentProject();
        let opDocs = doc.getOpDocs(true, true);
        opDocs = opDocs.concat(doc.getCollectionOpDocs("Ops.Extension.Standalone", currentUser));
        opDocs = opDocs.concat(projectsUtil.getOpDocsInProjectDirs(currentProject, true, true));
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
            const currentProject = settings.getCurrentProject();
            const projectOps = projectsUtil.getOpDocsInProjectDirs(currentProject);
            const projectOp = projectOps.find((op) => { return op.name === opName; });
            if (projectOp)
            {
                opDocs.push(projectOp);
            }
            else
            {
                opDocs.push(opDoc);
            }
            if (opDoc.dependencies)
            {
                const opPackages = opsUtil.getOpNpmPackages(opName);
                const packageDir = opsUtil.getOpAbsolutePath(opName);
                result.dependenciesOutput = await electronApp.installPackages(packageDir, opPackages, opName);
            }
            result.opDocs = doc.makeReadable(opDocs);
            result.opDocs = opsUtil.addVersionInfoToOps(opDocs);
            result.opDocs = opsUtil.addPermissionsToOps(result.opDocs, null);
            return this.success("OK", result, true);
        }
        else
        {
            let text = "Could not find op with id " + data + " in:";
            const footer = "Try adding other directories via 'Manage Op Directories' after loading the patch.";
            const reasons = [];

            const errorVars = {
                "text": text,
                "footer": footer,
                "reasons": reasons,
                "hideEnvButton": true,
            };

            const currentProject = settings.getCurrentProject();
            const projectOpDirs = projectsUtil.getProjectOpDirs(currentProject, true);
            projectOpDirs.forEach((projectOpDir) =>
            {
                const link = "<a onclick=\"CABLESUILOADER.talkerAPI.send('openDir', { 'dir': '" + projectOpDir + "'});\"><span class=\"icon icon-folder\"></span> " + projectOpDir + "</a>";
                reasons.push(link);
            });

            if (net.isOnline())
            {
                const getOpEnvironmentDocs = promisify(opsUtil.getOpEnvironmentDocs.bind(opsUtil));
                try
                {
                    const envDocs = await getOpEnvironmentDocs(data);
                    if (envDocs && envDocs.environments && envDocs.environments.length > 0)
                    {
                        const otherEnvName = envDocs.environments[0];
                        errorVars.editorLink = "https://" + otherEnvName + "/op/" + envDocs.name;
                        errorVars.otherEnvButton = "Visit " + otherEnvName;

                        text = "Could not find <a href=\"" + errorVars.editorLink + "\" target=\"_blank\">" + envDocs.name + "</a> in:";

                        envDocs.environments.forEach((envName) =>
                        {
                            const opLink = "https://" + envName + "/op/" + envDocs.name;
                            reasons.push("Found <a href=\"" + opLink + "\" target=\"_blank\">" + envDocs.name + "</a> on " + envName);
                        });
                    }
                    errorVars.text = text;
                    errorVars.reasons = reasons;
                    errorVars.hideEnvButton = false;
                }
                catch (e)
                { // something went wrong, no internet or something, this is informational anyhow}
                }
            }

            return this.error("OP_NOT_FOUND", errorVars, "warn");
        }
    }

    saveOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opname);
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
            filesUtil.registerOpChangeListeners([opName]);
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
                "updated": null,
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
        const fileDb = filesUtil.getFileDb(filePath, settings.getCurrentProject(), settings.getCurrentUser(), new Date().getTime());
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
        const newName = encodeURIComponent(data.v);
        const sourceName = data.sourceName || null;
        const currentUser = settings.getCurrentUser();
        const project = settings.getCurrentProject();
        const fromRename = data.rename;
        const result = this._getFullRenameResponse(opDocs, newName, sourceName, currentUser, project, true, fromRename, data.opTargetDir);
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

    async opCreate(data)
    {
        let opName = data.opname;
        const currentUser = settings.getCurrentUser();
        const opDocDefaults = {
            "layout": data.layout,
            "libs": data.libs,
            "coreLibs": data.coreLibs
        };
        let targetDir = data.opTargetDir;
        const projectOpDirs = projectsUtil.getOpDirs(settings.getCurrentProject());
        if (projectOpDirs && projectOpDirs.length > 0)
        {
            targetDir = projectOpDirs[0].dir;
        }
        const result = opsUtil.createOp(opName, currentUser, data.code, opDocDefaults, data.attachments, targetDir);
        filesUtil.registerOpChangeListeners([opName]);
        projectsUtil.invalidateProjectCaches();

        return this.success("OK", result, true);
    }

    opUpdate(data)
    {
        let opName = data.opname;
        if (opsUtil.isOpId(data.opname)) opName = opsUtil.getOpNameById(data.opname);
        const currentUser = settings.getCurrentUser();
        const result = opsUtil.updateOp(currentUser, opName, data.update, { "formatCode": data.formatCode });
        return this.success("OK", { "data": result }, true);
    }

    opSaveLayout(data)
    {
        const layout = data.layout;
        const opName = opsUtil.getOpNameById(data.opname) || layout.name;
        return this.success("OK", opsUtil.saveLayout(opName, layout), true);
    }

    opSetSummary(data)
    {
        const opName = opsUtil.getOpNameById(data.opId) || data.name;
        let summary = data.summary || "";
        if (summary === "No Summary") summary = "";
        const opDocFile = opsUtil.getOpAbsoluteJsonFilename(opName);
        if (fs.existsSync(opDocFile))
        {
            let opDoc = jsonfile.readFileSync(opDocFile);
            if (opDoc)
            {
                opDoc.summary = summary;
                opDoc = doc.cleanOpDocData(opDoc);
                jsonfile.writeFileSync(opDocFile, opDoc, {
                    "encoding": "utf-8",
                    "spaces": 4
                });
                doc.updateOpDocs();
            }
            return this.success("OK", opDoc, true);
        }
        else
        {
            return this.error("UNKNOWN_OP", null, "error");
        }
    }

    opClone(data)
    {
        const newName = data.name;
        const oldName = opsUtil.getOpNameById(data.opname) || data.opname;
        const currentUser = settings.getCurrentUser();
        const cloned = opsUtil.cloneOp(oldName, newName, currentUser, data.opTargetDir);
        projectsUtil.invalidateProjectCaches();
        return this.success("OK", cloned, true);
    }

    opRename(data)
    {
        projectsUtil.invalidateProjectCaches();

        const oldId = data.opname;
        const newName = data.name;
        const oldName = opsUtil.getOpNameById(oldId);

        const currentUser = settings.getCurrentUser();
        const currentProject = settings.getCurrentProject();
        let opNamespace = opsUtil.getNamespace(newName);

        const opDocs = doc.getOpDocs(false, false);
        const renameResults = this._getFullRenameResponse(opDocs, newName, oldName, currentUser, currentProject, opsUtil.isPrivateOp(newName), true);
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

        let renameSuccess = false;
        if (opsUtil.isUserOp(newName))
        {
            renameSuccess = opsUtil.renameToUserOp(oldName, newName, currentUser);
        }
        else if (opsUtil.isTeamOp(newName))
        {
            renameSuccess = opsUtil.renameToTeamOp(oldName, newName, currentUser);
        }
        else if (opsUtil.isExtensionOp(newName))
        {
            renameSuccess = opsUtil.renameToExtensionOp(oldName, newName, currentUser);
        }
        else if (opsUtil.isPatchOp(newName))
        {
            renameSuccess = opsUtil.renameToPatchOp(oldName, newName, currentUser, false);
        }
        else
        {
            renameSuccess = opsUtil.renameToCoreOp(oldName, newName, currentUser);
        }

        projectsUtil.invalidateProjectCaches();

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

    opDelete(data)
    {
        const opName = opsUtil.getOpNameById(data.opId) || data.opName;
        opsUtil.deleteOp(opName);
        return this.success("OP_DELETED", { "opNames": [opName] });
    }

    async _installOpDependencies(opName)
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
                    return this.error("NPM_ERROR", npmResults, "error");
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
            if (npmResults.some((result) => { return result.error; }))
            {
                return this.error("NPM_ERROR", npmResults, "error");
            }
            else
            {
                return this.success("OK", npmResults);
            }
        }
    }

    async addOpPackage(data)
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        const targetDir = data.targetDir || currentProjectDir;
        const npmResults = await electronApp.addOpPackage(targetDir, data.package);
        return this.success("OK", npmResults);
    }

    async openDir(options = {})
    {
        await shell.openPath(options.dir || app.getPath("home"));
        return this.success("OK", {}, true);
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

    async openFileManager(data)
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
        if (data)
        {
            let pickedFileUrl = null;
            if (data.url)
            {
                let assetUrl = helper.fileURLToPath(data.url, true);
                let filter = ["*"];
                if (data.filter)
                {
                    filter = filesUtil.FILETYPES[data.filter] || ["*"];
                }
                pickedFileUrl = await electronApp.pickFileDialog(assetUrl, true, filter);
            }
            else
            {
                let file = data.dir;
                pickedFileUrl = await electronApp.pickFileDialog(file);
            }
            pickedFileUrl = helper.pathToFileURL(pickedFileUrl);
            return this.success("OK", pickedFileUrl, true);
        }
        else
        {
            return this.error("NO_FILE_SELECTED", null, "info");
        }
    }

    async selectDir(data)
    {
        const pickedFileUrl = await electronApp.pickDirDialog(data.dir);
        return this.success("OK", pickedFileUrl, true);
    }

    checkNumAssetPatches()
    {
        return this.success("OK", { "assets": [], "countPatches": 0, "countOps": 0 }, true);
    }

    async saveProjectAs(data)
    {
        const projectFile = await electronApp.saveProjectFileDialog(data.name);
        if (!projectFile)
        {
            return this.error("no project dir chosen", null, "info");
        }

        let collaborators = [];
        let usersReadOnly = [];

        const currentUser = settings.getCurrentUser();
        const origProject = settings.getCurrentProject() || projectsUtil.generateNewProject(currentUser);
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
        let patch = {};
        if (data.dataB64) patch.dataB64 = data.dataB64;
        projectsUtil.writeProjectToFile(projectFile, origProject, patch);
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

        const newPath = helper.fileURLToPath(data.fileName, true);
        if (!fs.existsSync(newPath)) mkdirp.sync(newPath);
        try
        {
            if (fs.existsSync(newPath))
            {
                this._log.info("delete old file ", newPath);
                fs.unlinkSync(newPath);
            }
        }
        catch (e) {}

        this._log.info("edit file", newPath);

        fs.writeFileSync(newPath, data.content);
        return this.success("OK", { "filename": newPath }, true);
    }

    getProjectOpDirs()
    {
        const currentProject = settings.getCurrentProject();
        const dirInfos = projectsUtil.getOpDirs(currentProject);

        const opDirs = {};
        if (currentProject && currentProject.ops)
        {
            currentProject.ops.forEach((op) =>
            {
                const opName = opsUtil.getOpNameById(op.opId);
                const opPath = opsUtil.getOpAbsolutePath(opName);
                if (opPath)
                {
                    if (!opDirs.hasOwnProperty(opPath)) opDirs[opPath] = 0;
                    opDirs[opPath]++;
                }
            });
        }

        dirInfos.forEach((dirInfo) =>
        {
            if (!dirInfo.hasOwnProperty("numUsedOps")) dirInfo.numUsedOps = 0;
            for (const opDir in opDirs)
            {
                const count = opDirs[opDir];
                if (opDir.startsWith(dirInfo.dir))
                {
                    dirInfo.numUsedOps += count;
                }
            }
        });

        return this.success("OK", dirInfos);
    }

    async addProjectOpDir()
    {
        let currentProject = settings.getCurrentProject();
        if (!currentProject) return this.error("Please save your project before adding op directories", null, "warn");
        const opDir = await electronApp.pickOpDirDialog();
        if (opDir)
        {
            currentProject = projectsUtil.addOpDir(currentProject, opDir, true);
            projectsUtil.writeProjectToFile(settings.getCurrentProjectFile(), currentProject);
        }
        return this.success("OK", projectsUtil.getProjectOpDirs(currentProject, true));
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
        let currentProject = settings.getCurrentProject();
        if (!currentProject || !order) return this.error("NO_PROJECT", null, "warn");
        currentProject = projectsUtil.reorderOpDirs(currentProject, order);
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
        const summary = projectsUtil.getSummary(settings.getCurrentProject());
        electronApp.updateTitle();
        return this.success("OK", { "name": project.name, "summary": summary });
    }

    cycleFullscreen()
    {
        electronApp.cycleFullscreen();
    }

    collectAssets()
    {
        const currentProject = settings.getCurrentProject();
        const assetPorts = projectsUtil.getProjectAssetPorts(currentProject, true);

        const oldNew = {};
        let projectAssetPath = cables.getAssetPath();
        projectAssetPath = path.join(projectAssetPath, "assets");
        if (!fs.existsSync(projectAssetPath)) mkdirp.sync(projectAssetPath);
        assetPorts.forEach((assetPort) =>
        {
            const portValue = assetPort.value;
            let oldFile = helper.fileURLToPath(portValue, true);
            if (!helper.isLocalAssetPath(oldFile) && !oldNew.hasOwnProperty(portValue) && fs.existsSync(oldFile))
            {
                const baseName = path.basename(oldFile);
                const newName = projectsUtil.findNewAssetFilename(projectAssetPath, baseName);
                const newLocation = path.join(projectAssetPath, newName);
                fs.copyFileSync(oldFile, newLocation);
                // cant use path.join here since we need to keep the ./
                oldNew[assetPort.value] = projectsUtil.getAssetPathUrl(currentProject._id) + newName;
            }
        });
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

    loadProject(projectFile, newProject = null, rebuildCache = true)
    {
        let project = newProject;
        if (projectFile)
        {
            project = settings.getProjectFromFile(projectFile);
            if (project)
            {
                settings.setProject(projectFile, project);
                if (rebuildCache) projectsUtil.invalidateProjectCaches();
                // add ops in project dirs to lookup
                projectsUtil.getOpDocsInProjectDirs(project, false, false, true);
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
            projectsUtil.getOpDocsInProjectDirs(project);
        }
        electronApp.updateTitle();
    }

    async addOpDependency(options)
    {
        if (!options.opName || !options.type) return this.error("INVALID_DATA");

        const opName = options.opName;
        const dep = this._getOpDepFromRequest({ "body": options });
        const added = opsUtil.addOpDependency(opName, dep);
        if (added)
        {
            this._log.info("added dependency!", opName, dep.src);
            doc.updateOpDocs(opName);
            return await this._installOpDependencies(opName);
        }
        else
        {
            return this.error("FAILED_TO_ADD_DEPENDENCY");
        }
    }

    async removeOpDependency(options)
    {
        if (!options.opName || !options.type) return this.error("INVALID_DATA");
        const opName = options.opName;
        const opDocFile = opsUtil.getOpAbsoluteJsonFilename(opName);
        if (fs.existsSync(opDocFile))
        {
            let opDoc = jsonfile.readFileSync(opDocFile);
            if (opDoc)
            {
                const newDeps = [];
                const deps = opDoc.dependencies || [];
                deps.forEach((dep) =>
                {
                    if (dep.src !== options.src) newDeps.push(dep);
                });
                opDoc.dependencies = newDeps;
                const libPath = path.join(opsUtil.getOpAbsolutePath(opName), options.src);
                if (fs.existsSync(libPath)) fs.unlinkSync(libPath);
                if (opDoc.dependencies) jsonfile.writeFileSync(opDocFile, opDoc, opsUtil.OPJSON_FORMAT);
                doc.updateOpDocs();
                this._installOpDependencies(opName);
                return this.success("OK");
            }
            else
            {
                return this.error("OP_NOT_FOUND");
            }
        }
        else
        {
            return this.error("OP_NOT_FOUND");
        }
    }

    async createFile(data)
    {
        let file = data.name;
        let pickedFileUrl = await electronApp.saveFileDialog(file);
        if (pickedFileUrl)
        {
            fs.writeFileSync(pickedFileUrl, "");
            return this.success("OK", pickedFileUrl, true);
        }
        else
        {
            return this.success("NO_DIR_CHOSEN", null, true);
        }
    }

    async exportPatch()
    {
        const service = new HtmlExportElectron(utilProvider);

        const exportPromise = promisify(service.doExport.bind(service));

        try
        {
            const result = await exportPromise(settings.getCurrentProject());
            return this.success("OK", result);
        }
        catch (e)
        {
            return this.error("ERROR", e);
        }
    }

    async exportPatchBundle()
    {
        const service = new PatchExportElectron(utilProvider);

        const exportPromise = promisify(service.doExport.bind(service));

        try
        {
            const result = await exportPromise(settings.getCurrentProject());
            return this.success("OK", result);
        }
        catch (e)
        {
            return this.error("ERROR", e);
        }
    }

    async uploadFileToOp(params)
    {
        const fileName = params.filename;
        const opId = params.opId;
        const dataUrl = params.fileStr;

        const opName = opsUtil.getOpNameById(opId);

        if (fileName && opId && dataUrl && opName)
        {
            let data = atob(dataUrl.split(",")[1]);
            let buffer = Buffer.from(data);

            const newFileName = opsUtil.addOpDependencyFile(opName, fileName, buffer);
            if (newFileName)
            {
                this._log.info("added op file!", opName, newFileName);
                doc.updateOpDocs(opName);
                return this.success("OK", { "filename": newFileName }, true);
            }
            else
            {
                return this.error("FAILED_TO_ADD_DEPENDENCY");
            }
        }
        else
        {
            return this.error("ERROR", { "fileName": fileName, "opId": opId, "opName": opName });
        }
    }

    errorReport(report)
    {
        try
        {
            const communityUrl = cables.getCommunityUrl();
            if (cables.sendErrorReports() && communityUrl)
            {
                try
                {
                    const errorReportSend = net.request({
                        "url": path.join(communityUrl, "/api/errorReport"),
                        "method": "POST",
                    });
                    delete report.url;
                    delete report.file;
                    if (report.log)
                    {
                        report.log.forEach((log) =>
                        {
                            if (log.errorStack)
                            {
                                log.errorStack.forEach((stack) =>
                                {
                                    if (stack.fileName)
                                    {
                                        stack.fileName = path.basename(stack.fileName);
                                    }
                                    if (stack.source)
                                    {
                                        delete stack.source;
                                    }
                                });
                            }
                        });
                    }
                    report.username = "electron";
                    errorReportSend.setHeader("Content-Type", "application/json");
                    errorReportSend.write(JSON.stringify(report), "utf-8");
                    errorReportSend.end();
                }
                catch (e)
                {
                    this._log.debug("failed to send error report", e);
                }
            }
        }
        catch (e)
        {
            this._log.info("failed to parse error report", e);
        }
        this.success("OK");
    }

    success(msg, data = null, raw = false)
    {
        if (raw)
        {
            if (data && typeof data === "object") data.success = true;
            return data;
        }
        else
        {
            return { "success": true, "msg": msg, "data": data || {} };
        }
    }

    error(msg, data = null, level = "warn")
    {
        const error = { "error": true, "msg": msg, "level": level };
        if (data) error.data = data;
        return error;
    }

    _getFullRenameResponse(opDocs, newName, oldName, currentUser, project = null, ignoreVersionGap = false, fromRename = false, targetDir = false)
    {
        let opNamespace = opsUtil.getNamespace(newName, true);
        let oldOpNamespace = opsUtil.getNamespace(oldName, true);

        let availableNamespaces = [];

        if (project)
        {
            const projectOpDocs = projectsUtil.getOpDocsInProjectDirs(project);
            availableNamespaces = projectOpDocs.map((opDoc) => { return opsUtil.getNamespace(opDoc.name, true); });
        }

        availableNamespaces = availableNamespaces.map((availableNamespace) => { return availableNamespace.endsWith(".") ? availableNamespace : availableNamespace + "."; });
        availableNamespaces = helper.uniqueArray(availableNamespaces);
        availableNamespaces = availableNamespaces.sort((a, b) => { return a.localeCompare(b); });
        if (opNamespace && !availableNamespaces.includes(opNamespace)) availableNamespaces.unshift(opNamespace);
        if (oldOpNamespace && !availableNamespaces.includes(oldOpNamespace)) availableNamespaces.unshift(oldOpNamespace);

        availableNamespaces = availableNamespaces.filter((availableNamespace) => { return availableNamespace.startsWith(opsUtil.PREFIX_OPS); });

        let suggestedNamespaces = [...availableNamespaces];
        if (project)
        {
            suggestedNamespaces.unshift(opsUtil.getPatchOpsNamespaceForProject(project));
        }
        suggestedNamespaces.unshift("Your namespaces..");
        suggestedNamespaces = suggestedNamespaces.map((suggestedNamespace) => { return opsUtil.getNamespace(suggestedNamespace, true); });
        suggestedNamespaces = helper.uniqueArray(suggestedNamespaces);

        const result = {
            "namespaces": suggestedNamespaces,
            "problems": [],
            "consequences": [],
            "action": "Rename"
        };

        if (!newName)
        {
            result.problems.push("No name for new op given.");
            return result;
        }

        if (fromRename) targetDir = opsUtil.getOpSourceDir(oldName);
        const problems = opsUtil.getOpRenameProblems(newName, oldName, currentUser, [], null, null, [], true, targetDir);
        const hints = {};
        const consequences = opsUtil.getOpRenameConsequences(newName, oldName, targetDir);

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

        if (problems.illegal_ops)
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
            const text = "Try creating a new version <a class='button-small versionSuggestion' data-short-name='" + nextShort + "' data-next-name='" + nextOpName + "'>" + nextOpName + "</a>";
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

    _getOpDepFromRequest(req)
    {
        const validTypes = ["commonjs", "module", "npm", "op", "lib", "corelib"];
        const data = req.body;
        const dep = {};
        if (data.src) dep.src = data.src.trim();
        if (data.type && validTypes.includes(data.type.trim())) dep.type = data.type.trim();
        if (data.export && dep.type === "module") dep.export = data.export.trim();
        return dep;
    }
}

export default new ElectronApi();
