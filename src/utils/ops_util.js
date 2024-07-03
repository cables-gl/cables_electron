import { utilProvider, SharedOpsUtil } from "cables-shared-api";
import path from "path";
import fs from "fs";
import helper from "./helper_util.js";
import settings from "../electron/electron_settings.js";
import cables from "../cables.js";
import projectsUtil from "./projects_util.js";
import filesUtil from "./files_util.js";

class OpsUtil extends SharedOpsUtil
{
    addPermissionsToOps(opDocs, user, teams = [], project = null)
    {
        if (!opDocs) return opDocs;
        opDocs.forEach((opDoc) =>
        {
            const file = this.getOpAbsoluteFileName(opDoc.name);
            opDoc.allowEdit = true;
            if (file)
            {
                try
                {
                    fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
                    opDoc.allowEdit = true;
                }
                catch (e)
                {
                    // not allowed to read/write
                    opDoc.allowEdit = false;
                }
            }
        });
        return opDocs;
    }

    userHasWriteRightsOp(user, opName, teams = [], project = null)
    {
        const file = this.getOpAbsoluteFileName(opName);
        if (file && fs.existsSync(file))
        {
            try
            {
                fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
                return true;
            }
            catch (e)
            {
                // not allowed to read/write
                return false;
            }
        }

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
        return [];
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
                const existingOpDir = this.getOpSourceDir(newName);
                problems.overruled_by_other_op = "The new Op would conflict with the Op at:<br/> <a onclick=\"CABLESUILOADER.talkerAPI.send('openDir', { 'dir': '" + existingOpDir + "'});\">" + existingOpDir + "</a>";
            }
        }
        return problems;
    }

    getOpTargetDirs(project, reverse = false)
    {
        return projectsUtil.getProjectOpDirs(project, true, reverse);
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

    getOpAssetPorts(op, includeLibraryAssets = false)
    {
        const assetPorts = [];
        if (!op) return assetPorts;
        if (!op.portsIn) return assetPorts;

        for (let i = 0; i < op.portsIn.length; i++)
        {
            const port = op.portsIn[i];
            if (
                port.value &&
                typeof port.value == "string" &&
                port.name &&
                port.value.length &&
                (port.display === "file" ||
                    port.name.toLowerCase().indexOf("file") > -1 ||
                    port.name.toLowerCase().indexOf("url") > -1 ||
                    // port names in cubemapfromtextures !
                    port.name.toLowerCase().indexOf("posx") > -1 ||
                    port.name.toLowerCase().indexOf("posy") > -1 ||
                    port.name.toLowerCase().indexOf("posz") > -1 ||
                    port.name.toLowerCase().indexOf("negx") > -1 ||
                    port.name.toLowerCase().indexOf("negy") > -1 ||
                    port.name.toLowerCase().indexOf("negz") > -1)
            )
            {
                if (!port.value.toLowerCase().startsWith("/assets/library"))
                {
                    assetPorts.push(port);
                }
                else if (includeLibraryAssets)
                {
                    assetPorts.push(port);
                }
            }
        }
        return assetPorts;
    }

    _getAbsoluteOpDirFromHierarchy(opName, defaultDir)
    {
        const projectDir = settings.getCurrentProjectDir();
        let projectOpDir = null;
        if (projectDir) projectOpDir = cables.getProjectOpsPath();
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

    getOpNameByAbsoluteFileName(fileName)
    {
        if (!fileName) return "";
        const parts = path.parse(fileName);
        if (parts && parts.name) return parts.name;
        return "";
    }

    updateOpCode(opName, author, code)
    {
        return filesUtil.runUnWatched(opName, () =>
        {
            return super.updateOpCode(opName, author, code);
        });
    }
}
export default new OpsUtil(utilProvider);
