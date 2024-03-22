// hallo1234
import { utilProvider, Cables } from "cables-shared-api";
import { app } from "electron";
import path from "path";
import fs from "fs";
import mkdirp from "mkdirp";
import { fileURLToPath } from "url";
import logger from "./utils/logger.js";
import settings from "./electron/electron_settings.js";

logger.info("starting up cables");

class CablesStandalone extends Cables
{
    getAssetPath()
    {
        const currentProject = settings.getCurrentProjectDir();
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

    getAssetLibraryPath()
    {
        return path.join(this.getPublicPath(), "assets/library");
    }

    getGenPath()
    {
        const currentProject = settings.getCurrentProject();
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
        if (!settings.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/users/");
        return path.join(settings.getCurrentProjectDir(), "/ops/users/");
    }

    getTeamOpsPath()
    {
        if (!settings.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/teams/");
        return path.join(settings.getCurrentProjectDir(), "/ops/teams/");
    }

    getPatchOpsPath()
    {
        if (!settings.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/patches/");
        return path.join(settings.getCurrentProjectDir(), "/ops/patches/");
    }

    getProjectOpsPath()
    {
        if (!settings.getCurrentProjectDir()) return path.join(this.getOpsPath());
        return path.join(settings.getCurrentProjectDir(), "/ops/");
    }

    _createDirectories()
    {
        if (!fs.existsSync(this.getGenPath())) mkdirp.sync(this.getGenPath());
        if (!fs.existsSync(this.getOpDocsCachePath())) mkdirp.sync(this.getOpDocsCachePath());
        if (!fs.existsSync(this.getOpDocsFile()))
        {
            if (!fs.existsSync(this.getOpDocsFile())) fs.writeFileSync(this.getOpDocsFile(), JSON.stringify({ "generated": Date.now(), "opDocs": [] }));
        }
        if (!fs.existsSync(this.getOpLookupFile())) fs.writeFileSync(this.getOpLookupFile(), JSON.stringify({ "names": {}, "ids": {} }));
    }
}
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const customConfig = process.env.npm_config_apiconfig;
let configLocation = null;
if (customConfig)
{
    configLocation = "../cables_env_" + process.env.npm_config_apiconfig + ".json";
    configLocation = path.join(__dirname, configLocation);
    if (!fs.existsSync(configLocation))
    {
        logger.error("custom config set to ", configLocation, "but file does not exists, do you need to run `npm run build`?");
        process.exit(1);
    }
}
export default new CablesStandalone(utilProvider, __dirname, app.getPath("userData"), configLocation);
