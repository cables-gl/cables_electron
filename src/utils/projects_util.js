import { utilProvider, SharedProjectsUtil } from "cables-shared-api";
import path from "path";
import settings from "../electron/electron_settings.js";
import helper from "./helper_util.js";
import cables from "../cables.js";

class ProjectsUtil extends SharedProjectsUtil
{
    getAssetPath(projectId)
    {
        return cables.getAssetPath();
    }

    getScreenShotPath(pId)
    {
        return path.join(settings.getCurrentProjectDir(), "/_screenshots/");
    }

    generateNewProject(owner)
    {
        const now = Date.now();
        const projectId = helper.generateRandomId();
        const shortId = helper.generateShortId(projectId, now);
        const randomize = settings.getUserSetting("randomizePatchName", true);
        const newProjectName = this.getNewProjectName(randomize);

        return {
            "_id": projectId,
            "shortId": shortId,
            "name": newProjectName,
            "description": "",
            "userId": owner._id,
            "cachedUsername": owner.username,
            "created": now,
            "updated": now,
            "visibility": "private",
            "ops": [],
            "settings": {
                "licence": "none"
            },
            "userList": [owner],
            "teams": [],
            "log": []
        };
    }

    getProjectOpDirs(project, includeOsDir = true, reverse = false)
    {
        const opsDirs = [];
        const projectOpDir = cables.getProjectOpsPath();
        if (projectOpDir) opsDirs.push(projectOpDir);
        if (project && project.dirs && project.dirs.ops)
        {
            const projectDir = settings.getCurrentProjectDir();
            project.dirs.ops.forEach((dir) =>
            {
                if (!path.isAbsolute(dir)) dir = path.join(projectDir, dir);
                opsDirs.push(dir);
            });
        }
        if (includeOsDir)
        {
            const osOpsDir = cables.getOsOpsDir();
            if (osOpsDir) opsDirs.push(osOpsDir);
        }
        if (reverse) return opsDirs.reverse();
        return opsDirs;
    }
}
export default new ProjectsUtil(utilProvider);
