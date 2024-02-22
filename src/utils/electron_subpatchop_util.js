import { BaseSubPatchOpUtil } from "cables-shared";
import electronUtilProvider from "./electron_util_provider.js";

class ElectronSubPatchOpUtil extends BaseSubPatchOpUtil
{
    get utilName()
    {
        return electronUtilProvider.SUBPATCH_OP_UTIL_NAME;
    }
}

export default new ElectronSubPatchOpUtil(electronUtilProvider);
