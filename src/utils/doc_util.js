import { utilProvider, SharedDocUtil } from "cables-shared-api";
import fs from "fs";
import opsUtil from "./ops_util.js";
import projectsUtil from "./projects_util.js";
import helper from "./helper_util.js";

class DocUtil extends SharedDocUtil
{
    getDocForOp(opName, docs = null)
    {
        if (!opName) return null;
        if (!this._opsUtil.isOpNameValid(opName)) return null;

        if (!docs) docs = this.getOpDocs();
        for (let i = 0; i < docs.length; i++)
        {
            if (docs[i].name === opName)
            {
                return docs[i];
            }
        }

        const fromFile = this.getOpDocsFromFile(opName);
        if (fromFile) fromFile.name = opName;
        return fromFile;
    }

    getOpDocsInProjectDirs(project)
    {
        const projectOpDocs = [];
        if (!project) return projectOpDocs;
        const opNames = this._getOpNamesInProjectDirs(project);
        opNames.forEach((opName) =>
        {
            const opId = opsUtil.getOpIdByObjName(opName);
            if (opId)
            {
                projectOpDocs.push(this.getDocForOp(opName));
            }
        });
        this.addOpsToLookup(projectOpDocs);
        return projectOpDocs;
    }

    _getOpNamesInProjectDirs(project)
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
                    if (opsUtil.isOpNameValid(opName) && !opNames.includes(opName))
                    {
                        opNames.push(opName);
                    }
                }
            }
        });
        return helper.uniqueArray(opNames);
    }
}
export default new DocUtil(utilProvider);
