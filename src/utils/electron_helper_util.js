import moment from "moment";
import { BaseHelperUtil } from "cables-shared";
import electronUtilProvider from "./electron_util_provider.js";

class ElectronHelperUtil extends BaseHelperUtil
{
    get utilName()
    {
        return electronUtilProvider.HELPER_UTIL_NAME;
    }
}

export default new ElectronHelperUtil(electronUtilProvider);
