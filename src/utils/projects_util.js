import { utilProvider, SharedProjectsUtil } from "cables-shared-api";
import store from "../electron/electron_store.js";

class ProjectsUtil extends SharedProjectsUtil
{
    getAssetPath(projectId)
    {
        return store.getCurrentProjectDir();
    }

    getScreenShotPath(pId)
    {
        return this.getAssetPath(pId) + "/_screenshots/";
    }
}
export default new ProjectsUtil(utilProvider);
