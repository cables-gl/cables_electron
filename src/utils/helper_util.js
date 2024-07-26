import { utilProvider, SharedHelperUtil } from "cables-shared-api";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import cables from "../cables.js";
import settings from "../electron/electron_settings.js";
import projectsUtil from "./projects_util.js";

class HelperUtil extends SharedHelperUtil
{
    constructor(provider)
    {
        super(provider);
        this._localFiles = [
            "file://./",
            "file:///assets/",
            "./",
            "/",
            "assets/",
            "/assets/"
        ];
    }

    fileURLToPath(url, convertRelativeToProject = false)
    {
        if (!url || url === "0") return "";
        let fileUrl = decodeURI(url);
        if (convertRelativeToProject && this.isLocalAssetUrl(fileUrl))
        {
            const currentProject = settings.getCurrentProject();
            const assetPathUrl = projectsUtil.getAssetPathUrl(currentProject);
            let filePath = fileUrl;
            const filePatterns = [
                "file://./",
                "file:///assets/",
                "./" + assetPathUrl,
                assetPathUrl,
                "assets/",
                "/assets/",
                "./"
            ];
            filePatterns.forEach((filePattern) =>
            {
                if (filePath.startsWith(filePattern))
                {
                    filePath = filePath.replace(filePattern, "");
                }
            });

            filePath = path.join(cables.getAssetPath(), filePath);
            try
            {
                fileUrl = pathToFileURL(filePath).href;
            }
            catch (e)
            {
                this._log.error("failed to convert to project path", url, filePath);
                return "";
            }
        }
        try
        {
            return fileURLToPath(fileUrl);
        }
        catch (e)
        {
            this._log.info("failed to create url from path", url);
            return "";
        }
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
        if (!url) return false;

        for (let i = 0; i < this._localFiles.length; i++)
        {
            if (url.startsWith(this._localFiles[i])) return true;
        }
        return false;
    }

    isLocalAssetPath(thePath)
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        return (currentProjectDir && thePath.startsWith(currentProjectDir));
    }
}
export default new HelperUtil(utilProvider);
