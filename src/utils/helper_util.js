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

    async getOpNotFoundErrorVars(opIdentifier)
    {
        let text = "Could not find op with id " + opIdentifier + " in:";
        const footer = "Try adding other directories via 'Manage Op Directories' after loading the patch.";
        const reasons = [];

        const errorVars = {
            "text": text,
            "footer": footer,
            "reasons": reasons,
            "hideEnvButton": true
        };

        const currentProject = settings.getCurrentProject();
        const projectOpDirs = projectsUtil.getProjectOpDirs(currentProject, true);
        projectOpDirs.forEach((projectOpDir) =>
        {
            const link = "<a onclick=\"CABLESUILOADER.talkerAPI.send('openDir', { 'dir': '" + projectOpDir + "'});\"><span class=\"icon icon-folder\"></span> " + projectOpDir + "</a>";
            reasons.push(link);
        });

        if (net.isOnline())
        {
            const getOpEnvironmentDocs = promisify(opsUtil.getOpEnvironmentDocs.bind(opsUtil));
            try
            {
                const envDocs = await getOpEnvironmentDocs(opIdentifier);
                if (envDocs && envDocs.environments && envDocs.environments.length > 0)
                {
                    const otherEnvName = envDocs.environments[0];
                    errorVars.editorLink = "https://" + otherEnvName + "/op/" + envDocs.name;
                    errorVars.otherEnvButton = "Visit " + otherEnvName;

                    text = "Could not find <a href=\"" + errorVars.editorLink + "\" target=\"_blank\">" + envDocs.name + "</a> in:";

                    envDocs.environments.forEach((envName) =>
                    {
                        const opLink = "https://" + envName + "/op/" + envDocs.name;
                        reasons.push("Found <a href=\"" + opLink + "\" target=\"_blank\">" + envDocs.name + "</a> on " + envName);
                    });
                }
                errorVars.text = text;
                errorVars.reasons = reasons;
                errorVars.hideEnvButton = true;
            }
            catch (e)
            {
                // something went wrong, no internet or something, this is informational anyhow
            }
        }
        return errorVars;
    }
}
export default new HelperUtil(utilProvider);
