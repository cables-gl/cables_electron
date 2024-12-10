import { SharedDocUtil, utilProvider } from "cables-shared-api";
import fs from "fs";
import path from "path";
import jsonfile from "jsonfile";
import opsUtil from "./ops_util.js";
import helper from "./helper_util.js";
import cables from "../cables.js";

class DocUtil extends SharedDocUtil
{
    getDocForOp(opName, docs = null)
    {
        if (!opName) return null;
        if (!this._opsUtil.isOpNameValid(opName)) return null;

        const fromFile = this.getOpDocsFromFile(opName);
        if (fromFile) fromFile.name = opName;
        return fromFile;
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
