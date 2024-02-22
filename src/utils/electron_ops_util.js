import { BaseOpsUtil } from "cables-shared";
import electronUtilProvider from "./electron_util_provider.js";

class ElectronOpsUtil extends BaseOpsUtil
{
    get utilName()
    {
        return electronUtilProvider.OPS_UTIL_NAME;
    }

    addPermissionsToOps(ops, user, teams = [], project = null)
    {
        console.log("PERMS IN ELECTRON");
        if (!ops) return ops;
        ops.forEach((op) => { if (op) op.allowEdit = true; });
        return ops;
    }
}
export default new ElectronOpsUtil(electronUtilProvider);
