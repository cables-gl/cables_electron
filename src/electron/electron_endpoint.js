import { protocol, session, net } from "electron";
import fs from "fs";
import path from "path";

import cables from "../cables.js";
import logger from "../utils/logger.js";
import doc from "../utils/doc_util.js";
import opsUtil from "../utils/ops_util.js";
import subPatchOpUtil from "../utils/subpatchop_util.js";
import settings from "./electron_settings.js";
import filesUtil from "../utils/files_util.js";
import helper from "../utils/helper_util.js";

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
        const partition = settings.SESSION_PARTITION;
        const ses = session.fromPartition(partition, { "cache": false });

        ses.protocol.handle("file", (request) =>
        {
            let urlFile = request.url;
            let actualFile = helper.fileURLToPath(urlFile, true);
            if (fs.existsSync(actualFile))
            {
                return net.fetch(helper.pathToFileURL(actualFile), { "bypassCustomProtocolHandlers": true });
            }
            else
            {
                try
                {
                    const url = new URL(request.url);
                    if (url.searchParams.size > 0)
                    {
                        const paramsFile = url.href.replace(url.protocol, "").replace("//", "");
                        if (!fs.existsSync(paramsFile))
                        {
                            actualFile = url.pathname.replace("//", "/");
                        }
                    }
                    actualFile = decodeURI(actualFile);
                    if (fs.existsSync(actualFile))
                    {
                        return net.fetch(helper.pathToFileURL(actualFile));
                    }
                    else
                    {
                        return new Response(null, {
                            "headers": { "status": 404 }
                        });
                    }
                }
                catch (e)
                {
                    return net.fetch(request.url, { "bypassCustomProtocolHandlers": true });
                }
            }
        });

        ses.protocol.handle("cables", (request) =>
        {
            const url = new URL(request.url);
            const urlPath = url.pathname;
            if (urlPath.startsWith("/api/corelib/"))
            {
                const libName = urlPath.split("/", 4)[3];
                const libCode = this.apiGetCoreLibs(libName);
                if (libCode)
                {
                    return new Response(libCode, {
                        "headers": { "content-type": "application/javascript" }
                    });
                }
                else
                {
                    return new Response(libCode, {
                        "headers": { "content-type": "application/javascript" },
                        "status": 500
                    });
                }
            }
            else if (urlPath.startsWith("/api/lib/"))
            {
                const libName = urlPath.split("/", 4)[3];
                const libCode = this.apiGetLibs(libName);
                if (libCode)
                {
                    return new Response(libCode, {
                        "headers": { "content-type": "application/javascript" }
                    });
                }
                else
                {
                    return new Response(libCode, {
                        "headers": { "content-type": "application/javascript" },
                        "status": 500
                    });
                }
            }
            else if (urlPath === "/api/errorReport")
            {
                return new Response(JSON.stringify({ "success": true }));
            }
            else if (urlPath === "/api/changelog")
            {
                return new Response(JSON.stringify(this.apiGetChangelog()), {
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
                const code = this.apiGetProjectOpsCode();
                return new Response(code, {
                    "headers": { "content-type": "application/json" }
                });
            }
            else if (urlPath.startsWith("/api/ops/code"))
            {
                const code = this.apiGetCoreOpsCode();
                if (code)
                {
                    return new Response(code, {
                        "headers": { "content-type": "application/javascript" }
                    });
                }
                else
                {
                    return new Response(code, {
                        "headers": { "content-type": "application/javascript" },
                        "status": 500
                    });
                }
            }
            else if (urlPath.startsWith("/api/op/layout/"))
            {
                let opName = urlPath.split("/", 5)[4];
                if (opsUtil.isOpId(opName))
                {
                    opName = opsUtil.getOpNameById(opName);
                }
                const layoutSvg = this.apiOpLayout(opName);
                if (layoutSvg)
                {
                    return new Response(layoutSvg, {
                        "headers": { "content-type": "image/svg+xml" }
                    });
                }
                else
                {
                    return new Response("", {
                        "headers": { "content-type": "image/svg+xml" },
                        "status": 500
                    });
                }
            }
            else if (urlPath.startsWith("/api/op/"))
            {
                let opName = urlPath.split("/", 4)[3];
                if (opsUtil.isOpId(opName))
                {
                    opName = opsUtil.getOpNameById(opName);
                }
                const opCode = this.apiGetOpCode({ "opName": opName });
                if (opCode)
                {
                    return new Response(opCode, {
                        "headers": { "content-type": "application/javascript" }
                    });
                }
                else
                {
                    return new Response(opCode, {
                        "headers": { "content-type": "application/javascript" },
                        "status": 500
                    });
                }
            }
            else
            {
                return new Response("", {
                    "headers": { "content-type": "application/javascript" },
                    "status": 404
                });
            }
        });
    }


    apiGetCoreOpsCode()
    {
        const opDocs = doc.getOpDocs();
        const code = opsUtil.buildCode(cables.getCoreOpsPath(), null, true, true, opDocs);
        if (!code) this._log.warn("FAILED TO GET CODE FOR COREOPS FROM", cables.getCoreOpsPath());
        return code;
    }

    apiGetProjectOpsCode()
    {
        const project = settings.getCurrentProject();
        let opDocs = doc.getOpDocs(true, true);
        let code = "";
        let missingOps = [];
        if (project)
        {
            if (project.ops) missingOps = project.ops.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
            const ops = subPatchOpUtil.getOpsUsedInSubPatches(project);
            const opsInProjectDir = doc.getOpDocsInProjectDirs(project);
            missingOps = missingOps.concat(opsInProjectDir);
            missingOps = missingOps.concat(ops);
            missingOps = missingOps.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
        }
        const opsWithCode = [];
        let codeNamespaces = [];
        missingOps.forEach((missingOp) =>
        {
            const opId = missingOp.opId || missingOp.id;
            const opName = missingOp.name || opsUtil.getOpNameById(opId);
            if (opId && opName)
            {
                if (!opsWithCode.includes(opName))
                {
                    const parts = opName.split(".");
                    for (let k = 1; k < parts.length; k++)
                    {
                        let partPartname = "";
                        for (let j = 0; j < k; j++) partPartname += parts[j] + ".";

                        partPartname = partPartname.substr(0, partPartname.length - 1);
                        codeNamespaces.push(partPartname + "=" + partPartname + " || {};");
                    }
                    code += opsUtil.getOpFullCode(opName, opId);
                    opsWithCode.push(opName);
                }
            }
        });

        codeNamespaces = helper.sortAndReduce(codeNamespaces);
        let fullCode = opsUtil.OPS_CODE_PREFIX;
        if (codeNamespaces && codeNamespaces.length > 0)
        {
            codeNamespaces[0] = "var " + codeNamespaces[0];
            fullCode += codeNamespaces.join("\n") + "\n\n";
        }

        fullCode += code;
        return fullCode;
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
            this._log.error("FAILED TO BUILD OPCODE FOR", opName, e);
            return code;
        }
    }

    apiGetCoreLibs(name)
    {
        const fn = path.join(cables.getCoreLibsPath(), name + ".js");

        if (fs.existsSync(fn))
        {
            let info = fs.readFileSync(fn);
            info += "\n\nCABLES.loadedCoreLib(\"" + name + "\")";
            return info;
        }
        else
        {
            this._log.error("COULD NOT FIND CORELIB FILE AT", fn);
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
            this._log.error("COULD NOT FIND LIB FILE AT", fn);
            return "";
        }
    }

    apiGetChangelog()
    {
        return {
            "ts": Date.now(),
            "items": []
        };
    }

    apiOpLayout(opName)
    {
        return opsUtil.getOpSVG(opName);
    }
}

export default new ElectronEndpoint();
