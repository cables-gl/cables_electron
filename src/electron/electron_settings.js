import path from "path";
import fs from "fs";
import mkdirp from "mkdirp";
import { app } from "electron";
import jsonfile from "jsonfile";
import helper from "../utils/helper_util.js";
import logger from "../utils/logger.js";
import projectsUtil from "../utils/projects_util.js";
import cables from "../cables.js";
import electronApp from "./main.js";
import opsUtil from "../utils/ops_util.js";
import filesUtil from "../utils/files_util.js";

class ElectronSettings
{
    constructor(storageDir)
    {
        this._log = logger;
        this.SESSION_PARTITION = "persist:cables:" + helper.generateUUID();

        if (storageDir && !fs.existsSync(storageDir))
        {
            mkdirp.sync(storageDir);
        }
        this.MAIN_CONFIG_NAME = "cables-electron-preferences";
        this.PATCHID_FIELD = "patchId";
        this.PATCHFILE_FIELD = "patchFile";
        this.CURRENTPATCHDIR_FIELD = "currentPatchDir";
        this.STORAGEDIR_FIELD = "storageDir";
        this.USER_SETTINGS_FIELD = "userSettings";
        this.RECENT_PROJECTS_FIELD = "recentProjects";
        this.OPEN_DEV_TOOLS_FIELD = "openDevTools";

        this.opts = {};
        this.opts.defaults = {};
        this.opts.configName = this.MAIN_CONFIG_NAME;
        this.opts.defaults[this.USER_SETTINGS_FIELD] = {
            "introCompleted": true,
            "showTipps": false
        };
        this.opts.defaults[this.PATCHID_FIELD] = null;
        this.opts.defaults[this.PATCHFILE_FIELD] = null;
        this.opts.defaults[this.CURRENTPATCHDIR_FIELD] = null;
        this.opts.defaults[this.STORAGEDIR_FIELD] = storageDir;
        this.opts.defaults[this.RECENT_PROJECTS_FIELD] = {};
        this.opts.defaults[this.OPEN_DEV_TOOLS_FIELD] = false;

        this.data = this.opts.defaults;
        mkdirp(this.data[this.STORAGEDIR_FIELD]);
        this.refresh();
        this.set("currentUser", this.getCurrentUser(), true);
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

    getCurrentProject()
    {
        return this._currentProject;
    }

    loadProject(projectFile, newProject = null, onStartup = false)
    {
        let project = newProject;
        if (projectFile)
        {
            if (fs.existsSync(projectFile))
            {
                this._setCurrentProjectFile(projectFile);
                this._setCurrentProjectDir(path.dirname(projectFile));
                project = fs.readFileSync(projectFile);
                project = JSON.parse(project.toString("utf-8"));
                this._setCurrentProject(projectFile, project);
                filesUtil.registerAssetChangeListeners(project);
                if (project.ops)
                {
                    const opNames = [];
                    project.ops.forEach((op) =>
                    {
                        const opName = opsUtil.getOpNameById(op.opId);
                        if (opName)
                        {
                            opNames.push(opsUtil.getOpAbsoluteFileName(opName));
                        }
                    });
                    filesUtil.registerOpChangeListeners(opNames);
                }
            }
        }
        else
        {
            this._setCurrentProjectFile(null);
            this._setCurrentProjectDir(null);
            this._setCurrentProject(null, project);
        }
        this._updateRecentProjects();
        if (!onStartup)
        {
            if (project)
            {
                electronApp.editorWindow.webContents.send("talkerMessage", { "cmd": "updatePatchName", "data": { "name": project.name } });
                electronApp.editorWindow.webContents.send("talkerMessage", { "cmd": "updatePatchSummary", "data": project.summary });
            }
        }
    }

    getCurrentUser()
    {
        const username = "electron";
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
        this.set(this.USER_SETTINGS_FIELD, value);
    }

    getUserSetting(key, defaultValue = null)
    {
        const userSettings = this.get(this.USER_SETTINGS_FIELD);
        if (!userSettings) return defaultValue;
        if (!userSettings.hasOwnProperty(key)) return defaultValue;
        return userSettings[key];
    }

    getCurrentProjectFile()
    {
        return this.get(this.PATCHFILE_FIELD);
    }

    getBuildInfo()
    {
        const coreFile = path.join(cables.getUiDistPath(), "js", "buildinfo.json");
        const uiFile = path.join(cables.getUiDistPath(), "buildinfo.json");
        const standaloneFile = path.join(cables.getStandaloneDistPath(), "public", "js", "buildinfo.json");
        let core = {};
        if (fs.existsSync(coreFile))
        {
            try
            {
                core = jsonfile.readFileSync(coreFile);
            }
            catch (e)
            {
                this._log.info("failed to parse buildinfo from", coreFile);
            }
        }

        let ui = {};
        if (fs.existsSync(uiFile))
        {
            try
            {
                ui = jsonfile.readFileSync(uiFile);
            }
            catch (e)
            {
                this._log.info("failed to parse buildinfo from", uiFile);
            }
        }

        let api = {};
        if (fs.existsSync(standaloneFile))
        {
            try
            {
                api = jsonfile.readFileSync(standaloneFile);
            }
            catch (e)
            {
                this._log.info("failed to parse buildinfo from", standaloneFile);
            }
        }

        this.set("buildInfo", {
            "updateWarning": false,
            "core": core,
            "ui": ui,
            "api": api
        });

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

    getRecentProjects()
    {
        return this.get(this.RECENT_PROJECTS_FIELD) || {};
    }

    setRecentProjects(recents)
    {
        if (!recents) recents = {};
        return this.set(this.RECENT_PROJECTS_FIELD, recents);
    }

    replaceInRecentPatches(oldFile, newFile, newProject)
    {
        const recents = this.getRecentProjects();
        recents[newFile] = newProject;
        delete recents[oldFile];
        this._updateRecentProjects();
        return this.getRecentProjects();
    }

    _updateRecentProjects()
    {
        const recents = this.getRecentProjects();
        let files = Object.keys(recents);
        files = files.filter((f) => { return fs.existsSync(f); });
        files = files.sort((f1, f2) =>
        {
            const p1 = recents[f1];
            const p2 = recents[f2];
            if (!p1.updated) return 1;
            if (!p2.updated) return -1;
            return p2.updated - p1.updated;
        });
        files = helper.uniqueArray(files);
        const newRecents = {};
        for (let i = 0; i < 10; i++)
        {
            if (i > files.length) break;
            const key = files[i];
            if (recents.hasOwnProperty(key))
            {
                try
                {
                    const project = jsonfile.readFileSync(key);
                    newRecents[key] = this._toRecentProjectInfo(project);
                }
                catch (e)
                {
                    this._log.info("failed to parse project file for recent projects, ignoring", key);
                }
            }
        }
        this.set(this.RECENT_PROJECTS_FIELD, newRecents);
    }

    _setCurrentProjectFile(value)
    {
        this.set(this.PATCHFILE_FIELD, value);
    }

    _toRecentProjectInfo(project)
    {
        if (!project) return null;
        return {
            "_id": project._id,
            "shortId": project.shortId,
            "name": project.name,
            "thumbnail": project.thumbnail,
            "created": project.created,
            "updated": project.updated
        };
    }

    _setCurrentProjectDir(value)
    {
        if (value && !value.endsWith("/")) value += "/";
        this.set(this.CURRENTPATCHDIR_FIELD, value);
    }

    _setCurrentProject(projectFile, project)
    {
        this._currentProject = project;
        if (project) this.set(this.PATCHID_FIELD, project._id);
        const recentProjects = this.getRecentProjects();
        if (projectFile && project)
        {
            const projectName = path.basename(projectFile);
            if (project.name !== projectName)
            {
                project.name = projectName;
                project.summary = project.summary || {};
                project.summary.title = project.name;
                projectsUtil.writeProjectToFile(projectFile, project);
            }
            if (!recentProjects.hasOwnProperty(projectFile))
            {
                const recent = this._toRecentProjectInfo(project);
                if (recent) recentProjects[projectFile] = recent;
                this.setRecentProjects(recentProjects);
            }
        }
        this._updateRecentProjects();
        electronApp.updateTitle();
    }

    reloadProject()
    {
        this.loadProject(this.getCurrentProjectFile());
    }
}
export default new ElectronSettings(path.join(app.getPath("userData"), "settings"));

