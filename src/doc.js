import fs from "fs";
import jsonfile from "jsonfile";
import marked from "marked";
import path from "path";
import moment from "moment";
import * as cables from "./cables.js";
import opsUtil from "./utils/ops_util.js";
import helper from "./utils/helper_util.js";

const logger = console;

const opdocsFilename = cables.getOpDocsFile();
const opLookupFilename = cables.getOpLookupFile();

let rebuildOpDocCache = true;
let cachedOpDocs = null;
let cachedLookup = null;
cachedLookup = getCachedOpLookup();

fs.watch(opdocsFilename, () =>
{
    jsonfile.readFile(opdocsFilename, (err, data) =>
    {
        logger.info("reloaded opdocs cache json file!");
        cachedOpDocs = data;
    });
});

fs.watch(opLookupFilename, () =>
{
    jsonfile.readFile(opLookupFilename, (err, data) =>
    {
        cachedLookup = data;
    });
});

export function getOpDocs(filterOldVersions, filterDeprecated)
{
    let opDocs = [];

    if (rebuildOpDocCache)
    {
        const dir = fs.readdirSync(cables.getCoreOpsPath());

        const nameLookup = {};
        const idLookup = {};

        for (const i in dir)
        {
            const opname = dir[i];
            const opDoc = buildOpDocs(opname);
            if (opDoc)
            {
                opDocs.push(opDoc);
                const opid = opDoc.id;
                if (opid)
                {
                    if (!nameLookup.hasOwnProperty(opname))
                    {
                        nameLookup[opname] = opid;
                    }
                    else
                    {
                        logger.error("DUPLICATE OP NAME:", opname, opid);
                    }

                    if (!idLookup.hasOwnProperty(opid))
                    {
                        idLookup[opid] = opname;
                    }
                    else
                    {
                        logger.error("DUPLICATE OP ID:", opid, opname);
                    }
                }
                else
                {
                    logger.error("NO OP ID", opname);
                }
            }
        }

        opDocs = opsUtil.addVersionInfoToOps(opDocs);

        rebuildOpDocCache = false;

        jsonfile.writeFileSync(cables.getOpDocsFile(), {
            "generated": Date.now(),
            "opDocs": opDocs
        });
        return opDocs;
    }
    else
    {
        if (cachedOpDocs && cachedOpDocs.opDocs)
        {
            let filteredOpDocs = [];
            if (filterDeprecated || filterOldVersions)
            {
                for (let i = 0; i < cachedOpDocs.opDocs.length; i++)
                {
                    const opDoc = cachedOpDocs.opDocs[i];
                    if (filterOldVersions && opDoc.oldVersion) continue;
                    if (filterDeprecated && opsUtil.isDeprecated(opDoc.name)) continue;
                    filteredOpDocs.push(opDoc);
                }
            }
            else
            {
                filteredOpDocs = cachedOpDocs.opDocs;
            }

            return filteredOpDocs;
        }
        else
        {
            rebuildOpDocCache = true;
            return getOpDocs(filterOldVersions, filterDeprecated);
        }
    }
}

export function buildOpDocs(opname)
{
    let docObj = null;
    if (opsUtil.isOpNameValid(opname))
    {
        docObj = {
            "name": opname,
            "content": ""
        };

        const dirName = opsUtil.getOpSourceDir(opname);

        docObj.attachmentFiles = opsUtil.getAttachmentFiles(opname) || [];

        const jsonFilename = dirName + opname + ".json";
        const jsonExists = fs.existsSync(jsonFilename);

        const screenshotFilename = dirName + "screenshot.png";
        const screenshotExists = fs.existsSync(screenshotFilename);

        const parts = opname.split(".");
        const shortName = parts[parts.length - 1];

        if (!shortName) logger.warn("no shortname ?", parts);

        parts.pop();
        const namespace = parts.join(".");

        if (!jsonExists)
        {
            logger.warn("no json", opname, jsonFilename);
        }

        let js = {};
        try
        {
            if (jsonExists) js = jsonfile.readFileSync(jsonFilename);
        }
        catch (e)
        {
            logger.error("failed to read opdocs from file", opname, jsonFilename, e);
        }

        if (js)
        {
            docObj.summary = js.summary || "";
            docObj.shortName = shortName;
            docObj.id = js.id;
            docObj.layout = js.layout;
            docObj.ports = js.ports;
            if (js.credits) docObj.credits = js.credits;
            docObj.hasScreenshot = screenshotExists;
            docObj.authorName = js.authorName || "unknown";
            docObj.docs = js.docs;
            docObj.relatedops = js.relatedops || [];
            docObj.hasExample = !!js.exampleProjectId;
            docObj.exampleProjectId = js.exampleProjectId || "";
            docObj.namespace = namespace;
            docObj.name = opname;
            docObj.nameNoVersion = opsUtil.getOpNameWithoutVersion(opname);
            docObj.shortNameDisplay = opsUtil.getOpNameWithoutVersion(shortName);
            docObj.version = opsUtil.getVersionFromOpName(opname);
            docObj.libs = js.libs || [];
            docObj.youtubeids = js.youtubeids || [];

            docObj.hidden = (opsUtil.isDeprecated(opname) || opsUtil.isAdminOp(opname));

            if (js.changelog)
            {
                docObj.changelog = js.changelog;
                for (let i = 0; i < js.changelog.length; i++) js.changelog[i].dateReadable = moment(js.changelog[i].date).format("YYYY-MM-DD");
            }
            if (js.todos)
            {
                docObj.todos = js.todos;
                for (let i = 0; i < js.todos.length; i++) js.todos[i].dateReadable = moment(js.todos[i].date).format("YYYY-MM-DD");
            }
            if (js.coreLibs)
            {
                docObj.coreLibs = js.coreLibs;
            }
            if (js.issues)
            {
                docObj.issues = js.issues;
            }
            if (js.caniusequery)
            {
                docObj.caniusequery = js.caniusequery;
            }
        }

        const mdFile = path.join(opsUtil.getOpSourceDir(opname), opname + ".md");
        const exists = fs.existsSync(mdFile);
        if (exists)
        {
            let doc = fs.readFileSync(mdFile);
            doc = setOpLinks(marked(doc + "" || ""));
            doc = (doc + "").replace(/src="/g, "src=\"https://docs.cables.gl/ops/" + opname + "/");
            docObj.content = doc;
        }
    }
    return docObj;
}

export function setOpLinks(str)
{
    str = str || "";
    // eslint-disable-next-line no-useless-escape
    const urlPattern = /\b(?:Ops\.)[a-z0-9-+&@#\/%?=~_|!:,.;]*[a-z0-9-+&@#\/%=~_|]/gim;
    str = str.replace(urlPattern, "<a href=\"/op/$&\" target=\"_blank\">$&</a>");
    return str;
}

export function getCachedOpLookup()
{
    if (!cachedLookup)
    {
        if (fs.existsSync(opLookupFilename))
        {
            cachedLookup = jsonfile.readFileSync(opLookupFilename);
        }
        else
        {
            cachedLookup = { "names": {}, "ids": {} };
        }
    }
    return cachedLookup;
}

export function addOpToLookup(opId, opName)
{
    addOpsToLookup([{ "id": opId, "name": opName }]);
}

export function addOpsToLookup(ops)
{
    if (!ops) return;
    let writeToFile = false;
    if (!cachedLookup) cachedLookup = {};
    if (!cachedLookup.ids) cachedLookup.ids = {};
    if (!cachedLookup.names) cachedLookup.names = {};
    ops.forEach((op) =>
    {
        if (op.id && op.name)
        {
            if (!cachedLookup.ids.hasOwnProperty(op.id))
            {
                cachedLookup.ids[op.id] = op.name;
                writeToFile = true;
            }
            else if (cachedLookup.ids[op.id] !== op.name)
            {
                cachedLookup.ids[op.id] = op.name;
                writeToFile = true;
            }
            if (op.id)
            {
                if (!cachedLookup.names.hasOwnProperty(op.name))
                {
                    cachedLookup.names[op.name] = op.id;
                    writeToFile = true;
                }
                else if (cachedLookup.names[op.name] !== op.id)
                {
                    cachedLookup.names[op.name] = op.id;
                    writeToFile = true;
                }
            }
        }
    });
    if (writeToFile)
    {
        jsonfile.writeFileSync(cables.getOpLookupFile(), cachedLookup);
    }
}

export function getAllExtensionDocs()
{
    const collectionPath = cables.getExtensionOpsPath();
    const exDirs = fs.readdirSync(collectionPath);
    const extensions = [];
    exDirs.forEach((extensionName) =>
    {
        if (opsUtil.isExtension(extensionName))
        {
            const extensionOps = opsUtil.getCollectionOpNames(extensionName);
            if (extensionOps.length > 0)
            {
                const extDocs = getExtensionDoc(extensionName);
                if (extDocs) extensions.push(extDocs);
            }
        }
    });
    return extensions;
}

export function getExtensionDoc(extensionName)
{
    const extensionOps = opsUtil.getCollectionOpNames(extensionName);
    const shortName = opsUtil.getExtensionShortName(extensionName);
    return _getNamespaceDocs(extensionName, shortName, null, extensionOps);
}

function _getNamespaceDocs(namespaceName, shortName, team, ops = [])
{
    let extDocs = {
        "name": namespaceName,
        "summary": "",
        "shortName": shortName,
        "nameSpace": namespaceName,
        "shortNameDisplay": shortName,
        "numOps": ops.length,
        "ops": ops
    };
    if (team)
    {
        extDocs.teamName = team.name;
        extDocs.description = team.description;
        extDocs.teamLink = team.link;
    }

    const extInfo = opsUtil.getCollectionDocs(namespaceName);
    extDocs = { ...extDocs, ...extInfo };

    return extDocs;
}

export function makeReadable(opDocs)
{
    // dereference array, so we do not alter cached values
    const cleanDocs = helper.copy(opDocs);
    cleanDocs.forEach((opDoc) =>
    {
        delete opDoc.changelog;
        if (!opDoc.version) delete opDoc.version;
        delete opDoc.versionString;
        delete opDoc.nameNoVersion;
        delete opDoc.relatedops;
        delete opDoc.collections;
        if (opDoc.newestVersion && (opDoc.newestVersion.name === opDoc.name))
        {
            opDoc.newestVersion = null;
        }
    });
    return cleanDocs;
}

export function getDocForOp(opname)
{
    if (opsUtil.existingCoreOp(opname))
    {
        const docs = getOpDocs();
        for (let i = 0; i < docs.length; i++)
        {
            if (docs[i].name === opname)
            {
                return docs[i];
            }
        }
        return null;
    }
    else if (opsUtil.opExists(opname))
    {
        let collectionDocs = [];
        let opDoc = buildOpDocs(opname);
        if (opDoc)
        {
            const collection = opsUtil.getCollectionName(opname);
            const opNames = opsUtil.getCollectionOpNames(collection);
            opsUtil.addOpDocsForCollections(opNames, collectionDocs);
            const versionedDocs = opsUtil.addVersionInfoToOps([opDoc]);
            opDoc = versionedDocs[0];
        }
        return opDoc;
    }
    else
    {
        logger.warn("could not find opdocs for", opname);
        return null;
    }
}

export function getOpDocMd(opname)
{
    if (opsUtil.isOpNameValid(opname))
    {
        const opPath = opsUtil.getOpAbsolutePath(opname);
        if (opPath)
        {
            const fn = opPath + opname + ".md";

            try
            {
                if (fs.existsSync(fn))
                {
                    return fs.readFileSync(fn, "utf8");
                }
                else
                {
                    return null;
                }
            }
            catch (e) {}
        }
    }
    return null;
}

export function updateOpDocs(opName)
{
    if (!opName || opsUtil.isCoreOp(opName))
    {
        rebuildOpDocCache = true;
        return getOpDocs();
    }
    else
    {
        const collectionName = opsUtil.getCollectionName(opName);
        return opsUtil.buildOpDocsForCollection(collectionName);
    }
}
