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
    getAssetPath()
    {
        const currentProject = store.getCurrentProjectDir();
        let assetPath = "";
        if (!currentProject)
        {
            assetPath = path.join(this._writeableDirName, "assets/");
        }
        else
        {
            assetPath = path.join(currentProject, "assets/");
        }
        if (!fs.existsSync(assetPath)) mkdirp.sync(assetPath);
        return assetPath;
    }

    getGenPath()
    {
        const currentProject = store.getCurrentProject();
        let genPath = "";
        if (!currentProject)
        {
            genPath = path.join(this._writeableDirName, "caches/");
        }
        else
        {
            genPath = path.join(this._writeableDirName, "/gen/", currentProject.shortId, "/");
        }
        if (!fs.existsSync(genPath)) mkdirp.sync(genPath);
        return genPath;
    }

    getOpDocsCachePath()
    {
        const cachePath = path.join(this.getGenPath(), "opdocs_collections/");
        if (!fs.existsSync(cachePath)) mkdirp.sync(cachePath);
        return cachePath;
    }

    getUserOpsPath()
    {
        if (!store.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/users/");
        return path.join(store.getCurrentProjectDir(), "/ops/users/");
    }

    getTeamOpsPath()
    {
        if (!store.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/teams/");
        return path.join(store.getCurrentProjectDir(), "/ops/teams/");
    }

    getPatchOpsPath()
    {
        if (!store.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/patches/");
        return path.join(store.getCurrentProjectDir(), "/ops/patches/");
    }
}
export default new CablesStandalone(utilProvider, decodeURIComponent(new URL(".", import.meta.url).pathname), app.getPath("userData"));
