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

    /**
     * do not convert screenshots on standalone version
     *
     * @param project
     * @param filenameScreenshot
     * @param ext
     * @param assetPath
     * @private
     * @return boolean
     */
    _convertScreenShot(project, filenameScreenshot, ext, assetPath)
    {
        return true;
    }
}
export default new ProjectsUtil(utilProvider);
