import { SharedDocUtil, utilProvider } from "cables-shared-api";
import fs from "fs";
import path from "path";
import jsonfile from "jsonfile";
import opsUtil from "./ops_util.js";
import projectsUtil from "./projects_util.js";
import helper from "./helper_util.js";
import cables from "../cables.js";

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
        const opDocs = {};
        const opDirs = projectsUtil.getProjectOpDirs(project);
        opDirs.forEach((opDir) =>
        {
            if (fs.existsSync(opDir))
            {
                const opJsons = helper.getFilesRecursive(opDir, ".json");
                for (let jsonPath in opJsons)
                {
                    const opName = path.basename(jsonPath, ".json");
                    if (opsUtil.isOpNameValid(opName))
                    {
                        if (opDocs.hasOwnProperty(opName))
                        {
                            if (!opDocs[opName].hasOwnProperty("overrides")) opDocs[opName].overrides = [];
                            opDocs[opName].overrides.push(path.join(opDir, path.dirname(jsonPath)));
                        }
                        else
                        {
                            try
                            {
                                const opDoc = jsonfile.readFileSync(path.join(opDir, jsonPath));
                                opDoc.name = opName;
                                opDocs[opName] = opDoc;
                            }
                            catch (e)
                            {
                                this._log.warn("failed to parse opdocs for", opName, "from", jsonPath);
                            }
                        }
                    }
                }
            }
        });
        const projectOpDocs = Object.values(opDocs);
        this.addOpsToLookup(projectOpDocs);
        return projectOpDocs;
    }

    getOpDocsInDir(opDir)
    {
        const opDocs = [];
        if (fs.existsSync(opDir))
        {
            const opJsons = helper.getFilesRecursive(opDir, ".json");
            for (let jsonPath in opJsons)
            {
                const opName = path.basename(jsonPath, ".json");
                if (opsUtil.isOpNameValid(opName))
                {
                    try
                    {
                        const opDoc = jsonfile.readFileSync(path.join(opDir, jsonPath));
                        opDoc.name = opName;
                        opDocs[jsonPath] = opDoc;
                    }
                    catch (e)
                    {
                        this._log.warn("failed to parse opdocs for", opName, "from", jsonPath);
                    }
                }
            }
        }
        return opDocs;
    }

    makeReadable(opDocs)
    {
        const readables = super.makeReadable(opDocs);
        readables.forEach((opDoc) =>
        {
            const relativeDir = opsUtil.getOpSourceDir(opDoc.name, true);
            const absolute = opsUtil.getOpSourceDir(opDoc.name);
            const opDir = absolute.replace(relativeDir, "");
            if (opDir !== cables.getOpsPath())
            {
                opDoc.opDir = opDir;
            }
            opDoc.opDirFull = absolute;
        });
        return readables;
    }
}
export default new DocUtil(utilProvider);
