// eslint-disable-next-line import/no-extraneous-dependencies
import { app } from "electron";

import path from "path";
import fs from "fs";
import mkdirp from "mkdirp";
import jsonfile from "jsonfile";
import { sync as writeFileSync } from "write-file-atomic";
import helper from "../utils/helper_util.js";
import logger from "../utils/logger.js";
import projectsUtil from "../utils/projects_util.js";
import cables from "../cables.js";
import electronApp from "./main.js";

/**
 * @typedef ElectronSettings
 * @param {any} defaults
 * @param {string} configName
 *
 */
class ElectronSettings
{

    #MAIN_CONFIG_NAME = "cables-electron-preferences";
    #PATCHID_FIELD = "patchId";
    #PROJECTFILE_FIELD = "patchFile";
    #CURRENTPROJECTDIR_FIELD = "currentPatchDir";
    #STORAGEDIR_FIELD = "storageDir";
    #USER_SETTINGS_FIELD = "userSettings";
    #RECENT_PROJECTS_FIELD = "recentProjects";
    #OPEN_DEV_TOOLS_FIELD = "openDevTools";
    #DOWNLOAD_PATH = "downloadPath";
    #OP_DIRS_FIELD = "opDirectories";
    #WINDOW_BOUNDS = "windowBounds";
    #WINDOW_ZOOM_FACTOR = "windowZoomFactor";

    /** @type ElectronSettings */
    #opts = { "defaults": {} };

    #data = {};
    #temporaryData = {};
    #settingsFile = {};

    #log = logger;

    constructor(storageDir)
    {

        this.SESSION_PARTITION = "persist:cables:standalone";

        if (storageDir && !fs.existsSync(storageDir))
        {
            mkdirp.sync(storageDir);
        }

        this.#opts.configName = this.#MAIN_CONFIG_NAME;

        this.#opts.defaults[this.#USER_SETTINGS_FIELD] = {};
        this.#opts.defaults[this.#PATCHID_FIELD] = null;
        this.#opts.defaults[this.#PROJECTFILE_FIELD] = null;
        this.#opts.defaults[this.#CURRENTPROJECTDIR_FIELD] = null;
        this.#opts.defaults[this.#STORAGEDIR_FIELD] = storageDir;
        this.#opts.defaults[this.#RECENT_PROJECTS_FIELD] = {};
        this.#opts.defaults[this.#OP_DIRS_FIELD] = [];

        this.#opts.defaults[this.#OPEN_DEV_TOOLS_FIELD] = false;
        this.#opts.defaults[this.#DOWNLOAD_PATH] = app.getPath("downloads");

        this.#data = this.#opts.defaults;
        this.#settingsFile = path.join(this.#data[this.#STORAGEDIR_FIELD], this.#opts.configName + ".json");

        this.refresh();
        this.set("currentUser", this.getCurrentUser(), true);
    }

    refresh()
    {
        if (this.#data && this.#data.hasOwnProperty(this.#STORAGEDIR_FIELD) && this.#data[this.#STORAGEDIR_FIELD])
        {
            const storedData = this._parseDataFile(this.#settingsFile, { ...this.#opts.defaults });
            Object.keys(this.#opts.defaults).forEach((key) =>
            {
                if (!storedData.hasOwnProperty(key)) storedData[key] = this.#opts.defaults[key];
            });
            // temporary values are not in the file, keep them in memory
            Object.assign(storedData, this.#temporaryData);
            this.#data = storedData;
            this.#data.paths = {
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
                "crashDumps": app.getPath("crashDumps")
            };
            const dir = this.get(this.#CURRENTPROJECTDIR_FIELD);
            const id = this.get(this.#PATCHID_FIELD);
            if (dir && id)
            {
                this.#data.paths.assetPath = path.join(dir, "assets", id, "/");
                this.#data.paths.patchPath = path.join(dir, "/");
            }
            else if (id)
            {
                this.#data.paths.assetPath = path.join(".", "assets", id, "/");
            }
            if (process.platform === "win32")
            {
                this.#data.paths.recent = app.getPath("recent");
            }
        }
    }

    getAll() {
        return this.#data;
    }

    get(key, defaultValue = null)
    {
        if (!this.#data)
        {
            return defaultValue;
        }
        return this.#data.hasOwnProperty(key) ? this.#data[key] : defaultValue;
    }

    /**
     *
     * @param {String} key
     * @param {Any} val
     * @param {Boolean} [temporary=false]
     */
    set(key, val, temporary = false)
    {
        this.#data[key] = val;
        if (temporary)
        {
            // only this session, never written to the file
            this.#temporaryData[key] = val;
            return;
        }
        delete this.#temporaryData[key];

        let storedData = this._parseDataFile(this.#settingsFile, null);
        if (!storedData || typeof storedData !== "object") storedData = this.#getPersistentData();
        storedData[key] = val;
        delete storedData.paths;

        writeFileSync(this.#settingsFile, JSON.stringify(storedData));
        this.refresh();
    }

    /**
     * settings from memory without temporary values and computed paths
     *
     * @returns {Object}
     */
    #getPersistentData()
    {
        const data = { ...this.#data };
        Object.keys(this.#temporaryData).forEach((key) => {
            delete data[key];
        });
        delete data.paths;
        return data;
    }

    /**
     *
     * @returns {String|null}
     */
    getCurrentProjectDir()
    {
        let value = this.get(this.#CURRENTPROJECTDIR_FIELD);
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
        this.set(this.#USER_SETTINGS_FIELD, value);
    }

    getUserSetting(key, defaultValue = null)
    {
        const userSettings = this.get(this.#USER_SETTINGS_FIELD);
        if (!userSettings) return defaultValue;
        if (!userSettings.hasOwnProperty(key)) return defaultValue;
        return userSettings[key];
    }

    /**
     *
     * @returns {Object}
     */
    getUserSettings() {
        return this.get(this.#USER_SETTINGS_FIELD, {})
    }

    getCurrentProjectFile()
    {
        const projectFile = this.get(this.#PROJECTFILE_FIELD);
        if (projectFile && projectFile.endsWith(projectsUtil.CABLES_PROJECT_FILE_EXTENSION)) return projectFile;
        return null;
    }

    getBuildInfo()
    {
        const coreFile = path.join(cables.getUiDistPath(), "js", "buildinfo.json");
        const uiFile = path.join(cables.getUiDistPath(), "buildinfo.json");
        const electronFile = path.join(cables.getDistPath(), "public", "js", "buildinfo.json");
        let core = {};
        if (fs.existsSync(coreFile))
        {
            try
            {
                core = jsonfile.readFileSync(coreFile);
            }
            catch (e)
            {
                this.#log.info("failed to parse buildinfo from", coreFile);
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
                this.#log.info("failed to parse buildinfo from", uiFile);
            }
        }

        let api = {};
        if (fs.existsSync(electronFile))
        {
            try
            {
                api = jsonfile.readFileSync(electronFile);
            }
            catch (e)
            {
                this.#log.info("failed to parse buildinfo from", electronFile);
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
            this.#log.info("failed to find/parse usersettings, setting defaults", error);
            return defaults;
        }
    }

    getRecentProjects()
    {
        const recentProjects = this.get(this.#RECENT_PROJECTS_FIELD) || {};
        return Object.values(recentProjects);
    }

    getRecentProjectFile(projectId)
    {
        const recentProjects = this.get(this.#RECENT_PROJECTS_FIELD) || {};
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
        if (!recents) recents = {};
        return this.set(this.#RECENT_PROJECTS_FIELD, recents);
    }

    replaceInRecentProjects(oldFile, newFile, newProject)
    {
        const recents = this.get(this.#RECENT_PROJECTS_FIELD) || {};
        recents[newFile] = this._toRecentProjectInfo(newProject);
        delete recents[oldFile];
        this._updateRecentProjects();
        return this.getRecentProjects();
    }

    _updateRecentProjects()
    {
        const recents = this.get(this.#RECENT_PROJECTS_FIELD) || {};

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
        const newRecents = {};
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
                    this.#log.info("failed to parse project file for recent projects, ignoring", key);
                }
            }
        }
        this.setRecentProjects(newRecents);
    }

    _setCurrentProjectFile(value)
    {
        this.set(this.#PROJECTFILE_FIELD, value);
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
        this.set(this.#CURRENTPROJECTDIR_FIELD, value);
    }

    _setCurrentProject(projectFile, project)
    {
        this._currentProject = project;
        projectsUtil.invalidateProjectCaches();
        if (project)
        {
            this.set(this.#PATCHID_FIELD, project._id);
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
        const recentProjects = this.get(this.#RECENT_PROJECTS_FIELD) || {};
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
            this.#log.error("failed to parse project from projectfile", projectFile, e);
        }
        return null;
    }

    getDownloadPath()
    {
        const customDownloadPath = this.get(this.#DOWNLOAD_PATH);
        return customDownloadPath || app.getPath("downloads");
    }

    /**
     *
     * @returns {Boolean}
     */
    getOpenDevTools() {
        return !!this.get(this.#OPEN_DEV_TOOLS_FIELD, false);
    }

    /**
     *
     * @param {Boolean} value
     */
    setOpenDevTools(value) {
        this.set(this.#OPEN_DEV_TOOLS_FIELD, !!value);
    }

    /**
     *
     * @returns {Object<String, Object>}
     */
    getWindowBounds() {
        return this.get(this.#WINDOW_BOUNDS, {});
    }

    /**
     *
     * @param {Object<String, Object>} value
     */
    setWindowBounds(value) {
        this.set(this.#WINDOW_BOUNDS, value)
    }

    /**
     *
     * @returns {Number}
     */
    getWindowZoomFactor() {
        return this.get(this.#WINDOW_ZOOM_FACTOR, 1.0);
    }

    /**
     *
     * @param {Number} value
     */
    setWindowZoomFactor(value) {
        this.set(this.#WINDOW_ZOOM_FACTOR, value)
    }


    /**
     *
     * @returns {String[]}
     */
    getOpDirs()
    {
        return this.get(this.#OP_DIRS_FIELD, []);
    }

    /**
     *
     * @param {String} opDir
     * @param {Boolean} [atTop=false]
     * @returns {String[]}
     */
    addOpDir(opDir, atTop = false)
    {
        let dirs = this.get(this.#OP_DIRS_FIELD, []);
        if (atTop)
        {
            dirs.unshift(opDir);
        }
        else
        {
            dirs.push(opDir);
        }
        dirs = helper.uniqueArray(dirs);
        this.set(this.#OP_DIRS_FIELD, dirs);
        projectsUtil.invalidateProjectCaches(opDir, atTop);
        return dirs;
    }

    /**
     *
     * @param {String} opDir
     * @returns {String[]}
     */
    removeOpDir(opDir)
    {
        let dirs = this.get(this.#OP_DIRS_FIELD, []);
        dirs = dirs.filter((dirName) =>
        {
            return dirName !== opDir;
        });
        dirs = helper.uniqueArray(dirs);
        this.set(this.#OP_DIRS_FIELD, dirs);
        projectsUtil.invalidateProjectCaches(opDir);
        return dirs;
    }

    /**
     *
     * @param {String[]} orderedOpDirs
     * @returns {String[]}
     */
    reorderOpDirs(orderedOpDirs)
    {
        let newOrder = [];
        orderedOpDirs.forEach((opDir) =>
        {
            if (fs.existsSync(opDir)) newOrder.push(opDir);
        });

        // fixed dirs (patch, os, core) are not stored in the settings
        let dirs = newOrder.filter((dir) => { return !this.isFixedOpDir(dir); });
        dirs = helper.uniqueArray(dirs);
        this.set(this.#OP_DIRS_FIELD, dirs);
        projectsUtil.invalidateProjectCaches();
        return dirs;
    }

    /**
     *
     * @param {String} dir
     * @returns {Boolean}
     */
    isFixedOpDir(dir)
    {
        const projectDir = this.getCurrentProjectDir();
        if (projectDir) if (dir === path.join(projectDir, "ops")) return true;
        if (dir === "./ops") return true;
        if (dir === cables.getOsOpsDir()) return true;
        if (cables.isPackaged()) return false;
        if (dir === cables.getExtensionOpsPath()) return true;
        return dir === cables.getCoreOpsPath();
    }
}
export default new ElectronSettings(path.join(app.getPath("userData")));
