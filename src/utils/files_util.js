import { SharedFilesUtil, utilProvider } from "cables-shared-api";
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import helper from "./helper_util.js";
import cables from "../cables.js";
import opsUtil from "./ops_util.js";
import electronApp from "../electron/main.js";
import projectsUtil from "./projects_util.js";
import settings from "../electron/electron_settings.js";

class FilesUtil extends SharedFilesUtil
{
    constructor(provider)
    {
        super(provider);

        const watcherOptions = {
            "ignored": /(^|[\/\\])\../,
            "ignorePermissionErrors": true,
            "ignoreInitial": true,
            "persistent": true,
            "followSymlinks": true,
            "disableGlobbing": true,
            "awaitWriteFinish": {
                "stabilityThreshold": 1000
            }
        };

        this._opChangeWatcher = chokidar.watch([], watcherOptions);
        this._opChangeWatcher.on("change", (fileName) =>
        {
            const opName = opsUtil.getOpNameByAbsoluteFileName(fileName);
            if (opName)
            {
                const opId = opsUtil.getOpIdByObjName(opName);
                electronApp.sendTalkerMessage("executeOp", { "name": opName, "forceReload": true, "id": opId });
            }
        });

        this._opChangeWatcher.on("unlink", (fileName) =>
        {
            const opName = opsUtil.getOpNameByAbsoluteFileName(fileName);
            if (opName)
            {
                electronApp.sendTalkerMessage("deleteOp", { "name": opName });
            }
        });

        this._assetChangeWatcher = chokidar.watch([], watcherOptions);
        this._assetChangeWatcher.on("change", (fileName) =>
        {
            electronApp.sendTalkerMessage("fileUpdated", { "filename": helper.pathToFileURL(fileName) });
        });

        this._assetChangeWatcher.on("unlink", (fileName) =>
        {
            electronApp.sendTalkerMessage("fileDeleted", { "fileName": helper.pathToFileURL(fileName) });
        });
    }

    registerAssetChangeListeners(project, removeOthers = false)
    {
        if (!project || !project.ops) return;
        if (removeOthers) this._assetChangeWatcher.removeAllListeners();
        const fileNames = projectsUtil.getUsedAssetFilenames(project, true);
        this._assetChangeWatcher.add(fileNames);
    }

    registerOpChangeListeners(opNames, removeOthers = false)
    {
        if (!opNames) return;
        if (removeOthers) this._opChangeWatcher.removeAllListeners();
        const fileNames = [];
        opNames.forEach((opName) =>
        {
            if (opsUtil.isOpNameValid(opName))
            {
                const opFile = opsUtil.getOpAbsoluteFileName(opName);
                if (opFile)
                {
                    fileNames.push(opFile);
                }
            }
        });
        this._opChangeWatcher.add(fileNames);
    }

    unregisterOpChangeListeners(opNames)
    {
        if (!opNames) return;
        const fileNames = [];
        opNames.forEach((opName) =>
        {
            if (opsUtil.isOpNameValid(opName))
            {
                const opFile = opsUtil.getOpAbsoluteFileName(opName);
                if (opFile)
                {
                    fileNames.push(opFile);
                }
            }
        });
        this._opChangeWatcher.unwatch(fileNames);
    }

    async unregisterChangeListeners()
    {
        await this._assetChangeWatcher.close();
        await this._opChangeWatcher.close();
    }

    getFileDb(filePath, user, project)
    {
        const stats = fs.statSync(filePath);
        const fileName = path.basename(filePath);
        const suffix = path.extname(fileName);
        return {
            "_id": helper.generateRandomId(),
            "name": fileName,
            "type": this.getFileType(fileName),
            "suffix": suffix,
            "fileName": fileName,
            "projectId": project._id,
            "userId": user._id,
            "updated": stats.mtime,
            "created": stats.ctime,
            "cachebuster": "",
            "isLibraryFile": filePath.includes(cables.getAssetLibraryPath()),
            "__v": 0,
            "size": stats.size,
            "path": filePath
        };
    }

    getFileAssetLocation(fileDb)
    {
        return fileDb.path;
    }

    getFileAssetUrlPath(fileDb)
    {
        if (!fileDb) return "";
        let assetDir = "";
        let assetFilePath = fileDb.path;
        if (fileDb.isLibraryFile)
        {
            assetDir = cables.getAssetLibraryPath();
            assetFilePath = path.join(assetDir, this.getAssetFileName(fileDb));
        }
        else if (!assetFilePath)
        {
            assetFilePath = path.join(assetDir, this.getAssetFileName(fileDb));
        }
        return helper.pathToFileURL(assetFilePath);
    }

    getLibraryFiles()
    {
        const p = cables.getAssetLibraryPath();
        return this.readAssetDir(0, p, p);
    }

    getFileIconName(fileDb)
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

    readAssetDir(lvl, filePath, origPath, urlPrefix = "")
    {
        const arr = [];
        if (!fs.existsSync(filePath))
        {
            this._log.error("could not find library assets at", filePath, "check your cables_env_local.json");
            return arr;
        }
        const files = fs.readdirSync(filePath);
        for (const i in files)
        {
            const fullPath = path.join(filePath, "/", files[i]);
            const urlPath = helper.pathToFileURL(fullPath);

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
                        "c": this.readAssetDir(lvl + 1, path.join(fullPath, "/"), origPath, urlPrefix),
                        "p": urlPath,
                        "isLibraryFile": true
                    });
                }
                else if (files[i].toLowerCase().endsWith(".fileinfo.json")) continue;
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
                        "updated": "bla",
                        "isLibraryFile": true
                    };
                    fileData.icon = this.getFileIconName(fileData);
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

    getPatchFiles()
    {
        const arr = [];
        const fileHierarchy = {};

        const project = settings.getCurrentProject();
        if (!project) return arr;

        const projectDir = settings.getCurrentProjectDir();
        const fileNames = projectsUtil.getUsedAssetFilenames(project);
        fileNames.forEach((fileName) =>
        {
            let type = "unknown";
            if (fileName.endsWith("jpg") || fileName.endsWith("png") || fileName.endsWith("jpeg")) type = "image";
            else if (fileName.endsWith("mp3") || fileName.endsWith("ogg") || fileName.endsWith("wav")) type = "audio";
            else if (fileName.endsWith("3d.json")) type = "3d json";
            else if (fileName.endsWith("json")) type = "json";
            else if (fileName.endsWith("mp4")) type = "video";

            let dirName = path.join(path.dirname(fileName), "/");
            dirName = dirName.replaceAll("\\", "/");

            if (!fileHierarchy.hasOwnProperty(dirName)) fileHierarchy[dirName] = [];
            const fileUrl = helper.pathToFileURL(fileName);

            const fileData = {
                "d": false,
                "n": path.basename(fileUrl),
                "t": type,
                "l": 0,
                "p": fileUrl,
                "type": type,
                "updated": "bla",
                "isReference": true
            };
            fileData.icon = this.getFileIconName(fileData);

            let stats = fs.statSync(fileName);
            if (stats && stats.mtime)
            {
                fileData.updated = new Date(stats.mtime).getTime();
            }
            fileHierarchy[dirName].push(fileData);
        });
        const dirNames = Object.keys(fileHierarchy);
        for (let dirName of dirNames)
        {
            let displayName = dirName;
            if (dirName === projectDir)
            {
                displayName = "Project Directory";
            }
            else if (dirName.startsWith(projectDir))
            {
                displayName = path.join(dirName.replace(projectDir, ""), "/");
            }
            else
            {
                displayName = path.join(dirName, "/");
            }

            arr.push({
                "d": true,
                "n": displayName,
                "t": "dir",
                "l": 1,
                "c": fileHierarchy[dirName],
                "p": dirName
            });
        }
        return arr;
    }

    isAssetLibraryLocation(filePath)
    {
        if (!filePath) return false;
        return filePath.toLowerCase().includes(cables.getAssetLibraryPath());
    }
}

export default new FilesUtil(utilProvider);
