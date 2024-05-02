import { utilProvider, SharedOpsUtil } from "cables-shared-api";
import { app } from "electron";
import settings from "../electron/electron_settings.js";

class OpsUtil extends SharedOpsUtil
{
    addPermissionsToOps(ops, user, teams = [], project = null)
    {
        if (!ops) return ops;
        ops.forEach((op) => { if (op && !(this.isCoreOp(op.name) || this.isExtension(op.name))) op.allowEdit = true; });
        return ops;
    }

    userHasWriteRightsOp(user, opName, teams = [], project = null)
    {
        return true;
    }

    getOpAbsolutePath(opName)
    {
        const project = settings.getCurrentProject();
        let projectOpDirs = [];
        if (project && project.dirs && project.dirs.ops) projectOpDirs = project.dirs.ops;
        console.log("HERE", opName, projectOpDirs, settings.getCurrentProjectDir(), app.getPath("userData"), super.getOpAbsolutePath(opName));
        return super.getOpAbsolutePath(opName);
    }
}
export default new OpsUtil(utilProvider);
