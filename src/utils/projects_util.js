import { SharedProjectsUtil, utilProvider } from "cables-shared-api";
import path from "path";
import sanitizeFileName from "sanitize-filename";
import { app } from "electron";
import pako from "pako";
import crypto from "crypto";
import jsonfile from "jsonfile";
import chokidar from "chokidar";
import fs from "fs";
import settings from "../electron/electron_settings.js";
import helper from "./helper_util.js";
import cables from "../cables.js";
import filesUtil from "./files_util.js";
import electronApp from "../electron/main.js";
import opsUtil from "./ops_util.js";

class ProjectsUtil extends SharedProjectsUtil
{
    constructor(provider)
    {
        super(provider);
        this.CABLES_PROJECT_FILE_EXTENSION = "cables";
        this.CABLES_STANDALONE_EXPORT_FILE_EXTENSION = "cables.json";

        this._opChangeWatcher = chokidar.watch([], {
            "ignored": /(^|[\/\\])\../,
            "ignorePermissionErrors": true
        });

        this._opChangeWatcher.on("change", (fileName) =>
        {
            const opName = opsUtil.getOpNameByAbsoluteFileName(fileName);
            if (opName)
            {
                electronApp.sendTalkerMessage("executeOp", { "name": opName });
            }
        });

        this._opChangeWatcher.on("unlink", (fileName) =>
        {
            const opName = opsUtil.getOpNameByAbsoluteFileName(fileName);
            if (opName)
            {
                electronApp.sendTalkerMessage("deleteOp", { "name": opName });
            }
        });

        this._assetChangeWatcher = chokidar.watch([], {
            "ignored": /(^|[\/\\])\../,
            "ignorePermissionErrors": true
        });

        this._assetChangeWatcher.on("change", (fileName) =>
        {
            electronApp.sendTalkerMessage("fileUpdated", { "filename": fileName });
        });

        this._assetChangeWatcher.on("unlink", (fileName) =>
        {
            electronApp.sendTalkerMessage("fileDeleted", { "fileName": fileName });
        });
    }

    getAssetPath(projectId)
    {
        return cables.getAssetPath();
    }

    getScreenShotPath(pId)
    {
        return path.join(app.getPath("userData"), "screenshots/");
    }

    getScreenShotFileName(proj, ext)
    {
        const screenShotPath = this.getScreenShotPath(proj.id);
        return path.join(screenShotPath, "/", filesUtil.realSanitizeFilename(proj.name) + "." + ext);
    }

    generateNewProject(owner)
    {
        const now = Date.now();
        const projectId = helper.generateRandomId();
        const shortId = helper.generateShortId(projectId, now);
        const randomize = settings.getUserSetting("randomizePatchName", false);
        const newProjectName = this.getNewProjectName(randomize);

        return {
            "_id": projectId,
            "shortId": shortId,
            "name": newProjectName,
            "description": "",
            "userId": owner._id,
            "cachedUsername": owner.username,
            "created": now,
            "updated": now,
            "visibility": "private",
            "ops": [],
            "settings": {
                "licence": "none"
            },
            "userList": [owner],
            "teams": [],
            "log": []
        };
    }

    getProjectOpDirs(project, includeOsDir = true, reverse = false)
    {
        const opsDirs = [];
        const projectOpDir = cables.getProjectOpsPath();
        if (projectOpDir) opsDirs.push(projectOpDir);
        if (project && project.dirs && project.dirs.ops)
        {
            const projectDir = settings.getCurrentProjectDir();
            project.dirs.ops.forEach((dir) =>
            {
                if (!path.isAbsolute(dir)) dir = path.join(projectDir, dir);
                opsDirs.push(dir);
            });
        }
        if (includeOsDir)
        {
            const osOpsDir = cables.getOsOpsDir();
            if (osOpsDir) opsDirs.push(osOpsDir);
        }
        if (reverse) return opsDirs.reverse();
        return opsDirs;
    }

    getProjectFileName(project)
    {
        return sanitizeFileName(project.name).replace(/ /g, "_") + ".".this._se;
    }

    writeProjectToFile(projectFile, project, patch = null)
    {
        if (!project.ops) project.ops = [];
        if (patch && (patch.data || patch.dataB64))
        {
            try
            {
                let buf = patch.data;
                if (patch.dataB64) buf = Buffer.from(patch.dataB64, "base64");

                const qData = JSON.parse(pako.inflate(buf, { "to": "string" }));

                if (qData.ops) project.ops = qData.ops;
                if (qData.ui) project.ui = qData.ui;
            }
            catch (e)
            {
                this._log.error("patch save error/invalid data", e);
                return;
            }
        }

        // filter imported ops, so we do not save these to the database
        project.ops = project.ops.filter((op) =>
        {
            return !(op.storage && op.storage.blueprint);
        });

        project.updated = Date.now();
        project.name = path.basename(projectFile, "." + this.CABLES_PROJECT_FILE_EXTENSION);
        project.summary = project.summary || {};
        project.summary.title = project.name;

        project.opsHash = crypto
            .createHash("sha1")
            .update(JSON.stringify(project.ops))
            .digest("hex");
        project.buildInfo = settings.getBuildInfo();
        return jsonfile.writeFileSync(projectFile, project);
    }

    registerAssetChangeListeners(project)
    {
        if (!project || !project.ops) return;
        const fileNames = this.getUsedAssetFilenames(project, true);
        this._assetChangeWatcher.add(fileNames);
    }

    registerOpChangeListeners(opNames)
    {
        if (!opNames) return;
        const fileNames = [];
        opNames.forEach((opName) =>
        {
            const opFile = opsUtil.getOpAbsoluteFileName(opName);
            if (opFile) fileNames.push(opFile);
        });
        this._opChangeWatcher.add(fileNames);
    }

    getUsedAssetFilenames(project, includeLibraryAssets = false)
    {
        const fileNames = [];
        if (!project || !project.ops) return [];
        const projectDir = settings.getCurrentProjectDir();
        const assetPorts = this.getProjectAssetPorts(project, includeLibraryAssets);
        let urls = assetPorts.map((assetPort) => { return assetPort.value; });
        urls.forEach((url) =>
        {
            if (url.startsWith("./"))
            {
                url = path.join(projectDir, url);
            }

            let fullPath = url;
            try
            {
                const parseUrl = new URL(url);
                fullPath = decodeURI(parseUrl.pathname);
            }
            catch (e)
            {
                this._log.debug("no url in assetport", fullPath);
            }
            if (fs.existsSync(fullPath))
            {
                fileNames.push(fullPath);
            }
            else
            {
                this._log.warn("missing file", fullPath);
            }
        });
        return helper.uniqueArray(fileNames);
    }
}
export default new ProjectsUtil(utilProvider);
