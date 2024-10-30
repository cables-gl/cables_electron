import { protocol, session, net, shell } from "electron";
import fs from "fs";
import path from "path";

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
                const response = await net.fetch(helper.pathToFileURL(absoluteFile), { "bypassCustomProtocolHandlers": true });
                this._addDefaultHeaders(response, absoluteFile);
                return response;
            }
            else if (fs.existsSync(projectFile))
            {
                const response = await net.fetch(helper.pathToFileURL(projectFile), { "bypassCustomProtocolHandlers": true });
                this._addDefaultHeaders(response, projectFile);
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
                        this._addDefaultHeaders(response, projectFile);
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
                return new Response(JSON.stringify(this.apiErrorReport(request)));
            }
            else if (urlPath === "/api/changelog")
            {
                return new Response(JSON.stringify(this.apiGetChangelog()), {
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
                if (opName)
                {
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
            }
            else if (urlPath.startsWith("/op/screenshot"))
            {
                let opName = urlPath.split("/", 4)[3];
                if (opName) opName = opName.replace(/.png$/, "");
                const absoluteFile = opsUtil.getOpAbsolutePath(opName);
                const file = path.join(absoluteFile, "screenshot.png");
                const response = await net.fetch(helper.pathToFileURL(file), { "bypassCustomProtocolHandlers": true });
                this._addDefaultHeaders(response, file);
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
                // dir = path.dirname(dir);
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

        let code = "";
        let missingOps = [];
        if (project)
        {
            let opDocs = doc.getOpDocs(false, false);
            let allOps = [];
            if (project.ops) allOps = project.ops.filter((op) => { return !opDocs.some((d) => { return d.id === op.opId; }); });
            const opsInProjectDir = projectsUtil.getOpDocsInProjectDirs(project);
            const ops = subPatchOpUtil.getOpsUsedInSubPatches(project);
            allOps = allOps.concat(opsInProjectDir);
            allOps = allOps.concat(ops);
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

    _addDefaultHeaders(response, existingFile)
    {
        try
        {
            const stats = fs.statSync(existingFile);
            if (stats)
            {
                response.headers.append("Accept-Ranges", "bytes");
                response.headers.append("Content-Length", stats.size);
                response.headers.append("Content-Range", "bytes 0-" + stats.size + "/" + (stats.size + 1));
                response.headers.append("Last-Modified", stats.mtime.toUTCString());
            }
        }
        catch (e) {}
        return response;
    }

    apiErrorReport(request)
    {
        try
        {
            request.json().then((report) =>
            {
                const communityUrl = cables.getCommunityUrl();
                if (cables.sendErrorReports() && communityUrl)
                {
                    try
                    {
                        const errorReportSend = net.request({
                            "url": path.join(communityUrl, "/api/errorReport"),
                            "method": "POST",
                        });
                        delete report.url;
                        delete report.file;
                        if (report.log)
                        {
                            report.log.forEach((log) =>
                            {
                                if (log.errorStack)
                                {
                                    log.errorStack.forEach((stack) =>
                                    {
                                        if (stack.fileName)
                                        {
                                            stack.fileName = path.basename(stack.fileName);
                                        }
                                        if (stack.source)
                                        {
                                            delete stack.source;
                                        }
                                    });
                                }
                            });
                        }
                        report.username = "standalone";
                        errorReportSend.setHeader("Content-Type", "application/json");
                        errorReportSend.write(JSON.stringify(report), "utf-8");
                        errorReportSend.end();
                    }
                    catch (e)
                    {
                        this._log.debug("failed to send error report", e);
                    }
                }
            });
        }
        catch (e)
        {
            this._log.info("failed to parse error report", e);
        }
        return { "success": true };
    }
}

export default new ElectronEndpoint();
