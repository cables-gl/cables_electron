import fs from "fs";
import archiver from "archiver";
import sanitizeFileName from "sanitize-filename";
import { SharedExportService } from "cables-shared-api";
import projectsUtil from "../utils/projects_util.js";
import settings from "../electron/electron_settings.js";
import electronApp from "../electron/main.js";

export default class StandaloneZipExport extends SharedExportService
{
    constructor(provider, req)
    {
        super(provider, req);
        this.archive = archiver.create("zip", {});
    }

    static getName()
    {
        return "download";
    }

    static getExportOptions(user, teams, project, exportQuota)
    {
        const allowed = true;
        let possible = true;
        if (exportQuota && exportQuota.overQuota) possible = false;
        return {
            "type": this.getName(),
            "allowed": allowed,
            "possible": possible,
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
        electronApp.exportProjectFileDialog().then((finalZipFileName) =>
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
                    const exportUrl = projectsUtil.getAssetPathUrl(project._id) + "/_exports/";

                    result.path = exportUrl + zipFileName;
                    result.urls = {
                        "downloadUrl": exportUrl + encodeURIComponent(zipFileName)
                    };
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
        cb([]);
    }

    _doAfterExport(originalProject)
    {
    }
}
