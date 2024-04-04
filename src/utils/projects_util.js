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

        return {
            "_id": projectId,
            "shortId": shortId,
            "name": "new project",
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
}
export default new ProjectsUtil(utilProvider);
