import { utilProvider, SharedOpsUtil } from "cables-shared-api";
import { app } from "electron";
import path from "path";
import fs from "fs";
import settings from "../electron/electron_settings.js";
import cables from "../cables.js";

class OpsUtil extends SharedOpsUtil
{
    addPermissionsToOps(ops, user, teams = [], project = null)
    {
        if (!ops) return ops;
        ops.forEach((op) => { op.allowEdit = true; });
        return ops;
    }

    userHasWriteRightsOp(user, opName, teams = [], project = null)
    {
        return true;
    }

    getOpAbsolutePath(opName)
    {
        const projectDir = settings.getCurrentProjectDir();
        let projectOpDir = null;
        if (projectDir) projectOpDir = cables.getProjectOpsPath();
        const osOpsDir = cables.getOsOpsDir();
        const relativePath = super.getOpSourceDir(opName, true);
        let dirToCheck = null;
        if (relativePath)
        {
            if (projectDir)
            {
                dirToCheck = path.join(projectOpDir, relativePath);
                if (fs.existsSync(dirToCheck)) return dirToCheck;
                const project = settings.getCurrentProject();
                let additionalOpDirs = [];
                if (project && project.dirs && project.dirs.ops) additionalOpDirs = project.dirs.ops;
                if (additionalOpDirs.length > 0)
                {
                    for (let additionalOpDir of additionalOpDirs)
                    {
                        if (!path.isAbsolute(additionalOpDir)) additionalOpDir = path.join(projectDir, additionalOpDir);
                        dirToCheck = path.join(additionalOpDir, relativePath);
                        if (fs.existsSync(dirToCheck)) return dirToCheck;
                    }
                }
                dirToCheck = path.join(osOpsDir, relativePath);
                if (fs.existsSync(dirToCheck)) return dirToCheck;
            }
        }
        return super.getOpAbsolutePath(opName);
    }

    getOpRenameConsequences(newName, oldName, targetDir = false)
    {
        const consequences = super.getOpRenameConsequences(newName, oldName);
        if (this.opExists(newName))
        {
            const existingOpDir = this.getOpSourceDir(newName);
            const newOpDir = path.join(targetDir, this.getOpTargetDir(newName, true));
            const newOpFile = path.join(newOpDir, this.getOpFileName(newName));
            if (!fs.existsSync(newOpFile))
            {
                const opTargetDirs = this.getOpTargetDirs(settings.getCurrentProject());
                consequences.shadows_other_op = "The new Op will 'shadow' the op at <a onclick=\"CABLESUILOADER.talkerAPI.send('openDir', { 'dir': '" + newOpDir + "'});\">" + newOpDir + "</a>";
            }
        }

        return consequences;
    }

    getOpRenameProblems(newName, oldName, userObj, teams = [], newOpProject = null, oldOpProject = null, opUsages = [], checkUsages = true, targetDir = null)
    {
        const problems = super.getOpRenameProblems(newName, oldName, userObj, teams, newOpProject, oldOpProject, opUsages, checkUsages);
        if (problems.target_exists && targetDir)
        {
            const newOpDir = path.join(targetDir, this.getOpTargetDir(newName, true), this.getOpFileName(newName));
            if (!fs.existsSync(newOpDir))
            {
                delete problems.target_exists;
                delete problems.name_taken;
            }
        }
        return problems;
    }

    getOpTargetDirs(project)
    {
        const projectDir = settings.getCurrentProjectDir();
        let dirs = [];
        dirs.push(cables.getOsOpsDir());
        if (project && project.dirs && project.dirs.ops)
        {
            const additionalOpDirs = project.dirs.ops.reverse();
            dirs = dirs.concat(additionalOpDirs);
        }
        if (projectDir) dirs.push(cables.getProjectOpsPath());
        return dirs.reverse();
    }
}
export default new OpsUtil(utilProvider);
