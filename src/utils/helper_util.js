import { utilProvider, SharedHelperUtil } from "cables-shared-api";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import cables from "../cables.js";
import settings from "../electron/electron_settings.js";
import projectsUtil from "./projects_util.js";

class HelperUtil extends SharedHelperUtil
{
    fileURLToPath(url, convertRelativeToProject = false)
    {
        if (!url || url === "0") return "";
        let fileUrl = decodeURI(url);
        if (convertRelativeToProject && this.isLocalAssetUrl(fileUrl))
        {
            const currentProject = settings.getCurrentProject();
            const assetPathUrl = projectsUtil.getAssetPathUrl(currentProject);
            let filePath = fileUrl.replace("file://./", "");
            if (filePath.startsWith("./" + assetPathUrl)) filePath = filePath.replace("./" + assetPathUrl, "");
            if (filePath.startsWith(assetPathUrl)) filePath = filePath.replace(assetPathUrl, "");
            filePath = filePath.replace("./", "");
            filePath = path.join(cables.getAssetPath(), filePath);
            fileUrl = pathToFileURL(filePath).href;
        }
        return fileURLToPath(fileUrl);
    }

    pathToFileURL(thePath, convertProjectToRelative = false)
    {
        let filePath = thePath;
        if (convertProjectToRelative && this.isLocalAssetPath(filePath))
        {
            const currentProjectDir = settings.getCurrentProjectDir();
            return filePath.replace(currentProjectDir, "/");
        }
        else
        {
            return pathToFileURL(filePath).href;
        }
    }

    isLocalAssetUrl(url)
    {
        return (url && (url.startsWith("file://./") || url.startsWith("./") || url.startsWith("/")));
    }

    isLocalAssetPath(thePath)
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        return (currentProjectDir && thePath.startsWith(currentProjectDir));
    }
}
export default new HelperUtil(utilProvider);
