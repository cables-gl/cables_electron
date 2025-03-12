import sanitizeFileName from "sanitize-filename";
import path from "path";
import { fileURLToPath } from "url";
import HtmlExportElectron from "./export_html_electron.js";

export default class PatchExportElectron extends HtmlExportElectron
{
    constructor(provider, _exportOptions, user)
    {
        super(provider, {}, user);

        this.options.combineJS = false;
        this.options.addOpCode = true;
        this.options.removeIndexHtml = true;
        this.options.rewriteAssetPorts = true;
        this.options.flattenAssetNames = false;
        this.options.handleAssets = "auto";
        this.options.assetsInSubdirs = true;

        this.finalAssetPath = "assets/";
        this.finalJsPath = "/";
    }

    static getName()
    {
        return "patch";
    }

    _replaceInString(replacements, theString)
    {
        return theString;
    }

    _addProjectHtmlCode(proj, options, libs, coreLibs, template = "/patchview/patchview_export.html")
    {
        const projectName = sanitizeFileName(proj.name).replace(/ /g, "_");
        const projectNameVer = projectName + proj.exports;
        this.append(JSON.stringify(proj), { "name": projectNameVer + ".cables" });
    }

    _getOpExportSubdir(opName)
    {
        return path.join("ops", this._opsUtil.getOpTargetDir(opName, true));
    }

    _resolveFileName(filePathAndName, pathStr, project)
    {
        let result = filePathAndName || "";
        if (result.startsWith("file:/")) result = fileURLToPath(filePathAndName);
        let finalPath = this.finalAssetPath;
        if (this.options.assetsInSubdirs && project && project._id) finalPath = path.join(this.finalAssetPath, project._id, "/");
        if (this.options.rewriteAssetPorts) result = result.replace(pathStr, finalPath);
        return result;
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
}
