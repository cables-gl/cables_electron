import { ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import marked from "marked";
import jsonfile from "jsonfile";
import crypto from "crypto";
import pako from "pako";
import mkdirp from "mkdirp";

import sanitizeFileName from "sanitize-filename";
import { fileURLToPath } from "url";
import { execaSync } from "execa";
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
            return this.talkerMessage(cmd, data, topicConfig);
        });

        ipcMain.on("settings", (event, cmd, data) =>
        {
            event.returnValue = settings.data;
        });
    }

    async talkerMessage(cmd, data, topicConfig = {})
    {
        let response = null;
        if (!cmd) return null;
        if (typeof this[cmd] === "function")
        {
            if (topicConfig && topicConfig.needsProjectDir)
            {
                if (topicConfig.needsProjectDir)
                {
                    if (!settings.getCurrentProjectDir())
                    {
                        const projectDir = await electronApp.pickProjectDirDialog();
                        if (projectDir)
                        {
                            logger.debug("setting new project dir to", projectDir);
                            settings.setCurrentProjectDir(projectDir);
                        }
                        else
                        {
                            logger.error("no project dir chosen");
                            return null;
                        }
                    }
                }
                if (topicConfig.needsProjectFile)
                {
                    if (!settings.getProjectFile())
                    {
                        const currentProject = settings.getCurrentProject();
                        settings.getCurrentProjectDir();
                        const projectFileName = sanitizeFileName(currentProject.name).replace(/ /g, "_") + ".cables.json";
                        const newProjectFile = path.join(settings.getCurrentProjectDir(), projectFileName);
                        logger.debug("new projectfile", settings.getCurrentProjectDir(), projectFileName, newProjectFile);
                        settings.setProjectFile(newProjectFile);
                        jsonfile.writeFileSync(newProjectFile, currentProject, { "encoding": "utf-8", "spaces": 4 });
                    }
                }
                return this[cmd](data);
            }
            else
            {
                return this[cmd](data);
            }
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

    async savePatch(patch)
    {
        const currentProject = settings.getCurrentProject();
        const re = {
            "success": true,
            "msg": "PROJECT_SAVED"
        };
        this._writeProjectToFile(currentProject, patch);
        re.updated = currentProject.updated;
        re.updatedByUser = currentProject.updatedByUser;
        return re;
    }

    getPatch(data)
    {
        const patchPath = settings.getProjectFile();
        const currentUser = settings.getCurrentUser();
        if (patchPath && fs.existsSync(patchPath))
        {
            let patch = fs.readFileSync(patchPath);
            patch = JSON.parse(patch.toString("utf-8"));
            if (!patch.hasOwnProperty("userList")) patch.userList = [currentUser];
            if (!patch.hasOwnProperty("teams")) patch.teams = [];
            return patch;
        }
        else
        {
            let currentProject = settings.getCurrentProject();
            if (!currentProject)
            {
                const newProject = projectsUtil.generateNewProject(settings.getCurrentUser());
                settings.setCurrentProject(patchPath, newProject);
                currentProject = newProject;
            }
            return currentProject;
        }
    }

    async newPatch()
    {
        const project = projectsUtil.generateNewProject(settings.getCurrentUser());
        const newFile = path.join(settings.getCurrentProjectDir(), project._id + ".json");
        fs.writeFileSync(newFile, JSON.stringify(project));
        settings.setProjectFile(newFile);
        return project;
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
        const currentUser = settings.getCurrentUser();
        const project = settings.getCurrentProject();

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

        // now we should have all the ops that are used in the project, walk subPatchOps
        // recursively to get their opdocs
        const subPatchOps = subPatchOpUtil.getOpsUsedInSubPatches(project);
        subPatchOps.forEach((bpOp) =>
        {
            const opName = opsUtil.getOpNameById(subPatchOps.opId);
            const nsName = opsUtil.getCollectionNamespace(opName);
            projectOps.push(opName);
            if (opsUtil.isCollection(nsName)) projectNamespaces.push(nsName);
            usedOpIds.push(subPatchOps.opId);
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
        let opDocs = doc.getOpDocs(true, true);
        opDocs = opDocs.concat(doc.getOpDocsInProjectDir());

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
            if (coreFilename.endsWith(".js"))
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
        const opName = opsUtil.getOpNameById(data.op.opId || data.op.id);
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

    getBuildInfo()
    {
        return settings.getBuildInfo();
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
            settings.setUserSettings(data.settings);
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

    getChangelog(data)
    {
        const obj = {};
        obj.items = [];
        obj.ts = Date.now();
        return obj;
    }

    opAttachmentSave(data)
    {
        let opName = data.opname;
        if (opsUtil.isOpId(data.opname)) opName = opsUtil.getOpNameById(data.opname);
        const result = opsUtil.updateAttachment(opName, data.name, data.content, false);
        return true;
    }

    setIconSaved()
    {
        let title = electronApp.editorWindow.getTitle();
        const pos = title.lastIndexOf(" *");
        let newTitle = title;
        if (pos !== -1) newTitle = title.substring(0, pos);
        electronApp.editorWindow.setDocumentEdited(false);
        electronApp.editorWindow.setTitle(newTitle);
    }

    setIconUnsaved()
    {
        const title = electronApp.editorWindow.getTitle();
        electronApp.editorWindow.setDocumentEdited(true);
        electronApp.editorWindow.setTitle(title + " *");
    }

    saveScreenshot(data)
    {
        const currentProject = settings.getCurrentProject();
        if (!currentProject || !data || !data.screenshot)
        {
            return;
        }
        return projectsUtil.saveProjectScreenshot(currentProject, data.screenshot);
    }

    getFilelist(data)
    {
        let files;
        switch (data.source)
        {
        case "patch":
            files = this._getPatchFiles();
            break;
        case "lib":
            files = this._getLibraryFiles();
            break;
        default:
            files = [];
            break;
        }
        return files;
    }

    getFileDetails(data)
    {
        let filePath = data.filename.replace("file://", "").replace("file:", "");
        if (!filePath.startsWith(cables.getAssetPath())) filePath = path.join(cables.getAssetPath(), filePath);
        const fileDb = filesUtil.getFileDb(filePath, settings.getCurrentProject(), settings.getCurrentUser());
        return filesUtil.getFileInfo(fileDb);
    }

    checkOpName(data)
    {
        const opDocs = doc.getOpDocs(false, false);
        const newName = data.namespace + data.v;
        const sourceName = data.sourceName || null;
        const currentUser = settings.getCurrentUser();
        const result = this._getFullRenameResponse(opDocs, newName, sourceName, currentUser, true, false);
        result.checkedName = newName;
        return result;
    }

    _getPatchFiles()
    {
        const p = cables.getAssetPath();
        return this._readAssetDir(0, p, p, "file://" + p);
    }

    _getLibraryFiles()
    {
        const p = cables.getAssetLibraryPath();
        return this._readAssetDir(0, p, p, "file://" + p);
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
                        "d": true,
                        "n": files[i],
                        "t": "dir",
                        "l": lvl,
                        "c": this._readAssetDir(lvl + 1, path.join(fullPath, "/"), origPath, urlPrefix),
                        "p": urlPath
                    });
                }
                else if (files[i].toLowerCase()
                    .endsWith(".fileinfo.json")) continue;
                else
                {
                    let type = "unknown";
                    if (files[i].endsWith("jpg") || files[i].endsWith("png") || files[i].endsWith("jpeg")) type = "image";
                    else if (files[i].endsWith("mp3") || files[i].endsWith("ogg") || files[i].endsWith("wav")) type = "audio";
                    else if (files[i].endsWith("3d.json")) type = "3d json";
                    else if (files[i].endsWith("json")) type = "json";
                    else if (files[i].endsWith("mp4")) type = "video";

                    const fileData = {
                        "d": false,
                        "n": files[i],
                        "t": type,
                        "l": lvl,
                        "p": urlPath,
                        "type": type,
                        "updated": "bla"
                    };
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

    _getFullRenameResponse(opDocs, newName, oldName, currentUser, ignoreVersionGap = false, fromRename = false)
    {
        let opNamespace = opsUtil.getNamespace(newName);
        let availableNamespaces = ["Ops.", "Ops.Extension.", "Ops.Team."];
        availableNamespaces = helper.uniqueArray(availableNamespaces);
        if (opNamespace && !availableNamespaces.includes(opNamespace)) availableNamespaces.unshift(opNamespace);

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

        const problems = opsUtil.getOpRenameProblems(newName, oldName, currentUser);
        const hints = {};
        const consequences = opsUtil.getOpRenameConsequences(newName, oldName);

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

    getRecentPatches()
    {
        const recents = settings.getRecentProjects();
        return Object.values(recents);
    }

    opCreate(data)
    {
        let opName = data.opname;
        const currentUser = settings.getCurrentUser();
        let parts = opName.split(".");
        if (parts[0] === "Ops" && parts[1] === "User")
        {
            parts[2] = currentUser.usernameLowercase;
        }

        opName = parts.join(".");

        const result = {};
        const fn = opsUtil.getOpAbsoluteFileName(opName);
        const basePath = opsUtil.getOpAbsolutePath(opName);

        mkdirp.sync(basePath);

        const newJson = opsUtil.getOpDefaults(opName, currentUser);
        const changelogMessages = [];
        changelogMessages.push("created op");

        const opId = newJson.id;
        const code = data.code || "// your new op\n// have a look at the documentation at: \n// https://cables.gl/docs/5_writing_ops/coding_ops";
        fs.writeFileSync(fn, code);

        if (data.layout)
        {
            const obj = newJson;
            obj.layout = data.layout;
            if (obj.layout && obj.layout.name) delete obj.layout.name;
            result.layout = obj.layout;
        }

        if (data.libs)
        {
            const newLibNames = data.libs;
            newJson.libs = newLibNames;
            result.libs = newLibNames;
            changelogMessages.push(" updated libs: " + newLibNames.join(","));
        }

        if (data.coreLibs)
        {
            result.coreLibs = [];
            const newCoreLibNames = data.coreLibs;
            newJson.coreLibs = newCoreLibNames;
            result.coreLibs = newCoreLibNames;
            changelogMessages.push(" updated core libs: " + newCoreLibNames.join(","));
        }

        jsonfile.writeFileSync(opsUtil.getOpJsonPath(opName), newJson, {
            "encoding": "utf-8",
            "spaces": 4
        });

        let attProblems = null;
        if (data.attachments)
        {
            result.attachments = {};
            attProblems = opsUtil.updateAttachments(opName, data.attachments);
            result.attachments = opsUtil.getAttachments(opName);
        }

        if (changelogMessages.length > 0)
        {
            opsUtil.addOpChangeLogMessages(currentUser, opName, changelogMessages, "");
        }

        doc.updateOpDocs(opName);
        doc.addOpToLookup(opId, opName);

        if (!attProblems)
        {
            const response = {
                "name": opName,
                "id": opId,
                "code": code,
                "opDoc": newJson
            };
            if (result.attachments)
            {
                const attachmentFiles = opsUtil.getAttachmentFiles(opName);
                const attachments = {};
                for (let i = 0; i < attachmentFiles.length; i++)
                {
                    const attachmentFile = attachmentFiles[i];
                    attachments[attachmentFile] = opsUtil.getAttachment(opName, attachmentFile);
                }
                response.attachments = attachments;
            }
            if (result.coreLibs) response.coreLibs = result.coreLibs;
            if (result.libs) response.libs = result.libs;
            return response;
        }
        else
        {
            return attProblems;
        }
    }

    opUpdate(data)
    {
        const opName = data.opname;
        const currentUser = settings.getCurrentUser();
        return { "data": opsUtil.updateOp(currentUser, opName, data.update, { "formatCode": data.formatCode }) };
    }

    opSaveLayout(data)
    {
        const opName = data.opname;
        const layout = data.layout;
        return opsUtil.saveLayout(opName, layout);
    }

    opClone(data)
    {
        const newName = data.name;
        const oldName = data.opname;
        const currentUser = settings.getCurrentUser();
        return opsUtil.cloneOp(oldName, newName, currentUser);
    }

    async installProjectDependencies(data)
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        const opsDir = cables.getProjectOpsPath();
        const packageFiles = helper.getFilesRecursive(opsDir, "package.json");
        const fileNames = Object.keys(packageFiles).filter((packageFile) => { return !packageFile.includes("node_modules"); });

        let __dirname = fileURLToPath(new URL(".", import.meta.url));
        __dirname = __dirname.includes(".asar") ? __dirname.replace(".asar", ".asar.unpacked") : __dirname;
        const npm = path.join(__dirname, "../../node_modules/npm/bin/npm-cli.js");
        this._log.debug("NPM", npm);

        let toInstall = [];
        fileNames.forEach((packageFile) =>
        {
            const fileContents = packageFiles[packageFile];
            const fileJson = JSON.parse(fileContents);
            let deps = fileJson.dependencies || {};
            let devDeps = fileJson.devDependencies || {};
            const allDeps = { ...devDeps, ...deps };
            Object.keys(allDeps).forEach((lib) =>
            {
                if (lib)
                {
                    const ver = allDeps[lib];
                    if (ver)
                    {
                        const semVer = lib + "@" + ver;
                        toInstall.push(semVer);
                    }
                }
            });
        });
        toInstall = helper.uniqueArray(toInstall);
        if (toInstall.length > 0)
        {
            return execaSync(npm, ["install", toInstall], { "cwd": currentProjectDir });
        }
        else
        {
            return { "stdout": "noting to install" };
        }
    }

    async openOpDir(options)
    {
        const currentDir = settings.getCurrentProjectDir();
        const currentProject = settings.getCurrentProject();
        if (currentDir)
        {
            return shell.openPath(currentDir);
        }
    }

    async openProjectDir(options)
    {
        const currentDir = settings.getCurrentProjectDir();
        if (currentDir)
        {
            return shell.openPath(currentDir);
        }
    }

    async openAssetDir(assetUrl)
    {
        let assetPath = cables.getAssetPath();
        if (assetUrl)
        {
            try
            {
                const url = new URL(assetUrl);
                assetPath = path.dirname(url.pathname);
            }
            catch (e)
            {
                assetPath = path.parse(assetUrl);
            }
        }
        if (assetPath)
        {
            return shell.openPath(assetPath);
        }
    }

    _writeProjectToFile(currentProject, patch = null)
    {
        if (patch && (patch.data || patch.dataB64))
        {
            try
            {
                let buf = patch.data;
                if (patch.dataB64) buf = Buffer.from(patch.dataB64, "base64");

                const qData = JSON.parse(pako.inflate(buf, { "to": "string" }));

                if (qData.ops) currentProject.ops = qData.ops;
                if (qData.ui) currentProject.ui = qData.ui;
            }
            catch (e)
            {
                this._log.error("patch save error/invalid data", e);
                return;
            }
        }

        // filter imported ops, so we do not save these to the database
        currentProject.ops = currentProject.ops.filter((op) =>
        {
            return !(op.storage && op.storage.blueprint);
        });

        currentProject.updated = new Date();

        currentProject.opsHash = crypto
            .createHash("sha1")
            .update(JSON.stringify(currentProject.ops))
            .digest("hex");
        currentProject.buildInfo = this.getBuildInfo();

        const patchPath = settings.getProjectFile();
        return jsonfile.writeFileSync(patchPath, currentProject);
    }

    checkNumAssetPatches()
    {
        return { "assets": [], "countPatches": 0, "countOps": 0 };
    }

    async saveProjectAs(data)
    {
        const newProjectName = data.name || "new project";

        const projectDir = await electronApp.pickProjectDirDialog();
        if (projectDir)
        {
            logger.debug("setting new project dir to", projectDir);
            settings.setCurrentProjectDir(projectDir);
            const projectFile = path.join(projectDir, filesUtil.realSanitizeFilename(newProjectName + ".cables.json"));
            settings.setProjectFile(projectFile);
        }
        else
        {
            logger.error("no project dir chosen");
            return null;
        }


        let collaborators = [];
        let usersReadOnly = [];

        const origProject = settings.getCurrentProject();
        const currentUser = settings.getCurrentUser();
        const project = {
            "_id": helper.generateRandomId(),
            "name": newProjectName,
            "description": origProject.description,
            "tags": origProject.tags,
            "userId": currentUser._id,
            "cachedUsername": currentUser.username,
            "created": new Date(),
            "cloneOf": origProject._id,
            "updated": new Date(),
            "users": collaborators,
            "usersReadOnly": usersReadOnly,
            "visibility": "private"
        };
        project.shortId = helper.generateShortId(project._id, Date.now());
        return project;
    }

    async gotoPatch(data)
    {
        const recent = settings.getRecentProjects();
        let project = null;
        let projectFile = null;
        if (data)
        {
            for (const key in recent)
            {
                const p = recent[key];
                if (p && p.shortId === data.id)
                {
                    project = p;
                    projectFile = key;
                    break;
                }
            }
        }
        if (project && projectFile)
        {
            settings.setCurrentProject(projectFile, project);
            electronApp.openPatch(projectFile);
            return null;
        }
        else
        {
            return await electronApp.openPatchDialog();
        }
    }

    updateFile(data)
    {
        this._log.info("file edit...");
        if (!data || !data.fileName)
        {
            return;
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
        return { "success": true, "filename": sanitizedFileName };
    }

    async setProjectUpdated(data)
    {
        const now = Date.now();
        const project = settings.getCurrentProject();
        project.updated = now;
        this._writeProjectToFile(project);
        return { "data": project };
    }
}

export default new ElectronApi();
