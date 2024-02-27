import path from "path";
import fs from "fs";
import mkdirp from "mkdirp";
import { app } from "electron";

class ElectronStore
{
    constructor(storageDir)
    {
        if (storageDir && !fs.existsSync(storageDir))
        {
            mkdirp.sync(storageDir);
        }
        this.MAIN_CONFIG_NAME = "cables-standalone-preferences";
        this.APIKEY_FIELD = "apiKey";
        this.PATCHFILE_FIELD = "patchFile";
        this.CURRENTPATCHDIR_FIELD = "currentPatchDir";
        this.STORAGEDIR_FIELD = "storageDir";
        this.WINDOW_X_POS_FIELD = "windowX";
        this.WINDOW_Y_POS_FIELD = "windowY";
        this.WINDOW_FULLSCREEN = "windowFullscreen";
        this.WINDOW_HEIGHT = "windowHeight";
        this.WINDOW_WIDTH = "windowWidth";

        this.USER_SETTINGS = "userSettings";

        this.opts = {};
        this.opts.defaults = {};
        this.opts.configName = this.MAIN_CONFIG_NAME;
        this.opts.defaults[this.USER_SETTINGS] = {
            "introCompleted": true,
            "showTipps": false
        };
        this.opts.defaults[this.APIKEY_FIELD] = null;
        this.opts.defaults[this.PATCHFILE_FIELD] = null;
        this.opts.defaults[this.CURRENTPATCHDIR_FIELD] = null;
        this.opts.defaults[this.STORAGEDIR_FIELD] = storageDir;

        this.opts.defaults[this.WINDOW_X_POS_FIELD] = null;
        this.opts.defaults[this.WINDOW_Y_POS_FIELD] = null;
        this.opts.defaults[this.WINDOW_FULLSCREEN] = false;
        this.opts.defaults[this.WINDOW_HEIGHT] = 768;
        this.opts.defaults[this.WINDOW_WIDTH] = 1366;

        this.data = this.opts.defaults;
        mkdirp(this.data[this.STORAGEDIR_FIELD]);
        this.refresh();
    }

    refresh()
    {
        if (this.data && this.data.hasOwnProperty(this.STORAGEDIR_FIELD) && this.data[this.STORAGEDIR_FIELD])
        {
            console.log(this.STORAGEDIR_FIELD, this.data[this.STORAGEDIR_FIELD], this.opts.configName + ".json");
            const userDataPath = path.join(this.data[this.STORAGEDIR_FIELD], this.opts.configName + ".json");
            this.data = ElectronStore.parseDataFile(userDataPath, this.opts.defaults);
        }
    }

    get(key)
    {
        if (!this.data)
        {
            return null;
        }
        return this.data[key];
    }

    set(key, val, silent)
    {
        this.data[key] = val;
        let configFileName = path.join(this.data[this.STORAGEDIR_FIELD], this.opts.configName + ".json");
        if (!silent)
        {
            fs.writeFileSync(configFileName, JSON.stringify(this.data));
            this.refresh();
        }
    }

    // convenience methods
    getApiKey()
    {
        return this.get(this.APIKEY_FIELD);
    }

    setApiKey(value)
    {
        this.set(this.APIKEY_FIELD, value);
    }

    getCurrentPatchDir()
    {
        let value = this.get(this.CURRENTPATCHDIR_FIELD);
        if (value && !value.endsWith("/")) value += "/";
        return value;
    }

    setCurrentPatchDir(value)
    {
        if (value && !value.endsWith("/")) value += "/";
        this.set(this.CURRENTPATCHDIR_FIELD, value);
    }

    setUserSettings(value)
    {
        this.set(this.USER_SETTINGS, value);
    }

    getStorageDir()
    {
        return this.get(this.STORAGEDIR_FIELD);
    }

    setStorageDir(value)
    {
        this.set(this.STORAGEDIR_FIELD, value, true);
    }

    getPatchFile()
    {
        return this.get(this.PATCHFILE_FIELD);
    }

    setPatchFile(value)
    {
        this.set(this.PATCHFILE_FIELD, value);
    }

    getWindowXPos()
    {
        return this.get(this.WINDOW_X_POS_FIELD);
    }

    setWindowXPos(value)
    {
        this.set(this.WINDOW_X_POS_FIELD, value);
    }

    getWindowYPos()
    {
        return this.get(this.WINDOW_Y_POS_FIELD);
    }

    setWindowYPos(value)
    {
        this.set(this.WINDOW_Y_POS_FIELD, value);
    }

    getFullscreen()
    {
        return this.get(this.WINDOW_FULLSCREEN);
    }

    setFullscreen(value)
    {
        this.set(this.WINDOW_FULLSCREEN, value);
    }

    getWindowHeight()
    {
        return this.get(this.WINDOW_HEIGHT);
    }

    setWindowHeight(value)
    {
        this.set(this.WINDOW_HEIGHT, value);
    }

    getWindowWidth()
    {
        return this.get(this.WINDOW_WIDTH);
    }

    setWindowWidth(value)
    {
        this.set(this.WINDOW_WIDTH, value);
    }

    // helper methods
    static parseDataFile(filePath, defaults)
    {
        try
        {
            let jsonContent = fs.readFileSync(filePath);
            return JSON.parse(jsonContent);
        }
        catch (error)
        {
            return defaults;
        }
    }
}
export default new ElectronStore(path.join(app.getPath("userData"), "settings"));

