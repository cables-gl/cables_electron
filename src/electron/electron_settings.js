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

class ElectronSettings
{
    constructor(storageDir)
    {
        this._log = logger;
        this.SESSION_PARTITION = "persist:cables:standalone";

        if (storageDir && !fs.existsSync(storageDir))
        {
            mkdirp.sync(storageDir);
        }
        this.MAIN_CONFIG_NAME = "cables-electron-preferences";
        this.PATCHID_FIELD = "patchId";
        this.PROJECTFILE_FIELD = "patchFile";
        this.CURRENTPROJECTDIR_FIELD = "currentPatchDir";
        this.STORAGEDIR_FIELD = "storageDir";
        this.USER_SETTINGS_FIELD = "userSettings";
        this.RECENT_PROJECTS_FIELD = "recentProjects";
        this.OPEN_DEV_TOOLS_FIELD = "openDevTools";
        this.WINDOW_ZOOM_FACTOR = "windowZoomFactor";
        this.WINDOW_BOUNDS = "windowBounds";
        this.DOWNLOAD_PATH = "downloadPath";

        this.opts = Object.create(null);
        this.opts.defaults = Object.create(null);
        this.opts.configName = this.MAIN_CONFIG_NAME;
        this.opts.defaults[this.USER_SETTINGS_FIELD] = Object.create(null);
        this.opts.defaults[this.PATCHID_FIELD] = null;
        this.opts.defaults[this.PROJECTFILE_FIELD] = null;
        this.opts.defaults[this.CURRENTPROJECTDIR_FIELD] = null;
        this.opts.defaults[this.STORAGEDIR_FIELD] = storageDir;
        this.opts.defaults[this.RECENT_PROJECTS_FIELD] = Object.create(null);
        this.opts.defaults[this.OPEN_DEV_TOOLS_FIELD] = false;
        this.opts.defaults[this.DOWNLOAD_PATH] = app.getPath("downloads");

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
            this.data.paths = {
                "home": app.getPath("home"),
                "appData": app.getPath("appData"),
                "userData": app.getPath("userData"),
                "sessionData": app.getPath("sessionData"),
                "temp": app.getPath("temp"),
                "exe": app.getPath("exe"),
                "module": app.getPath("module"),
                "desktop": app.getPath("desktop"),
                "documents": app.getPath("documents"),
                "downloads": app.getPath("downloads"),
                "music": app.getPath("music"),
                "pictures": app.getPath("pictures"),
                "videos": app.getPath("videos"),
                "logs": app.getPath("logs"),
                "crashDumps": app.getPath("crashDumps"),
            };
            const dir = this.get(this.CURRENTPROJECTDIR_FIELD);
            const id = this.get(this.PATCHID_FIELD);
            if (dir && id)
            {
                this.data.paths.assetPath = path.join(dir, "assets", id, "/");
            }
            else if (id)
            {
                this.data.paths.assetPath = path.join(".", "assets", id, "/");
            }
            if (process.platform === "win32")
            {
                this.data.paths.recent = app.getPath("recent");
            }
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
        let value = this.get(this.CURRENTPROJECTDIR_FIELD);
        if (value && !value.endsWith("/")) value = path.join(value, "/");
        return value;
    }

    getCurrentProject()
    {
        return this._currentProject;
    }


    setProject(projectFile, newProject)
    {
        let projectDir = null;
        if (projectFile) projectDir = path.dirname(projectFile);
        this._setCurrentProjectFile(projectFile);
        this._setCurrentProjectDir(projectDir);
        this._setCurrentProject(projectFile, newProject);
        this.addToRecentProjects(projectFile, newProject);
    }

    getCurrentUser()
    {
        let username = this.getUserSetting("authorName", "") || "";
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
        const projectFile = this.get(this.PROJECTFILE_FIELD);
        if (projectFile && projectFile.endsWith(projectsUtil.CABLES_PROJECT_FILE_EXTENSION)) return projectFile;
        return null;
    }

    getBuildInfo()
    {
        const coreFile = path.join(cables.getUiDistPath(), "js", "buildinfo.json");
        const uiFile = path.join(cables.getUiDistPath(), "buildinfo.json");
        const standaloneFile = path.join(cables.getStandaloneDistPath(), "public", "js", "buildinfo.json");
        let core = Object.create(null);
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

        let ui = Object.create(null);
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

        let api = Object.create(null);
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
        const recentProjects = this.get(this.RECENT_PROJECTS_FIELD) || {};
        return Object.values(recentProjects);
    }

    getRecentProjectFile(projectId)
    {
        const recentProjects = this.get(this.RECENT_PROJECTS_FIELD) || {};
        for (const file in recentProjects)
        {
            const recent = recentProjects[file];
            if (recent && (recent._id === projectId || recent.shortId === projectId))
            {
                if (fs.existsSync(file)) return file;
            }
        }
        return null;
    }

    setRecentProjects(recents)
    {
        if (!recents) recents = Object.create(null);
        return this.set(this.RECENT_PROJECTS_FIELD, recents);
    }

    replaceInRecentProjects(oldFile, newFile, newProject)
    {
        const recents = this.get(this.RECENT_PROJECTS_FIELD) || {};
        recents[newFile] = this._toRecentProjectInfo(newProject);
        delete recents[oldFile];
        this._updateRecentProjects();
        return this.getRecentProjects();
    }

    _updateRecentProjects()
    {
        const recents = this.get(this.RECENT_PROJECTS_FIELD) || {};


        let files = Object.keys(recents);
        files = files.filter((f) => { return fs.existsSync(f); });
        files = files.sort((f1, f2) =>
        {
            const p1 = recents[f1];
            const p2 = recents[f2];
            if (!p1 || !p1.updated) return 1;
            if (!p2 || !p2.updated) return -1;
            return p2.updated - p1.updated;
        });
        files = helper.uniqueArray(files);
        const newRecents = Object.create(null);
        for (let i = 0; i < 10; i++)
        {
            if (i > files.length) break;
            const key = files[i];
            if (key)
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
        this.setRecentProjects(newRecents);
    }

    _setCurrentProjectFile(value)
    {
        this.set(this.PROJECTFILE_FIELD, value);
    }

    _toRecentProjectInfo(project)
    {
        if (!project) return null;
        return {
            "_id": project._id,
            "shortId": project.shortId,
            "name": project.name,
            "screenshot": project.screenshot,
            "created": project.created,
            "updated": project.updated
        };
    }

    _setCurrentProjectDir(value)
    {
        if (value) value = path.join(value, "/");
        this.set(this.CURRENTPROJECTDIR_FIELD, value);
    }

    _setCurrentProject(projectFile, project)
    {
        this._currentProject = project;
        projectsUtil.invalidateProjectCaches();
        if (project)
        {
            this.set(this.PATCHID_FIELD, project._id);
        }
        if (projectFile && project)
        {
            const projectName = path.basename(projectFile, "." + projectsUtil.CABLES_PROJECT_FILE_EXTENSION);
            if (project.name !== projectName)
            {
                project.name = projectName;
                project.summary = project.summary || {};
                project.summary.title = project.name;
                projectsUtil.writeProjectToFile(projectFile, project);
            }
            this._updateRecentProjects();
        }

        electronApp.updateTitle();
    }

    addToRecentProjects(projectFile, project)
    {
        if (!projectFile || !project) return;
        app.addRecentDocument(projectFile);
        const recentProjects = this.get(this.RECENT_PROJECTS_FIELD) || {};
        const recent = this._toRecentProjectInfo(project);
        if (recent) recentProjects[projectFile] = recent;
        this.setRecentProjects(recentProjects);
        this._updateRecentProjects();
    }

    getProjectFromFile(projectFile)
    {
        if (!projectFile || !fs.existsSync(projectFile)) return null;
        const project = fs.readFileSync(projectFile);
        try
        {
            return JSON.parse(project.toString("utf-8"));
        }
        catch (e)
        {
            this._log.error("failed to parse project from projectfile", projectFile, e);
        }
        return null;
    }

    getDownloadPath()
    {
        const customDownloadPath = this.get(this.DOWNLOAD_PATH);
        return customDownloadPath || app.getPath("downloads");
    }
}
export default new ElectronSettings(path.join(app.getPath("userData")));

