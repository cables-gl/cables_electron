import { utilProvider, SharedOpsUtil } from "cables-shared-api";
import path from "path";
import fs from "fs";
import projectsUtil from "./projects_util.js";
import filesUtil from "./files_util.js";

class OpsUtil extends SharedOpsUtil
{
    constructor(provider)
    {
        super(provider);
        this.PREFIX_LOCAL_OPS = "Ops.Local.";
    }

    validateAndFormatOpCode(code)
    {
        return {
            "formatedCode": this._helperUtil.removeTrailingSpaces(code),
            "error": false,
            "message": null
        };
    }

    isCoreOp(opName)
    {
        const opsDir = this._cables.getCoreOpsPath();
        const opDir = this.getOpSourceDir(opName);
        return opDir.startsWith(opsDir);
    }

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
        if (!user) return false;
        if (!opName) return false;
        if (!opName.startsWith(this.PREFIX_OPS)) return false;
        if (opName.indexOf("..") > -1) return false;
        if (opName.indexOf(" ") > -1) return false;
        if (opName.startsWith(".")) return false;
        if (opName.endsWith(".")) return false;

        const validName = this.isOpNameValid(opName);
        if (!validName) return false;

        const file = this.getOpAbsoluteFileName(opName);
        if (file)
        {
            if (fs.existsSync(file))
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
            else if (this._cables.isPackaged() && file.startsWith(this._cables.getOpsPath()))
            {
                return false;
            }
            else
            {
                return true;
            }
        }
        return true;
    }

    getOpAbsolutePath(opName)
    {
        return projectsUtil.getAbsoluteOpDirFromHierarchy(opName);
    }

    getOpSourceDir(opName, relative = false)
    {
        if (!opName) return null;
        if (relative) return super.getOpSourceDir(opName, relative);
        return projectsUtil.getAbsoluteOpDirFromHierarchy(opName);
    }

    getOpTargetDir(opName, relative = false)
    {
        let targetDir = "";
        if (relative)
        {
            if (opName.endsWith(".")) opName = opName.substring(0, opName.length - 1);
            return path.join(opName, "/");
        }
        else
        {
            targetDir = projectsUtil.getAbsoluteOpDirFromHierarchy(opName);
        }
        return targetDir;
    }

    getOpSourceNoHierarchy(opName, relative = false)
    {
        return super.getOpSourceDir(opName, relative);
    }

    getOpRenameConsequences(newName, oldName, targetDir = null)
    {
        return [];
    }

    getOpRenameProblems(newName, oldName, userObj, teams = [], newOpProject = null, oldOpProject = null, opUsages = [], checkUsages = true, targetDir = null)
    {
        const problems = super.getOpRenameProblems(newName, oldName, userObj, teams, newOpProject, oldOpProject, opUsages, checkUsages);
        if (problems.no_rights_target && targetDir)
        {
            if (fs.existsSync(targetDir))
            {
                try
                {
                    fs.accessSync(targetDir, fs.constants.R_OK | fs.constants.W_OK);
                    delete problems.no_rights_target;
                }
                catch (e)
                {
                    // not allowed to read/write
                }
            }
        }
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

    getOpNameByAbsoluteFileName(fileName)
    {
        if (!fileName) return "";
        const parts = path.parse(fileName);
        if (parts && parts.name) return parts.name;
        return "";
    }

    updateOpCode(opName, author, code)
    {
        filesUtil.unregisterOpChangeListeners([opName]);
        const newCode = super.updateOpCode(opName, author, code);
        setTimeout(() =>
        {
            filesUtil.registerOpChangeListeners([opName]);
        }, 1000);
        return newCode;
    }

    getOpNpmPackages(opName)
    {
        let toInstall = [];
        const opDoc = this._docsUtil.getDocForOp(opName);
        if (opDoc && opDoc.hasOwnProperty("dependencies"))
        {
            const npmDeps = opDoc.dependencies.filter((dep) => { return dep.type === "npm"; });
            npmDeps.forEach((npmDep) =>
            {
                const version = npmDep.version || "";
                if (npmDep.src)
                {
                    npmDep.src.forEach((src) =>
                    {
                        if (version)
                        {
                            src = src + "@" + version;
                        }
                        else
                        {
                            if (npmDep.name.includes("@")) src = npmDep.name;
                        }
                        if (!toInstall.includes(src))
                        {
                            toInstall.push(src);
                        }
                    });
                }
            });
        }
        return toInstall;
    }

    renameToCoreOp(oldName, newName, currentUser, removeOld, cb = null)
    {
        let oldOpDir = this.getOpSourceDir(oldName);
        let newOpDir = oldOpDir.replace(oldName, newName);
        return this._renameOp(oldName, newName, currentUser, true, removeOld, false, oldOpDir, newOpDir, cb);
    }

    renameToExtensionOp(oldName, newName, currentUser, removeOld, cb = null)
    {
        let oldOpDir = this.getOpSourceDir(oldName);
        let newOpDir = oldOpDir.replace(oldName, newName);
        return this._renameOp(oldName, newName, currentUser, true, removeOld, false, oldOpDir, newOpDir, cb);
    }

    renameToTeamOp(oldName, newName, currentUser, removeOld, cb = null)
    {
        let oldOpDir = this.getOpSourceDir(oldName);
        let newOpDir = oldOpDir.replace(oldName, newName);
        return this._renameOp(oldName, newName, currentUser, false, removeOld, false, oldOpDir, newOpDir, cb);
    }

    renameToUserOp(oldName, newName, currentUser, removeOld, cb = null)
    {
        let oldOpDir = this.getOpSourceDir(oldName);
        let newOpDir = oldOpDir.replace(oldName, newName);
        return this._renameOp(oldName, newName, currentUser, false, removeOld, false, oldOpDir, newOpDir, cb);
    }

    renameToPatchOp(oldName, newName, currentUser, removeOld, newId, cb = null)
    {
        let oldOpDir = this.getOpSourceDir(oldName);
        let newOpDir = oldOpDir.replace(oldName, newName);
        return this._renameOp(oldName, newName, currentUser, false, removeOld, newId, oldOpDir, newOpDir, cb);
    }

    getPatchOpNamespace(opName)
    {
        return this.getNamespace(opName);
    }

    getPatchOpsNamespaceForProject(proj)
    {
        return this.PREFIX_LOCAL_OPS;
    }

    userHasReadRightsOp(user, opName, teams = null, project = null, opOwner = null)
    {
        return true;
    }
}
export default new OpsUtil(utilProvider);
