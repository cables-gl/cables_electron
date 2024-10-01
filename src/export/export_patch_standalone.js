import sanitizeFileName from "sanitize-filename";
import fs from "fs";
import path from "path";
import cables from "../cables.js";
import libsUtil from "../utils/libs_util.js";
import StandaloneZipExport from "./export_zip_standalone.js";

export default class StandaloneExport extends StandaloneZipExport
{
    constructor(provider)
    {
        super(provider, {});

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
        return "standalone";
    }

    _replaceInString(replacements, theString)
    {
        return theString;
    }

    _addProjectJsCode(proj, opsCode, libs, coreLibs, replacedOpIds, jsCode, options)
    {
        const libScripts = [];
        for (let l = 0; l < libs.length; l++)
        {
            const lib = libs[l];

            if (libsUtil.isAssetLib(lib))
            {
                let libPath = path.join(cables.getLibsPath(), "/", lib);
                let libSrc = path.join(this.finalJsPath, lib);
                libPath = path.join(cables.getPublicPath(), lib);
                libScripts.push({ "name": lib, "file": libPath, "src": libSrc });
            }
        }

        for (let f = 0; f < libScripts.length; f++)
        {
            this.append(fs.readFileSync(libScripts[f].file, "utf8"), { "name": libScripts[f].src });
        }
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
