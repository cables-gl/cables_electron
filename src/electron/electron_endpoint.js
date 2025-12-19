// eslint-disable-next-line import/no-extraneous-dependencies
import { net, protocol, session, shell } from "electron";
import fs from "fs";
import path from "path";
import mime from "mime";

import cables from "../cables.js";
import logger from "../utils/logger.js";
import doc from "../utils/doc_util.js";
import opsUtil from "../utils/ops_util.js";
import subPatchOpUtil from "../utils/subpatchop_util.js";
import settings from "./electron_settings.js";
import helper from "../utils/helper_util.js";
import electronApp from "./main.js";
import projectsUtil from "../utils/projects_util.js";

protocol.registerSchemesAsPrivileged([
    {
        "scheme": "cables",
        "privileges": {
            "bypassCSP": true,
            "supportFetchAPI": true
        }
    },
    {
        "scheme": "file",
        "privileges": {
            "stream": true,
            "bypassCSP": true,
            "supportFetchAPI": true
        }
    }
]);

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

        ses.protocol.handle("file", async (request) =>
        {
            let urlFile = request.url;
            let absoluteFile = helper.fileURLToPath(urlFile, false);
            let projectFile = helper.fileURLToPath(urlFile, true);
            if (fs.existsSync(absoluteFile))
            {
                Object.defineProperty(request, "url", { "value": helper.pathToFileURL(absoluteFile) });
                const response = await net.fetch(request, { "bypassCustomProtocolHandlers": true });
                this._addDefaultHeaders(request, response, absoluteFile);
                return response;
            }
            else if (fs.existsSync(projectFile))
            {
                Object.defineProperty(request, "url", { "value": helper.pathToFileURL(projectFile) });
                const response = await net.fetch(request, { "bypassCustomProtocolHandlers": true });
                this._addDefaultHeaders(request, response, projectFile);
                return response;
            }
            else
            {
                try
                {
                    if (projectFile.includes("?"))
                    {
                        projectFile = projectFile.split("?")[0];
                    }
                    if (fs.existsSync(projectFile))
                    {
                        const response = await net.fetch(helper.pathToFileURL(projectFile), { "bypassCustomProtocolHandlers": true });
                        this._addDefaultHeaders(request, response, projectFile);
                        return response;
                    }
                    else
                    {
                        return new Response(null, { "headers": { "status": 404 } });
                    }
                }
                catch (e)
                {
                    return net.fetch(request.url, { "bypassCustomProtocolHandlers": true });
                }
            }
        });

        ses.protocol.handle("cables", async (request) =>
        {
            const url = new URL(request.url);
            const urlPath = url.pathname;
            const queryParams = new URLSearchParams(url.search);
            const params = {};
            const req = request;
            req.params = params;
            req.query = {};
            for (let key in queryParams)
            {
                req.query[key] = queryParams.get(key);
            }
            if (urlPath.startsWith("/api/corelib/"))
            {
                req.params.name = urlPath.split("/", 4)[3];
                const libCode = this.apiGetCoreLibs(req);
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
                req.params.name = urlPath.split("/", 4)[3];
                const libCode = this.apiGetLibs(req);
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
            else if (urlPath.startsWith("/api/oplib/"))
            {
                const parts = urlPath.split("/", 5);
                let opName = parts[3];
                let libName = parts[4];
                if (opsUtil.isOpId(opName))
                {
                    opName = opsUtil.getOpNameById(opName);
                }
                if (opName)
                {
                    const opPath = opsUtil.getOpAbsolutePath(opName);
                    const libPath = path.join(opPath, libName);
                    const libUrl = helper.pathToFileURL(libPath);
                    const response = await net.fetch(libUrl, { "bypassCustomProtocolHandlers": true });
                    this._addDefaultHeaders(request, response, libPath);
                    return response;
                }
                else
                {
                    return new Response("", {
                        "headers": { "content-type": "application/javascript" },
                        "status": 404
                    });
                }
            }
            else if (urlPath === "/api/changelog")
            {
                return new Response(JSON.stringify(this.apiGetChangelog(req)), {
                    "headers": { "content-type": "application/json" }
                });
            }
            else if (urlPath.startsWith("/api/ops/code/project"))
            {
                const code = this.apiGetProjectOpsCode(req);
                return new Response(code, {
                    "headers": { "content-type": "application/json" }
                });
            }
            else if (urlPath.startsWith("/api/ops/code"))
            {
                const code = this.apiGetCoreOpsCode(req);
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
                req.params.opName = opName;
                const layoutSvg = this.apiOpLayout(req);
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
                if (opName)
                {
                    req.params.opName = opName;
                    const opCode = this.apiGetOpCode(req);
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
            }
            else if (urlPath.startsWith("/op/screenshot"))
            {
                let opName = urlPath.split("/", 4)[3];
                if (opName) opName = opName.replace(/.png$/, "");
                const absolutePath = opsUtil.getOpAbsolutePath(opName);
                let file = path.join(absolutePath, "screenshot.png");
                let response = null;
                try
                {
                    response = await net.fetch(helper.pathToFileURL(file), { "bypassCustomProtocolHandlers": true });
                }
                catch (e)
                {
                    file = path.resolve(cables.getAssetLibraryPath(), "../op_screenshot_placeholder.png");
                    response = await net.fetch(helper.pathToFileURL(file), { "bypassCustomProtocolHandlers": true });
                }
                this._addDefaultHeaders(request, response, file);
                return response;
            }
            else if (urlPath.startsWith("/edit/"))
            {
                let patchId = urlPath.split("/", 3)[2];
                let projectFile = null;
                if (patchId)
                {
                    projectFile = settings.getRecentProjectFile(patchId);
                }
                if (projectFile)
                {
                    await electronApp.openPatch(projectFile, true);
                }
                else
                {
                    await electronApp.pickProjectFileDialog();
                }
                return new Response(null, { "status": 302 });
            }
            else if (urlPath.startsWith("/openDir/"))
            {
                let dir = urlPath.replace("/openDir/", "");
                await shell.showItemInFolder(dir);
                return new Response(null, { "status": 404 });
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

    apiGetCoreOpsCode(req)
    {
        const preview = req.query.preview;
        const opDocs = doc.getOpDocs();
        const code = opsUtil.buildCode(cables.getCoreOpsPath(), null, true, true, opDocs, preview);
        if (!code) this._log.warn("FAILED TO GET CODE FOR COREOPS FROM", cables.getCoreOpsPath());
        return code;
    }

    apiGetProjectOpsCode(req)
    {
        const preview = req.query.preview;
        const project = settings.getCurrentProject();

        let code = "";
        let missingOps = [];
        if (project)
        {
            let opDocs = doc.getOpDocs(true, true);
            let allOps = [];
            if (project.ops) allOps = project.ops.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
            const opsInProjectDir = projectsUtil.getOpDocsInProjectDirs(project);
            const opsInSubPatches = subPatchOpUtil.getOpsUsedInSubPatches(project);
            allOps = allOps.concat(opsInProjectDir);
            allOps = allOps.concat(opsInSubPatches);
            missingOps = allOps.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId || d.id === op.id; }); });
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
                    const fn = opsUtil.getOpAbsoluteFileName(opName);
                    if (fn)
                    {
                        code += opsUtil.getOpFullCode(fn, opName, opId);
                        opsWithCode.push(opName);
                    }
                }
                doc.addOpToLookup(opId, opName);
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

    apiGetOpCode(req)
    {
        const preview = !!req.query.preview;
        const opName = req.params.opName;
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
                    opNames.push(opName);
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

                code = preview ? opsUtil.buildPreviewCode(ops) : opsUtil.buildFullCode(ops, "none");
                return code;
            }
        }
        catch (e)
        {
            this._log.error("FAILED TO BUILD OPCODE FOR", opName, e);
            return code;
        }
    }

    apiGetCoreLibs(req)
    {
        const name = req.params.name;
        const fn = path.join(cables.getCoreLibsPath(), name + ".js");

        if (fs.existsSync(fn))
        {
            return fs.readFileSync(fn);
        }
        else
        {
            this._log.error("COULD NOT FIND CORELIB FILE AT", fn);
            return "";
        }
    }

    apiGetLibs(req)
    {
        const name = req.params.name;
        const fn = path.join(cables.getLibsPath(), name);
        if (fs.existsSync(fn))
        {
            return fs.readFileSync(fn);
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

    apiOpLayout(req)
    {
        const opName = req.params.opName;
        return opsUtil.getOpSVG(opName);
    }

    _addDefaultHeaders(request, response, existingFile)
    {
        try
        {
            const stats = fs.statSync(existingFile);
            if (stats)
            {
                response.headers.append("Accept-Ranges", "bytes");
                response.headers.append("Last-Modified", stats.mtime.toUTCString());

                // large mp4 and range headers cause problems somehow...
                // https://github.com/laurent22/joplin/blob/e607a7376f8403082e87087a3e07f37cb2e1ce76/packages/app-desktop/utils/customProtocols/handleCustomProtocols.ts#L106
                const rangeHeader = request.headers.get("Range");
                const startByte = Number(rangeHeader.match(/(\d+)-/)?.[1] || "0");
                const endByte = Number(rangeHeader.match(/-(\d+)/)?.[1] || stats.size - 1);
                response.headers.append("Content-Range", "bytes 0-" + stats.size + "/" + (stats.size + 1));
                response.headers.append("Content-Length", (endByte + 1) - startByte);
            }
            let mimeType = mime.getType(existingFile);
            if (mimeType)
            {
                if (mimeType === "application/node") mimeType = "text/javascript";
                response.headers.set("Content-Type", mimeType);
            }
        }
        catch (e) {}
        return response;
    }
}

export default new ElectronEndpoint();
