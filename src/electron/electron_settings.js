import path from "path";
import fs from "fs";
import mkdirp from "mkdirp";
import { app } from "electron";
import helper from "../utils/helper_util.js";

class ElectronSettings
{
    constructor(storageDir)
    {
        if (storageDir && !fs.existsSync(storageDir))
        {
            mkdirp.sync(storageDir);
        }
        this.MAIN_CONFIG_NAME = "cables-standalone-preferences";
        this.PATCHFILE_FIELD = "patchFile";
        this.CURRENTPATCHDIR_FIELD = "currentPatchDir";
        this.PATCHID_FIELD = "patchId";
        this.STORAGEDIR_FIELD = "storageDir";
        this.WINDOW_X_POS_FIELD = "windowX";
        this.WINDOW_Y_POS_FIELD = "windowY";
        this.WINDOW_FULLSCREEN = "windowFullscreen";
        this.WINDOW_HEIGHT = "windowHeight";
        this.WINDOW_WIDTH = "windowWidth";
        this.BUILD_INFO_FIELD = "buildInfo";
        this.USER_SETTINGS = "userSettings";

        this.opts = {};
        this.opts.defaults = {};
        this.opts.configName = this.MAIN_CONFIG_NAME;
        this.opts.defaults[this.USER_SETTINGS] = {
            "introCompleted": true,
            "showTipps": false
        };
        this.opts.defaults[this.PATCHFILE_FIELD] = null;
        this.opts.defaults[this.CURRENTPATCHDIR_FIELD] = null;
        this.opts.defaults[this.PATCHID_FIELD] = null;
        this.opts.defaults[this.STORAGEDIR_FIELD] = storageDir;
        this.opts.defaults[this.BUILD_INFO_FIELD] = this.getBuildInfo();

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
            const userDataPath = path.join(this.data[this.STORAGEDIR_FIELD], this.opts.configName + ".json");
            const storedData = this._parseDataFile(userDataPath, this.opts.defaults);
            Object.keys(this.opts.defaults).forEach((key) =>
            {
                if (!storedData.hasOwnProperty(key)) storedData[key] = this.opts.defaults[key];
            });
            this.data = storedData;
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

    getCurrentProjectDir()
    {
        let value = this.get(this.CURRENTPATCHDIR_FIELD);
        if (value && !value.endsWith("/")) value += "/";
        return value;
    }

    setCurrentProjectDir(value)
    {
        if (value && !value.endsWith("/")) value += "/";
        this.set(this.CURRENTPATCHDIR_FIELD, value);
    }

    setCurrentProject(project)
    {
        this._currentProject = project;
        this.set(this.PATCHID_FIELD, project ? project._id : "");
    }

    getCurrentProject()
    {
        return this._currentProject;
    }

    loadProject(projectFile)
    {
        if (fs.existsSync(projectFile))
        {
            this.setProjectFile(projectFile);
            let patch = fs.readFileSync(projectFile);
            patch = JSON.parse(patch.toString("utf-8"));
            this.setCurrentProject(patch);
        }
    }

    getCurrentUser()
    {
        const username = "standalone";
        return {
            "username": username,
            "_id": helper.generateRandomId(),
            "profile_theme": "dark",
            "isStaff": false,
            "usernameLowercase": username.toLowerCase(),
            "isAdmin": false,
            "theme": "dark",
            "created": Date.now()
        };
    }

    setUserSettings(value)
    {
        this.set(this.USER_SETTINGS, value);
    }

    getProjectFile()
    {
        return this.get(this.PATCHFILE_FIELD);
    }

    setProjectFile(value)
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

    getBuildInfo()
    {
        const core = {
            "timestamp": 1700734919296,
            "created": "2023-11-23T10:21:59.296Z",
            "git": {
                "branch": "develop",
                "commit": "04f23fcd2b2830840ed0c62595104fc7c3d96ae3",
                "date": "2023-11-22T16:18:12.000Z",
                "message": "viztexture aspect ratio/color picking etc"
            }
        };
        let ui = {
            "timestamp": 1700746574919,
            "created": "2023-11-23T13:36:14.919Z",
            "git": {
                "branch": "develop",
                "commit": "7acf5719f001a0ec07034fbe4c0fdfe15946dd7b",
                "date": null,
                "message": null
            }
        };
        const api = {
            "timestamp": 1700748324495,
            "created": "2023-11-23T14:05:24.495Z",
            "git": {
                "branch": "master",
                "commit": "ac06849ffb3e594b368bd2f5a63bd6eed62ea1a9",
                "date": "2023-11-23T11:11:29.000Z",
                "message": "patreon api hotfixes"
            }
        };
        return {
            "updateWarning": false,
            "core": core,
            "ui": ui,
            "api": api
        };
    }

    // helper methods
    _parseDataFile(filePath, defaults)
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
export default new ElectronSettings(path.join(app.getPath("userData"), "settings"));

