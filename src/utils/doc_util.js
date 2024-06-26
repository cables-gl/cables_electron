import { utilProvider, SharedDocUtil } from "cables-shared-api";
import opsUtil from "./ops_util.js";

class DocUtil extends SharedDocUtil
{
    getOpDocsInProjectDirs(project)
    {
        const projectOpDocs = [];
        if (!project) return projectOpDocs;
        const opNames = opsUtil.getOpNamesInProjectDirs(project);
        opNames.forEach((opName) =>
        {
            const opId = opsUtil.getOpIdByObjName(opName);
            if (opId)
            {
                projectOpDocs.push(this.getDocForOp(opName));
            }
        });
        return projectOpDocs;
    }

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
}
export default new DocUtil(utilProvider);
