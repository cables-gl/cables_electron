import { utilProvider, SharedOpsUtil } from "cables-shared-api";
import path from "path";
import fs from "fs";
import helper from "./helper_util.js";
import settings from "../electron/electron_settings.js";
import cables from "../cables.js";
import projectsUtil from "./projects_util.js";

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
        return this._getAbsoluteOpDirFromHierarchy(opName, super.getOpAbsolutePath(opName));
    }

    getOpSourceDir(opName, relative = false)
    {
        if (relative) return super.getOpSourceDir(opName, relative);
        return this._getAbsoluteOpDirFromHierarchy(opName, super.getOpSourceDir(opName));
    }

    getOpRenameConsequences(newName, oldName, targetDir = null)
    {
        const consequences = super.getOpRenameConsequences(newName, oldName);
        if (this.opExists(newName) && targetDir)
        {
            const newOpDir = path.join(targetDir, this.getOpTargetDir(newName, true));
            const newOpFile = path.join(newOpDir, this.getOpFileName(newName));
            if (!fs.existsSync(newOpFile))
            {
                const existingOpDir = this.getOpSourceDir(newName);
                const opTargetDirs = this.getOpTargetDirs(settings.getCurrentProject());
                const newIndex = opTargetDirs.findIndex((dir) => { return newOpDir.startsWith(dir); });
                const oldIndex = opTargetDirs.findIndex((dir) => { return existingOpDir.startsWith(dir); });
                if (newIndex < oldIndex)
                {
                    consequences.overrules_other_op = "The new Op will 'overrule' the op at:<br/> <a onclick=\"CABLESUILOADER.talkerAPI.send('openDir', { 'dir': '" + newOpDir + "'});\">" + newOpDir + "</a>";
                }
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

                const existingOpDir = this.getOpSourceDir(newName);
                const opTargetDirs = this.getOpTargetDirs(settings.getCurrentProject());
                const newIndex = opTargetDirs.findIndex((dir) => { return newOpDir.startsWith(dir); });
                const oldIndex = opTargetDirs.findIndex((dir) => { return existingOpDir.startsWith(dir); });
                if (newIndex > oldIndex)
                {
                    problems.overruled_by_other_op = "The new Op would be 'overruled' by the op at:<br/> <a onclick=\"CABLESUILOADER.talkerAPI.send('openDir', { 'dir': '" + existingOpDir + "'});\">" + existingOpDir + "</a>";
                }
            }
        }
        return problems;
    }

    getOpTargetDirs(project)
    {
        return projectsUtil.getProjectOpDirs(settings.getCurrentProject());
    }

    getOpNamesInProjectDirs(project)
    {
        const opNames = [];
        if (!project) return opNames;

        const opDirs = projectsUtil.getProjectOpDirs(project);
        opDirs.forEach((opDir) =>
        {
            if (fs.existsSync(opDir))
            {
                const opJsons = helper.getFilesRecursive(opDir, ".json");
                for (let jsonPath in opJsons)
                {
                    const parts = jsonPath.split("/");
                    const opName = parts[parts.length - 2];
                    if (this.isOpNameValid(opName) && !opNames.includes(opName))
                    {
                        opNames.push(opName);
                    }
                }
            }
        });
        return helper.uniqueArray(opNames);
    }

    _getAbsoluteOpDirFromHierarchy(opName, defaultDir)
    {
        const projectDir = settings.getCurrentProjectDir();
        let projectOpDir = null;
        if (projectDir) projectOpDir = cables.getProjectOpsPath();
        const osOpsDir = cables.getOsOpsDir();
        const relativePath = super.getOpSourceDir(opName, true);
        if (relativePath)
        {
            const dirs = projectsUtil.getProjectOpDirs(settings.getCurrentProject());
            for (let i = 0; i < dirs.length; i++)
            {
                const dir = dirs[i];
                const opPath = path.join(dir, relativePath);
                if (fs.existsSync(opPath)) return opPath;
            }
        }
        return defaultDir;
    }
}
export default new OpsUtil(utilProvider);
