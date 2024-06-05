import { utilProvider, SharedFilesUtil } from "cables-shared-api";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import helper from "./helper_util.js";
import cables from "../cables.js";

class FilesUtil extends SharedFilesUtil
{
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
