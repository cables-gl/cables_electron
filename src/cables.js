// hallo1234
import { utilProvider, Cables } from "cables-shared";
import { app } from "electron";
import path from "path";
import fs from "fs";
import mkdirp from "mkdirp";
import logger from "./utils/logger.js";
import store from "./electron/electron_store.js";

logger.info("starting up cables");

class CablesStandalone extends Cables
{
    getGenPath()
    {
        if (!store.getCurrentPatchDir()) return path.join(this._writeableDirName, "caches/");
        return path.join(store.getCurrentPatchDir(), "caches/");
    }

    getOpDocsCachePath()
    {
        const cachePath = path.join(this.getGenPath(), "opdocs_collections/");
        if (!fs.existsSync(cachePath)) mkdirp.sync(cachePath);
        return cachePath;
    }

    getUserOpsPath()
    {
        if (!store.getCurrentPatchDir()) return path.join(this.getOpsPath(), "/users/");
        return path.join(store.getCurrentPatchDir(), "/ops/users/");
    }

    getTeamOpsPath()
    {
        if (!store.getCurrentPatchDir()) return path.join(this.getOpsPath(), "/teams/");
        return path.join(store.getCurrentPatchDir(), "/ops/teams/");
    }

    getExtensionOpsPath()
    {
        if (!store.getCurrentPatchDir()) return path.join(this.getOpsPath(), "/extensions/");
        return path.join(store.getCurrentPatchDir(), "/ops/extensions/");
    }

    getPatchOpsPath()
    {
        if (!store.getCurrentPatchDir()) return path.join(this.getOpsPath(), "/patches/");
        return path.join(store.getCurrentPatchDir(), "/ops/patches/");
    }
}
export default new CablesStandalone(utilProvider, decodeURIComponent(new URL(".", import.meta.url).pathname), app.getPath("userData"));
