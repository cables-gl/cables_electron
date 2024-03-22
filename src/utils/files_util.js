import { utilProvider, SharedFilesUtil } from "cables-shared-api";
import fs from "fs";
import path from "path";
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
            "cachebuster": helper.generateRandomId(),
            "isLibraryFile": filePath.includes(cables.getAssetLibraryPath()),
            "__v": 0,
            "size": stats.size
        };
    }

    getFileAssetLocation(fileDb)
    {
        let assetPath = cables.getAssetPath();
        let fileName = this.getAssetFileName(fileDb);
        if (fileDb.isLibraryFile)
        {
            assetPath = cables.getAssetLibraryPath();
        }
        return path.join(assetPath, fileName);
    }

    getFileAssetUrlPath(fileDb)
    {
        if (!fileDb) return "";
        let assetDir = cables.getAssetPath();
        if (fileDb.isLibraryFile) cables.getAssetLibraryPath();
        return path.join("file://", assetDir, this.getAssetFileName(fileDb));
    }
}

export default new FilesUtil(utilProvider);
