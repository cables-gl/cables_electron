import { utilProvider, SharedOpsUtil } from "cables-shared-api";

class OpsUtil extends SharedOpsUtil
{
    addPermissionsToOps(ops, user, teams = [], project = null)
    {
        if (!ops) return ops;
        ops.forEach((op) => { if (op) op.allowEdit = true; });
        return ops;
    }

    userHasWriteRightsOp(user, opName, teams = [], project = null)
    {
        return true;
    }
}
export default new OpsUtil(utilProvider);
