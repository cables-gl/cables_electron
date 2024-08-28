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
        this.LOCAL_ASSETS_PREFIX = "./";
    }

    fileURLToPath(url, convertRelativeToProject = false)
    {
        if (!url || url === "0") return "";
        if (url.includes("://") && !url.startsWith("file://"))
        {
            return "";
        }

        let fileUrl = decodeURI(url);
        let filePath = fileUrl;

        const currentProject = settings.getCurrentProject();
        const assetPathUrl = projectsUtil.getAssetPathUrl(currentProject);
        if (convertRelativeToProject && this.isLocalAssetUrl(fileUrl, assetPathUrl))
        {
            const filePatterns = this._localFilePrefixes(assetPathUrl);

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
                fileUrl = pathToFileURL(filePath);
            }
            catch (e)
            {
                this._log.error("failed to convert to project path", url, filePath, e);
                return "";
            }
        }
        try
        {
            return fileURLToPath(fileUrl);
        }
        catch (e)
        {
            this._log.info("failed to create path from url", convertRelativeToProject, fileUrl, url, e);
            return "";
        }
    }

    pathToFileURL(thePath, convertProjectToRelative = false)
    {
        let filePath = thePath;
        if (convertProjectToRelative && this.isLocalAssetPath(filePath))
        {
            const currentProjectDir = settings.getCurrentProjectDir();
            return filePath.replace(currentProjectDir, this.LOCAL_ASSETS_PREFIX);
        }
        else
        {
            return pathToFileURL(filePath).href;
        }
    }

    isLocalAssetUrl(url, assetPathUrl)
    {
        if (!url) return false;

        const filePatterns = this._localFilePrefixes(assetPathUrl);
        for (let i = 0; i < filePatterns.length; i++)
        {
            if (url.startsWith(filePatterns[i])) return true;
        }
        if (!url.includes("://")) return true;
        return false;
    }

    isLocalAssetPath(thePath)
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        return (currentProjectDir && thePath.startsWith(currentProjectDir));
    }

    _localFilePrefixes(assetPathUrl)
    {
        return [
            "file://./",
            "file:///assets/",
            "./" + assetPathUrl,
            assetPathUrl,
            "assets/",
            "/assets/",
            this.LOCAL_ASSETS_PREFIX,
            "/"
        ];
    }
}
export default new HelperUtil(utilProvider);
