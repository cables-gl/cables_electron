import sanitizeFileName from "sanitize-filename";
import path from "path";
import HtmlExportElectron from "./export_html_electron.js";

export default class PatchExportElectron extends HtmlExportElectron
{
    constructor(provider, _exportOptions, user)
    {
        super(provider, {}, user);

        this.options.combineJS = false;
        this.options.addOpCode = true;
        this.options.removeIndexHtml = true;
        this.options.rewriteAssetPorts = false;
        this.options.flattenAssetNames = false;
        this.options.handleAssets = "all";
        this.options.assetsInSubdirs = true;

        this.finalAssetPath = "assets/";
        this.finalAssetPathPrefix = "./";
        this.finalJsPath = "/";
    }

    static getName()
    {
        return "patch";
    }

    _addProjectHtmlCode(proj, options, libs, coreLibs, template = "/patchview/patchview_export.html", _dependencies = [])
    {
        const projectName = sanitizeFileName(proj.name).replace(/ /g, "_");
        const projectNameVer = projectName + proj.exports;
        this.append(this.makeCablesFileJson(proj), { "name": projectNameVer + ".cables" });
    }

    _getOpExportSubdir(opName)
    {
        return path.join("ops", this._opsUtil.getOpTargetDir(opName, true));
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
