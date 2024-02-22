// hallo1234
import { Cables } from "cables-shared";
import { app } from "electron";
import electronUtilProvider from "./utils/electron_util_provider.js";
import logger from "./utils/electron_logger.js";

logger.info("starting up cables");
class CablesStandalone extends Cables
{
    get utilName()
    {
        return electronUtilProvider.CABLES_NAME;
    }
}
export default new CablesStandalone(electronUtilProvider, decodeURIComponent(new URL(".", import.meta.url).pathname), app.getPath("userData"));
