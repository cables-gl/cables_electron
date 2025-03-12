import fs from "fs";
import archiver from "archiver";
import { SharedExportService } from "cables-shared-api";
import path from "path";
import settings from "../electron/electron_settings.js";
import electronApp from "../electron/main.js";
import helper from "../utils/helper_util.js";

export default class HtmlExportElectron extends SharedExportService
{
    constructor(provider, _exportOptions, user)
    {
        super(provider, {}, user);
        this.archive = archiver.create("zip", {});

        this.options.logLevel = "info";
        this.options.hideMadeWithCables = true;
        this.options.combineJs = false;
        this.options.minify = false;
        this.options.handleAssets = "auto";
        this.options.rewriteAssetPorts = true;
        this.options.flattenAssetNames = true;

        this.finalAssetPath = "assets/";
    }

    static getName()
    {
        return "html";
    }

    static getExportOptions(user, teams, project, exportQuota)
    {
        return {
            "type": this.getName(),
            "allowed": true,
            "possible": true,
            "fields": {}
        };
    }

    doExport(projectId, cb)
    {
        this.collectFiles(
            projectId,
            this.createZip.bind(this),
            (collectErr, callbackError) =>
            {
                callbackError({ "msg": collectErr });
            },
            this.options,
            cb
        );
    }

    /* private */
    createZip(project, files, callbackFinished)
    {
        const zipFileName = this.getExportFileName(project);
        const zipPath = this.getExportTargetPath(project);
        const finalZipFileName = path.join(zipPath, zipFileName);

        if (fs.existsSync(zipPath))
        {
            this._doZip(files, finalZipFileName, (result) =>
            {
                const fileUrl = helper.pathToFileURL(finalZipFileName);
                result.url = fileUrl;
                this.addLog("saved file to <a onclick=\"CABLES.CMD.ELECTRON.openFileManager('" + fileUrl + "');\">" + finalZipFileName + "</a>");
                callbackFinished(result);
            });
        }
        else
        {
            electronApp.exportProjectFileDialog(zipFileName).then((chosenFileName) =>
            {
                if (chosenFileName)
                {
                    this._doZip(files, chosenFileName, (result) =>
                    {
                        const fileUrl = helper.pathToFileURL(finalZipFileName);
                        result.url = fileUrl;
                        this.addLog("saved file to <a onclick=\"CABLES.CMD.ELECTRON.openFileManager('" + fileUrl + "');\">" + finalZipFileName + "</a>");
                        callbackFinished(result);
                    });
                }
                else
                {
                    const outputErr = "no export directory chosen";
                    const result = { "error": outputErr };
                    callbackFinished(result);
                }
            });
        }
    }

    collectFiles(_projectId, callbackFilesCollected, callbackError, options, next)
    {
        const project = settings.getCurrentProject();
        this._log.info("...export");
        if (project)
        {
            options.handleAssets = options.handleAssets || "auto";
            this._exportProject(
                project,
                callbackFilesCollected,
                callbackError,
                options,
                next
            );
        }
        else
        {
            const err2 = "PROJECT_NOT_FOUND";
            callbackError(err2, (serviceResult) =>
            {
                next(serviceResult.msg, serviceResult);
            });
        }
    }

    getExportTargetPath(project)
    {
        return settings.getDownloadPath();
    }

    _getFilesForProjects(theProjects, options, cb)
    {
        const user = settings.getCurrentUser();
        if (!theProjects)
        {
            cb([]);
            return;
        }
        const theFiles = [];
        theProjects.forEach((project) =>
        {
            const assetFilenames = this._projectsUtil.getUsedAssetFilenames(project, true);
            assetFilenames.forEach((fileName) =>
            {
                const fileDb = this._filesUtil.getFileDb(fileName, user, project);
                theFiles.push(fileDb);
            });
        });
        cb(theFiles);
    }

    _doAfterExport(originalProject)
    {
        return originalProject;
    }

    _getNameForZipEntry(fn, allFiles)
    {
        if (fn.substr(0, 1) === "/") fn = fn.substr(1);
        let fnNew = path.basename(fn);
        if (this.options.flattenAssetNames)
        {
            fnNew = fnNew.replaceAll("/", "_");
        }
        let assetDir = this.finalAssetPath;
        if (allFiles.includes(fnNew))
        {
            fnNew = path.join(this._helperUtil.generateUUID(), fnNew);
        }
        return path.join(assetDir, fnNew);
    }

    _getPortValueReplacement(filePathAndName, fn, lzipFileName)
    {
        return lzipFileName.replace(path.win32.sep, path.posix.sep);
    }

    _doAfterCombine(jsCode, options)
    {
        return jsCode;
    }
}
