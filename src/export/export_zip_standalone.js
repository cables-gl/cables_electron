import fs from "fs";
import archiver from "archiver";
import sanitizeFileName from "sanitize-filename";
import { SharedExportService } from "cables-shared-api";
import path from "path";
import settings from "../electron/electron_settings.js";
import electronApp from "../electron/main.js";

export default class StandaloneZipExport extends SharedExportService
{
    constructor(provider)
    {
        super(provider, {});
        this.archive = archiver.create("zip", {});

        this.options.hideMadeWithCables = true;
        this.options.combineJs = false;
        this.options.skipBackups = true;
        this.options.minify = false;
        this.options.handleAssets = "auto";
        this.options.rewriteAssetPorts = true;
        this.options.flattenAssetNames = true;

        this.finalAssetPath = "/assets/";
    }

    static getName()
    {
        return "zip";
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
        const projectNameVer = sanitizeFileName(project.name).replace(/ /g, "_") + project.exports;
        const zipFileName = "cables_" + sanitizeFileName(projectNameVer) + ".zip";
        electronApp.exportProjectFileDialog(zipFileName).then((finalZipFileName) =>
        {
            if (finalZipFileName)
            {
                const output = fs.createWriteStream(finalZipFileName);
                this._log.info("finalZipFileName", finalZipFileName);
                output.on("close", () =>
                {
                    this._log.info("exported file " + finalZipFileName + " / " + this.archive.pointer() / 1000000.0 + " mb");

                    const result = {};
                    result.size = this.archive.pointer() / 1000000.0;
                    result.path = finalZipFileName;
                    result.log = this.exportLog;
                    callbackFinished(result);
                });

                output.on("error", (outputErr) =>
                {
                    this._log.error("export error", outputErr);
                    const result = { "error": outputErr };
                    callbackFinished(result);
                });

                this._log.info("finalize archive...", (Date.now() - this.startTimeExport) / 1000);

                for (const [filename, content] of Object.entries(files))
                {
                    const options = { "name": filename };
                    if (filename === "/patch.app/Contents/MacOS/Electron")
                    {
                        options.mode = 0o777;
                    }
                    this.archive.append(content, options);
                }

                this.archive.pipe(output);
                this.archive.finalize();
            }
            else
            {
                const outputErr = "no export directory chosen";
                this._log.error("export error", outputErr);
                const result = { "error": outputErr };
                callbackFinished(result);
            }
        });
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

    _resolveFileName(filePathAndName, pathStr, project)
    {
        return this._helperUtil.fileURLToPath(filePathAndName, true);
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
        return lzipFileName;
    }

    _doAfterCombine(jsCode, options)
    {
        return jsCode;
    }
}
