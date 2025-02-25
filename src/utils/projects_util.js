import { SharedProjectsUtil, utilProvider } from "cables-shared-api";
import path from "path";
import sanitizeFileName from "sanitize-filename";
import { app } from "electron";
import pako from "pako";
import crypto from "crypto";
import jsonfile from "jsonfile";
import fs from "fs";
import settings from "../electron/electron_settings.js";
import helper from "./helper_util.js";
import cables from "../cables.js";
import filesUtil from "./files_util.js";
import opsUtil from "./ops_util.js";

class ProjectsUtil extends SharedProjectsUtil
{
    constructor(provider)
    {
        super(provider);
        this.CABLES_PROJECT_FILE_EXTENSION = "cables";

        this._dirInfos = null;
        this._projectOpDocs = null;
    }

    getAssetPath(projectId)
    {
        return cables.getAssetPath();
    }

    getAssetPathUrl(projectId)
    {
        return "./assets/";
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
        if (!owner) owner = settings.getCurrentUser();
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

    getNewProjectName(randomize = false)
    {
        return "untitled";
    }

    getProjectOpDirs(project, includeOsDir = true, reverse = false, addLocalCoreIfPackaged = true)
    {
        let opsDirs = [];

        const projectDir = settings.getCurrentProjectDir();
        if (projectDir)
        {
            const currentDir = path.join(projectDir, "ops");
            opsDirs.push(currentDir);
        }

        if (project && project.dirs && project.dirs.ops)
        {
            project.dirs.ops.forEach((dir) =>
            {
                if (projectDir && !path.isAbsolute(dir)) dir = path.join(projectDir, dir);
                opsDirs.push(dir);
            });
        }
        if (includeOsDir)
        {
            const osOpsDir = cables.getOsOpsDir();
            if (osOpsDir) opsDirs.push(osOpsDir);
        }
        if (addLocalCoreIfPackaged && !cables.isPackaged())
        {
            opsDirs.push(cables.getExtensionOpsPath());
            opsDirs.push(cables.getCoreOpsPath());
        }
        opsDirs = helper.uniqueArray(opsDirs);
        if (reverse) return opsDirs.reverse();
        return opsDirs;
    }

    isFixedPositionOpDir(dir)
    {
        const projectDir = settings.getCurrentProjectDir();
        if (projectDir) if (dir === path.join(projectDir, "ops/")) return false;
        if (dir === "./ops") return true;
        if (dir === cables.getOsOpsDir()) return true;
        if (cables.isPackaged()) return false;
        if (dir === cables.getExtensionOpsPath()) return true;
        return dir === cables.getCoreOpsPath();
    }

    getProjectFileName(project)
    {
        return sanitizeFileName(project.name).replace(/ /g, "_") + "." + this.CABLES_PROJECT_FILE_EXTENSION;
    }

    writeProjectToFile(projectFile, project = null, patch = null)
    {
        if (!project) project = this.generateNewProject();
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

        project.name = path.basename(projectFile, "." + this.CABLES_PROJECT_FILE_EXTENSION);
        project.summary = project.summary || {};
        project.summary.title = project.name;

        project.opsHash = crypto
            .createHash("sha1")
            .update(JSON.stringify(project.ops))
            .digest("hex");
        project.buildInfo = settings.getBuildInfo();
        jsonfile.writeFileSync(projectFile, project, { "encoding": "utf-8", "spaces": 4 });
        settings.addToRecentProjects(projectFile, project);
    }

    getUsedAssetFilenames(project, includeLibraryAssets = false)
    {
        const fileNames = [];
        if (!project || !project.ops) return [];
        const assetPorts = this.getProjectAssetPorts(project, includeLibraryAssets);
        let urls = assetPorts.map((assetPort) => { return helper.pathToFileURL(assetPort.value, true); });
        urls.forEach((url) =>
        {
            let fullPath = helper.fileURLToPath(url, true);
            if (fullPath && fs.existsSync(fullPath))
            {
                fileNames.push(fullPath);
            }
        });
        return helper.uniqueArray(fileNames);
    }

    addOpDir(project, opDir, atTop = false)
    {
        if (!project.dirs) project.dirs = {};
        if (!project.dirs.ops) project.dirs.ops = [];
        if (atTop)
        {
            project.dirs.ops.unshift(opDir);
        }
        else
        {
            project.dirs.ops.push(opDir);
        }
        project.dirs.ops = helper.uniqueArray(project.dirs.ops);
        this.invalidateProjectCaches(opDir, atTop);
        return project;
    }

    removeOpDir(project, opDir)
    {
        if (!project.dirs) project.dirs = {};
        if (!project.dirs.ops) project.dirs.ops = [];
        project.dirs.ops = project.dirs.ops.filter((dirName) =>
        {
            return dirName !== opDir;
        });
        project.dirs.ops = helper.uniqueArray(project.dirs.ops);
        this.invalidateProjectCaches(opDir);
        return project;
    }

    getSummary(project)
    {
        if (!project) return {};
        return {
            "allowEdit": true,
            "title": project.name,
            "owner": settings.getCurrentUser(),
            "description": project.description,
            "licence": {
                "name": "No licence chosen"
            }
        };
    }

    getOpDirs(currentProject)
    {
        const dirs = this.getProjectOpDirs(currentProject, true);
        const dirInfos = [];

        dirs.forEach((dir) =>
        {
            const opJsons = helper.getFileNamesRecursive(dir, ".json");
            const opLocations = {};
            opJsons.forEach((jsonLocation) =>
            {
                const jsonName = path.basename(jsonLocation, ".json");
                if (opsUtil.isOpNameValid(jsonName) && !opLocations.hasOwnProperty(jsonName))
                {
                    opLocations[jsonName] = path.dirname(path.join(dir, jsonLocation));
                }
            });
            const opNames = Object.keys(opLocations);

            dirInfos.push({
                "dir": dir,
                "opLocations": opLocations,
                "numOps": opNames.length,
                "fixedPlace": this.isFixedPositionOpDir(dir)
            });
        });
        return dirInfos;
    }

    reorderOpDirs(currentProject, order)
    {
        const currentProjectFile = settings.getCurrentProjectFile();
        const newOrder = [];
        order.forEach((opDir) =>
        {
            if (fs.existsSync(opDir)) newOrder.push(opDir);
        });
        if (!currentProject.dirs) currentProject.dirs = {};
        if (!currentProject.dirs.ops) currentProject.dirs.ops = [];
        currentProject.dirs.ops = newOrder.filter((dir) => { return !this.isFixedPositionOpDir(dir); });
        currentProject.dirs.ops = helper.uniqueArray(currentProject.dirs.ops);
        this.writeProjectToFile(currentProjectFile, currentProject);
        this.invalidateProjectCaches();
        return currentProject;
    }

    getAbsoluteOpDirFromHierarchy(opName)
    {
        const currentProject = settings.getCurrentProject();
        if (!this._dirInfos)
        {
            this._log.debug("rebuilding opdir-cache, changed by:", opName);
            this._dirInfos = this.getOpDirs(currentProject);
        }
        if (!this._dirInfos) return this._opsUtil.getOpSourceNoHierarchy(opName);

        for (let i = 0; i < this._dirInfos.length; i++)
        {
            const dirInfo = this._dirInfos[i];
            const opNames = dirInfo.opLocations ? Object.keys(dirInfo.opLocations) : [];
            if (opNames.includes(opName))
            {
                return dirInfo.opLocations[opName];
            }
        }
        return this._opsUtil.getOpSourceNoHierarchy(opName);
    }

    invalidateProjectCaches()
    {
        this._dirInfos = null;
        this._projectOpDocs = null;
    }

    getOpDocsInProjectDirs(project, rebuildCache = false)
    {
        if (this._projectOpDocs && !rebuildCache) return this._projectOpDocs;

        const opDocs = {};
        const opDirs = this.getProjectOpDirs(project, true, false, false);

        opDirs.forEach((opDir) =>
        {
            if (fs.existsSync(opDir))
            {
                const opJsons = helper.getFilesRecursive(opDir, ".json");
                for (let jsonPath in opJsons)
                {
                    const opName = path.basename(jsonPath, ".json");
                    if (opsUtil.isOpNameValid(opName))
                    {
                        if (opDocs.hasOwnProperty(opName))
                        {
                            if (!opDocs[opName].hasOwnProperty("overrides")) opDocs[opName].overrides = [];
                            opDocs[opName].overrides.push(path.join(opDir, path.dirname(jsonPath)));
                        }
                        else
                        {
                            try
                            {
                                const opDoc = jsonfile.readFileSync(path.join(opDir, jsonPath));
                                opDoc.name = opName;
                                opDocs[opName] = opDoc;
                            }
                            catch (e)
                            {
                                this._log.warn("failed to parse opDoc for", opName, "from", jsonPath);
                            }
                        }
                    }
                }
            }
        });
        this._projectOpDocs = Object.values(opDocs);
        this._docsUtil.addOpsToLookup(this._projectOpDocs);
        return this._projectOpDocs;
    }
}
export default new ProjectsUtil(utilProvider);
