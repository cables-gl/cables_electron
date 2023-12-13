// hallo1234
import mkdirp from "mkdirp";
import fs from "fs-extra";
import path from "path";
import text from "../configs/text_en.js";

class Cables
{
    constructor()
    {
        this._log = console;
        this._dirname = new URL(".", import.meta.url).pathname;
        this.configLocation = null;

        this.text = text;
        this._config = this.getConfig();

        // creating needed empty directories...
        if (fs.existsSync("public/ui")) this._log.info("- no need for public/ui directory anymore!");
        if (!fs.existsSync("public/assets")) mkdirp.sync("public/assets");
        if (!fs.existsSync("public/assets/library")) mkdirp.sync("public/assets/library");
        if (!fs.existsSync("gen")) mkdirp.sync("gen");
        if (!fs.existsSync(this.getUserOpsPath())) mkdirp.sync(this.getUserOpsPath());
        if (!fs.existsSync(this.getTeamOpsPath())) mkdirp.sync(this.getTeamOpsPath());
        if (!fs.existsSync(this.getExtensionOpsPath())) mkdirp.sync(this.getExtensionOpsPath());
        if (!fs.existsSync(this.getPatchOpsPath())) mkdirp.sync(this.getPatchOpsPath());
        if (!fs.existsSync(this.getOpDocsCachePath())) mkdirp.sync(this.getOpDocsCachePath());
        if (!fs.existsSync(this.getFeedPath())) mkdirp.sync(this.getFeedPath());
        if (!fs.existsSync(this.getOpDocsFile())) fs.writeFileSync(this.getOpDocsFile(), JSON.stringify({}));
        if (!fs.existsSync(this.getOpLookupFile())) fs.writeFileSync(this.getOpLookupFile(), JSON.stringify({ "names": {}, "ids": {} }));

        mkdirp(this.getAssetPath());
        mkdirp(this.getLibsPath());
        mkdirp(this.getCoreLibsPath());
        mkdirp(this.getOpsPath());
        mkdirp(this.getPublicGenPath());

        const pjson = JSON.parse(fs.readFileSync(path.join(this.getSourcePath(), "../package.json")));
        if (pjson && pjson.engines && pjson.engines.node)
        {
            const wantedVersion = pjson.engines.node;
            if (process && process.versions && process.versions.node)
            {
                const runningVersion = process.versions.node;
                if (wantedVersion !== runningVersion)
                {
                    this._log.error("NODE VERSION MISMATCH, WANTED", wantedVersion, "GOT", runningVersion);
                }
            }
            else
            {
                this._log.warn("COULD NOT DETERMINE RUNNING NODE VERSION FROM process, WANTED VERSION IS", wantedVersion);
            }
        }
        else
        {
            this._log.warn("COULD NOT DETERMINE WANTED NODE VERSION FROM package.json");
        }
    }

    getConfig()
    {
        if (!this._config)
        {
            this.configLocation = "./cables.json";
            if (process.env.npm_config_apiconfig) this.configLocation = "./cables_env_" + process.env.npm_config_apiconfig + ".json";

            if (!fs.existsSync(this.configLocation))
            {
                try
                {
                    fs.copySync("cables_example.json", this.configLocation);
                }
                catch (err)
                {
                    this._log.error(err);
                }
            }

            this._config = JSON.parse(fs.readFileSync(this.configLocation, "utf-8"));
            this._config.maxFileSizeMb = this._config.maxFileSizeMb || 256;
        }
        return this._config;
    }


    getUserOpsPath()
    {
        if (!this._config.path.userops) return path.join(this.getOpsPath(), "/users/");
        return this._config.path.userops.startsWith("/") ? this._config.path.userops : path.join(this._dirname, this._config.path.userops);
    }

    getTeamOpsPath()
    {
        if (!this._config.path.teamops) return path.join(this.getOpsPath(), "/teams/");
        return this._config.path.teamops.startsWith("/") ? this._config.path.teamops : path.join(this._dirname, this._config.path.teamops);
    }

    getExtensionOpsPath()
    {
        if (!this._config.path.extensionops) return path.join(this.getOpsPath(), "/extensions/");
        return this._config.path.extensionops.startsWith("/") ? this._config.path.extensionops : path.join(this._dirname, this._config.path.extensionops);
    }

    getPatchOpsPath()
    {
        if (!this._config.path.patchops) return path.join(this.getOpsPath(), "/patches/");
        return this._config.path.patchops.startsWith("/") ? this._config.path.patchops : path.join(this._dirname, this._config.path.patchops);
    }

    getCoreOpsPath()
    {
        return path.join(this.getOpsPath(), "/base/");
    }


    getSourcePath()
    {
        return path.join(this._dirname);
    }

    getUiPath()
    {
        return path.join(this._dirname, "../../cables_ui/");
    }

    getUiDistPath()
    {
        return path.join(this.getUiPath(), "/dist/");
    }

    getOpsPath()
    {
        if (!this._config.path.ops) this._log.error("no path.ops found in cables.json!");

        return path.join(this._dirname, "/", this._config.path.ops);
    }

    getLibsPath()
    {
        if (!this._config.path.libs) this._log.error("no path.libs found in cables.json!");
        return path.join(this._dirname, "/", this._config.path.libs);
    }

    getCoreLibsPath()
    {
        if (!this._config.path.corelibs) this._log.error("no path.corelibs found in cables.json!");
        return path.join(this._dirname, "/", this._config.path.corelibs);
    }

    getPublicGenPath()
    {
        return path.join(this._dirname, "/../public/gen/");
    }

    getGenPath()
    {
        return path.join(this._dirname, "/../gen/");
    }

    getOpDocsFile()
    {
        return this.getPublicGenPath() + "opdocs.json";
    }

    getOpLookupFile()
    {
        return this.getPublicGenPath() + "oplookup.json";
    }

    getOpDocsCachePath()
    {
        return path.join(this.getGenPath(), "opdocs_collections/");
    }

    getFeedPath()
    {
        return path.join(this._dirname, "/../public/gen/feed/");
    }

    getPublicPath()
    {
        return path.join(this._dirname, "/../public/");
    }

    getApiPath()
    {
        return path.join(this._dirname, "/../");
    }

    getAssetPath()
    {
        let dirName = path.join(this._dirname, "/", this._config.path.assets);
        if (this._config.path.assets.startsWith("/")) dirName = this._config.path.assets;
        return dirName;
    }

    getViewsPath()
    {
        return path.join(this._dirname, "/../views/");
    }

    getElectronPath()
    {
        if (this._config.path.electron)
        {
            return path.join(this._dirname, this._config.path.electron);
        }
        return false;
    }

    getDocsMdPath()
    {
        if (this._config.path.docs_md)
        {
            return path.join(this.getSourcePath(), this._config.path.docs_md);
        }
        return false;
    }

    isLocal()
    {
        return this._config.url.includes("local");
    }

    isDevEnv()
    {
        return this._config.env === "dev";
    }

    isNightly()
    {
        return this._config.env === "nightly";
    }

    getEnv()
    {
        return this._config.env;
    }

    getEnvTitle()
    {
        return this.getEnv() === "live" ? "" : this.getEnv().toUpperCase() + " ";
    }

    getStaticMiddlewareOptions()
    {
        return {
            "maxAge": 60 * 60 * 1000,
            "setHeaders": (res, filePath) =>
            {
                if (filePath && filePath.endsWith(".splat"))
                {
                    res.setHeader("Content-Type", "binary/octet-stream");
                }
            }
        };
    }

    getAppInstanceNumber()
    {
        return process.env.NODE_APP_INSTANCE;
    }
}
export default new Cables();
