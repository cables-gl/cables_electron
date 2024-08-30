import { SharedHelperUtil, utilProvider } from "cables-shared-api";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import cables from "../cables.js";
import settings from "../electron/electron_settings.js";

class HelperUtil extends SharedHelperUtil
{
    constructor(provider)
    {
        super(provider);
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

        const uiDistPath = cables.getUiDistPath();
        filePath = filePath.replace("file://" + uiDistPath, "");
        if (convertRelativeToProject && !filePath.startsWith("file:") && !path.isAbsolute(filePath))
        {
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

    pathToFileURL(thePath)
    {
        return pathToFileURL(thePath).href;
    }

    isLocalAssetPath(thePath)
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        return (currentProjectDir && thePath.startsWith(currentProjectDir));
    }
}
export default new HelperUtil(utilProvider);
