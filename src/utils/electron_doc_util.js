import { BaseDocUtil } from "cables-shared";
import electronUtilProvider from "./electron_util_provider.js";

class ElectronDocUtil extends BaseDocUtil
{
    get utilName()
    {
        return electronUtilProvider.DOCS_UTIL_NAME;
    }
}
export default new ElectronDocUtil(electronUtilProvider);
