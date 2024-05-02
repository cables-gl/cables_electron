import { utilProvider, SharedDocUtil } from "cables-shared-api";
import fs from "fs";
import path from "path";
import cables from "../cables.js";
import helper from "./helper_util.js";
import opsUtil from "./ops_util.js";

class DocUtil extends SharedDocUtil
{
    getOpDocsInProjectDir()
    {
        const dir = cables.getProjectOpsPath();
        const opDocs = [];
        if (fs.existsSync(dir))
        {
            const jsonFiles = helper.getFilesRecursive(dir, ".json");
            Object.keys(jsonFiles).forEach((jsonFile) =>
            {
                const basename = path.basename(jsonFile, ".json");
                if (opsUtil.isOpNameValid(basename))
                {
                    try
                    {
                        const opJson = JSON.parse(jsonFiles[jsonFile].toString());
                        opJson.objName = basename;
                        opJson.opId = opJson.id;
                        opJson.name = basename;
                        opDocs.push(opJson);
                    }
                    catch (e) {}
                }
            });
        }
        return opDocs;
    }
}
export default new DocUtil(utilProvider);
