import { utilProvider, SharedFilesUtil } from "cables-shared-api";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import chokidar from "chokidar";
import helper from "./helper_util.js";
import cables from "../cables.js";
import opsUtil from "./ops_util.js";
import electronApp from "../electron/main.js";
import projectsUtil from "./projects_util.js";

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
            "awaitWriteFinish": false
        };

        this._opChangeWatcher = chokidar.watch([], watcherOptions);
        this._opChangeWatcher.on("change", (fileName) =>
        {
            const opName = opsUtil.getOpNameByAbsoluteFileName(fileName);
            if (opName)
            {
                electronApp.sendTalkerMessage("executeOp", { "name": opName });
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
            electronApp.sendTalkerMessage("fileUpdated", { "filename": pathToFileURL(fileName).href });
        });

        this._assetChangeWatcher.on("unlink", (fileName) =>
        {
            electronApp.sendTalkerMessage("fileDeleted", { "fileName": pathToFileURL(fileName).href });
        });
    }

    runUnWatched(opName, command)
    {
        const opFile = opsUtil.getOpAbsoluteFileName(opName);
        this._opChangeWatcher.unwatch(opFile);
        let returnValue;
        try
        {
            returnValue = command();
        }
        catch (e)
        {
            this._log.error("failed to run unwatched command for", opName, command, e);
        }
        finally
        {
            this._opChangeWatcher.add(opFile);
        }
        return returnValue;
    }

    registerAssetChangeListeners(project)
    {
        if (!project || !project.ops) return;
        const fileNames = projectsUtil.getUsedAssetFilenames(project, true);
        this._assetChangeWatcher.add(fileNames);
    }

    registerOpChangeListeners(opNames)
    {
        if (!opNames) return;
        const fileNames = [];
        opNames.forEach((opName) =>
        {
            const opFile = opsUtil.getOpAbsoluteFileName(opName);
            if (opFile) fileNames.push(opFile);
        });
        this._opChangeWatcher.add(fileNames);
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
        const assetUrl = pathToFileURL(assetFilePath);
        return assetUrl.href;
    }
}

export default new FilesUtil(utilProvider);
