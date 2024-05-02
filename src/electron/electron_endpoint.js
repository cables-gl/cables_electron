import { protocol } from "electron";
import fs from "fs";
import path from "path";

import cables from "../cables.js";
import logger from "../utils/logger.js";
import doc from "../utils/doc_util.js";
import opsUtil from "../utils/ops_util.js";
import subPatchOpUtil from "../utils/subpatchop_util.js";
import settings from "./electron_settings.js";
import filesUtil from "../utils/files_util.js";

protocol.registerSchemesAsPrivileged([{
    "scheme": "cables",
    "privileges": {
        "bypassCSP": true,
        "supportFetchAPI": true
    }
}]);

class ElectronEndpoint
{
    constructor()
    {
        this._log = logger;
    }

    init()
    {
        protocol.handle("cables", (request) =>
        {
            const url = new URL(request.url);
            const urlPath = url.pathname;
            if (urlPath.startsWith("/api/corelib/"))
            {
                const libName = urlPath.split("/", 4)[3];
                const libCode = this.apiGetCoreLibs(libName);
                return new Response(libCode, {
                    "headers": { "content-type": "application/javascript" }
                });
            }
            else if (urlPath.startsWith("/api/lib/"))
            {
                const libName = urlPath.split("/", 4)[3];
                const libCode = this.apiGetLibs(libName);
                return new Response(libCode, {
                    "headers": { "content-type": "application/javascript" }
                });
            }
            else if (urlPath === "/api/errorReport")
            {
                return new Response(JSON.stringify({ "success": true }));
            }
            else if (urlPath === "/api/changelog")
            {
                return new Response(JSON.stringify({
                    "ts": Date.now(),
                    "items": []
                }), {
                    "headers": { "content-type": "application/json" }
                });
            }
            else if (urlPath === "/api/ping")
            {
                return new Response(JSON.stringify({ "maintenance": false }), {
                    "headers": { "content-type": "application/json" }
                });
            }
            else if (urlPath.startsWith("/api/ops/code/project"))
            {
                return this.apiGetProjectOpsCode().then((code) =>
                {
                    return new Response(code, {
                        "headers": { "content-type": "application/json" }
                    });
                });
            }
            else if (urlPath.startsWith("/api/ops/code"))
            {
                return this.apiGetCoreOpsCode().then((code) =>
                {
                    return new Response(code, {
                        "headers": { "content-type": "application/javascript" }
                    });
                });
            }
            else if (urlPath.startsWith("/api/op/"))
            {
                let opName = urlPath.split("/", 4)[3];
                if (opsUtil.isOpId(opName))
                {
                    opName = opsUtil.getOpNameById(opName);
                }
                const opCode = this.apiGetOpCode({ "opName": opName });
                return new Response(opCode, {
                    "headers": { "content-type": "application/javascript" }
                });
            }
            else if (urlPath.startsWith("/assets/"))
            {
                const parts = urlPath.split("/");
                const assetName = parts[parts.length - 1];
                const assetDb = { "fileName": assetName };
                const assetPath = filesUtil.getFileAssetLocation(assetDb);
                let content = "";
                if (fs.existsSync(assetPath))
                {
                    content = fs.readFileSync(assetPath);
                }
                return new Response(content);
            }
            else
            {
                return new Response("", {
                    "headers": { "content-type": "application/javascript" }
                });
            }
        });
    }


    async apiGetCoreOpsCode(data)
    {
        const opDocs = doc.getOpDocs();
        return opsUtil.buildCode(cables.getCoreOpsPath(), null, true, true, opDocs);
    }

    async apiGetProjectOpsCode()
    {
        const project = settings.getCurrentProject();
        let opDocs = doc.getOpDocs(true, true);
        let code = "";
        let missingOps = [];
        if (project && project.ops)
        {
            missingOps = project.ops.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
            const ops = subPatchOpUtil.getOpsUsedInSubPatches(project);
            const opsInProjectDir = doc.getOpDocsInProjectDir();
            missingOps = missingOps.concat(opsInProjectDir);
            missingOps = missingOps.concat(ops);
            missingOps = missingOps.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
            missingOps = missingOps.filter((obj, index) => { return missingOps.findIndex((item) => { return item.opId === obj.opId; }) === index; });
        }
        code = opsUtil.buildFullCode(missingOps, opsUtil.PREFIX_OPS, true, true, opDocs);
        return code;
    }

    apiGetOpCode(params)
    {
        const opName = params.opName;
        let code = "";
        const currentProject = settings.getCurrentProject();
        try
        {
            const attachmentOps = opsUtil.getSubPatchOpAttachment(opName);
            const bpOps = subPatchOpUtil.getOpsUsedInSubPatches(attachmentOps);
            if (!bpOps)
            {
                return code;
            }
            else
            {
                let opNames = [];
                for (let i = 0; i < bpOps.length; i++)
                {
                    const bpOp = bpOps[i];
                    const bpOpName = opsUtil.getOpNameById(bpOp.opId);
                    if (opsUtil.isCoreOp(bpOpName) && (!opsUtil.isOpOldVersion(bpOpName) && !opsUtil.isDeprecated(bpOpName))) continue;
                    if (currentProject && currentProject.ops && currentProject.ops.some((projectOp) => { return projectOp.opId === bpOp.opId; })) continue;
                    opNames.push(bpOpName);
                }

                if (opsUtil.isExtension(opName) || opsUtil.isTeamNamespace(opName))
                {
                    const collectionName = opsUtil.getCollectionNamespace(opName);
                    opNames = opNames.concat(opsUtil.getCollectionOpNames(collectionName));
                }
                else
                {
                    opNames.push(opName);
                }

                const ops = [];
                opNames.forEach((name) =>
                {
                    ops.push({
                        "objName": name,
                        "opId": opsUtil.getOpIdByObjName(name)
                    });
                });
                code = opsUtil.buildFullCode(ops, "none");
                return code;
            }
        }
        catch (e)
        {
            return code;
        }
    }

    apiGetCoreLibs(name)
    {
        const fn = path.join(cables.getCoreLibsPath(), name + ".js");

        if (fs.existsSync(fn))
        {
            let info = fs.readFileSync(fn);

            info = info + "\n\nCABLES.loadedCoreLib(\"" + name + "\")";
            return info;
        }
        else
        {
            return "";
        }
    }

    apiGetLibs(name)
    {
        const fn = path.join(cables.getLibsPath(), name);
        if (fs.existsSync(fn))
        {
            let info = fs.readFileSync(fn);
            info = info + "\n\nCABLES.loadedLib(\"" + name + "\")";
            return info;
        }
        else
        {
            return "";
        }
    }
}

export default new ElectronEndpoint();
