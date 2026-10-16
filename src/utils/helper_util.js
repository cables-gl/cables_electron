import { net } from "electron";
import { promisify } from "util";
import { SharedHelperUtil, utilProvider } from "cables-shared-api";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import cables from "../cables.js";
import settings from "../electron/electron_settings.js";
import projectsUtil from "./projects_util.js";
import opsUtil from "./ops_util.js";

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

    pathToFileURL(thePath, convertRelativeToProject = false)
    {
        if (thePath && thePath.startsWith("file:")) return thePath;
        if (convertRelativeToProject && !path.isAbsolute(thePath))
        {
            return pathToFileURL(path.join(cables.getAssetPath(), thePath)).href;
        }
        else
        {
            return thePath ? pathToFileURL(thePath).href : null;
        }
    }

    isLocalAssetPath(thePath)
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        return (currentProjectDir && thePath.startsWith(currentProjectDir));
    }

    /**
     * @param {String} opIdentifier
     * @param {{name: String, dir?: String}} [historyEntry]
     */
    async getOpNotFoundErrorVars(opIdentifier, historyEntry = null)
    {
        let text = "Could not find op with id " + opIdentifier;
        const footer = "Try adding other directories via 'Manage Op Directories' after loading the patch.";
        const ops = [];

        const errorVars = {
            "footer": footer,
            "hideEnvButton": true
        };

        if (historyEntry && historyEntry.name) text += " - " + historyEntry.name;

        const currentProject = settings.getCurrentProject();
        const projectOpDirs = projectsUtil.getProjectOpDirs(currentProject);
        projectOpDirs.forEach((projectOpDir) =>
        {
            ops.push({
                "env": "electron",
                "name": opIdentifier,
                "opDir": projectOpDir
            });
        });
        if (ops.length)
        {
            text += " in:";
        }
        else
        {
            text += ".";
        }
        if (historyEntry && historyEntry.name) text = "Could not find op " + historyEntry.name + " (id " + opIdentifier + ")";
        errorVars.text = text;
        errorVars.ops = ops;

        return errorVars;
    }
}
export default new HelperUtil(utilProvider);
