import { utilProvider, SharedHelperUtil } from "cables-shared-api";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import cables from "../cables.js";
import settings from "../electron/electron_settings.js";

class HelperUtil extends SharedHelperUtil
{
    fileURLToPath(url, convertRelativeToProject = false)
    {
        let fileUrl = url;
        if (convertRelativeToProject)
        {
            if (fileUrl && (fileUrl.startsWith("file://./") || fileUrl.startsWith("./")))
            {
                let filePath = fileUrl.substring(fileUrl.indexOf("./") + 1);
                filePath = path.join(cables.getAssetPath(), filePath);
                fileUrl = pathToFileURL(filePath);
            }
        }
        return fileURLToPath(fileUrl);
    }

    pathToFileURL(thePath, convertProjectToRelative = false)
    {
        let filePath = thePath;
        if (convertProjectToRelative)
        {
            const currentProjectDir = settings.getCurrentProjectDir();
            if (currentProjectDir && thePath.startsWith(currentProjectDir))
            {
                filePath = filePath.substring(filePath.indexOf(currentProjectDir) + 1);
                return "file://./" + filePath;
            }
            else
            {
                return pathToFileURL(filePath);
            }
        }
        else
        {
            return pathToFileURL(filePath);
        }
    }
}
export default new HelperUtil(utilProvider);
