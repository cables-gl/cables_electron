// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from "electron";
import { utilProvider, Cables } from "cables-shared-api";
import path from "path";
import fs from "fs";
import mkdirp from "mkdirp";
import { fileURLToPath } from "url";
import settings from "./electron/electron_settings.js";

class CablesElectron extends Cables
{
    constructor(provider, dirName, writableDirName, configLocation)
    {
        super(provider, dirName, writableDirName, configLocation);
        this._config.isPackaged = app.isPackaged;
        this._config.uiIndexHtml = path.join(this.getUiDistPath(), "index.html");
        if (writableDirName && !fs.existsSync(path.join(writableDirName, "/ops"))) mkdirp.sync(path.join(writableDirName, "/ops"));
    }

    isElectron()
    {
        return true;
    }

    getCommunityUrl()
    {
        return this._config.communityUrl;
    }

    isPackaged()
    {
        return this._config.isPackaged;
    }

    sendErrorReports()
    {
        return this._config.isPackaged || this._config.forceSendErrorReports;
    }

    inPackage(filePath)
    {
        if (!filePath) return false;
        if (!this.isPackaged()) return false;
        return filePath.startsWith(this._cables.getOpsPath());
    }

    getPackagedPath()
    {
        return this.getOpsPath();
    }

    getDistPath()
    {
        if (this._config.path.standaloneDist)
        {
            return path.join(this._dirname, this._config.path.standaloneDist);
        }
        return path.join(this.getApiPath(), "dist");
    }

    getAssetPath()
    {
        const currentProjectDir = settings.getCurrentProjectDir();
        let assetPath = "";
        if (!currentProjectDir)
        {
            assetPath = path.join(this._writeableDirName, "assets/");
        }
        else
        {
            assetPath = path.join(currentProjectDir);
        }
        if (!fs.existsSync(assetPath)) mkdirp.sync(assetPath);
        return assetPath;
    }

    getAssetLibraryPath()
    {
        if (!this._config.path.assets) path.join(this.getPublicPath(), "assets/library/");
        return this._config.path.assets.startsWith("/") ? this._config.path.assets : path.join(this._dirname, this._config.path.assets, "library/");
    }

    getExportAssetTargetPath()
    {
        return "";
    }

    getGenPath()
    {
        const genPath = path.join(this._writeableDirName, "gen/");
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
        if (!settings.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/", this.USER_OPS_SUBDIR);
        return path.join(settings.getCurrentProjectDir(), "/ops/", this.USER_OPS_SUBDIR);
    }

    getTeamOpsPath()
    {
        if (!settings.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/", this.TEAM_OPS_SUBDIR);
        return path.join(settings.getCurrentProjectDir(), "/ops/", this.TEAM_OPS_SUBDIR);
    }

    getPatchOpsPath()
    {
        if (!settings.getCurrentProjectDir()) return path.join(this.getOpsPath(), "/", this.PATCH_OPS_SUBDIR);
        return path.join(settings.getCurrentProjectDir(), "/ops/", this.PATCH_OPS_SUBDIR);
    }

    getProjectOpsPath(create = false)
    {
        if (!settings.getCurrentProjectDir()) return null;
        const opsPath = path.join(settings.getCurrentProjectDir(), "/ops/");
        if (create && !fs.existsSync(opsPath)) mkdirp.sync(opsPath);
        return opsPath;
    }

    getOsOpsDir()
    {
        return path.join(app.getPath("userData"), "ops/");
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

const metaUrl = new URL(".", import.meta.url);
const __dirname = fileURLToPath(metaUrl.href);
const customConfig = process.env.npm_config_apiconfig;
let configLocation = path.resolve(__dirname, "..", "cables.json");
if (customConfig)
{
    configLocation = "../cables_env_" + process.env.npm_config_apiconfig + ".json";
    configLocation = path.join(__dirname, configLocation);
    if (!fs.existsSync(configLocation))
    {
        console.error("custom config set to ", configLocation, "but file does not exists, do you need to run `npm run build`?");
        process.exit(1);
    }
}
export default new CablesElectron(utilProvider, __dirname, app.getPath("userData"), configLocation);
