import { app } from "electron";
import { SharedDocUtil, utilProvider } from "cables-shared-api";
import fs from "fs";
import path from "path";
import jsonfile from "jsonfile";
import crypto from "crypto";
import opsUtil from "./ops_util.js";
import helper from "./helper_util.js";
import cables from "../cables.js";
import settings from "../electron/electron_settings.js";

class DocUtil extends SharedDocUtil
{
    constructor(provider)
    {
        super(provider);
        this.CACHE_CHECK_INTERVAL = 2000;

        this._lastOpCacheCheck = 0;
        this._validatingOpCaches = false;
        this._opDocsSignature = null;
        this._buildSignature = null;
        this._pendingCacheWrites = null;
        this.OP_HISTORY_CACHE = "op-history";
        this._opHistory = null;

        // do not lose cache changes that are still waiting to be written
        app.on("will-quit", () => { this.flushCaches(); });
    }

    /**
     * @param {boolean} filterOldVersions
     * @param {boolean} filterDeprecated
     */
    getOpDocs(filterOldVersions = false, filterDeprecated = false)
    {
        this.validateOpCaches();
        return super.getOpDocs(filterOldVersions, filterDeprecated);
    }

    getCollectionOpDocs(collectionName, currentUser = null, opNames = null)
    {
        this.validateOpCaches();
        return super.getCollectionOpDocs(collectionName, currentUser, opNames);
    }

    /**
     * compares the op directories of core and extensions to the state the caches
     * were built from and rebuilds the caches of everything that changed on disk
     *
     * @param {Boolean} [force] check now, even if the last check just happened
     * @returns {Boolean} true if caches have been rebuilt
     */
    validateOpCaches(force = false)
    {
        if (this._validatingOpCaches) return false;

        const now = Date.now();
        const pendingRebuild = this._rebuildOpDocCache;
        if (!force && !pendingRebuild && (now - this._lastOpCacheCheck) < this.CACHE_CHECK_INTERVAL) return false;

        const cachedOpDocs = this.getCachedOpDocs();
        // cache file not loaded yet, nothing to compare to
        if (!cachedOpDocs && !pendingRebuild) return false;

        this._lastOpCacheCheck = now;
        this._validatingOpCaches = true;
        try
        {
            // timings to find out what takes long when rebuilding the caches, see main.log
            const timeStart = performance.now();
            // get this before reading any ops, changes during the rebuild will then be picked up by the next check
            const signature = this.getOpDocsSignature();
            const timeSignature = performance.now();
            const cachedSignature = (cachedOpDocs && cachedOpDocs.signature) || {};
            const buildChanged = cachedSignature.build !== signature.build;

            const changedCoreOps = this._getChangedOpNames(buildChanged ? null : cachedSignature.core, signature.core);
            const changedExtensionOps = this._getChangedOpNames(buildChanged ? null : cachedSignature.extensions, signature.extensions);
            if (!pendingRebuild && changedCoreOps.length === 0 && changedExtensionOps.length === 0)
            {
                if (force) this._log.info("op caches up to date, signature took", Math.round(timeSignature - timeStart), "ms");
                return false;
            }

            const changedOps = changedCoreOps.concat(changedExtensionOps);
            if (changedOps.length > 0) this._log.info("rebuilding caches for", changedOps.length, "ops that changed on disk");

            this._opDocsSignature = signature;
            this._projectsUtil.invalidateProjectCaches();
            this.removeOpNamesFromLookup(changedOps.filter((opName) => { return !signature.core[opName] && !signature.extensions[opName]; }));

            let rebuildCore = false;
            if (pendingRebuild === true || !cachedOpDocs || !cachedOpDocs.opDocs)
            {
                // full rebuild was requested or there is nothing to update
                this._rebuildOpDocCache = true;
                const opDocs = super.getOpDocs();
                // rebuild failed and is still pending, keep the old signature and try again with the next call
                if (this._rebuildOpDocCache) return false;
                if (opDocs) this.addOpsToLookup(opDocs.filter((opDoc) => { return changedCoreOps.includes(opDoc.name); }));
                rebuildCore = true;
            }
            else
            {
                // only rebuild the ops that changed, i.e. after a git pull, instead of all of core
                const rebuildOps = pendingRebuild ? helper.uniqueArray(changedCoreOps.concat([pendingRebuild])) : changedCoreOps;
                if (rebuildOps.length > 0)
                {
                    this._rebuildCoreOpDocs(cachedOpDocs, rebuildOps, signature.core);
                    rebuildCore = true;
                }
            }

            const timeCore = performance.now();
            const collections = helper.uniqueArray(changedExtensionOps.map((opName) => { return opsUtil.getCollectionName(opName); }));
            collections.forEach((collectionName) => { opsUtil.buildOpDocsForCollection(collectionName); });
            const timeExtensions = performance.now();
            this._log.info("op cache timings: signature", Math.round(timeSignature - timeStart), "ms, core", Math.round(timeCore - timeSignature), "ms (" + changedCoreOps.length + " ops), extensions", Math.round(timeExtensions - timeCore), "ms (" + collections.length + " collections, " + changedExtensionOps.length + " ops)");

            // rebuilding core already stored the new signature
            if (!rebuildCore && cachedOpDocs) this._writeCache(this.OP_DOCS_CACHE, cachedOpDocs);
            return true;
        }
        finally
        {
            this._validatingOpCaches = false;
        }
    }

    /**
     * rebuilds the docs of the given core ops and keeps the cached docs of all others,
     * ops that no longer exist on disk are removed
     *
     * @param {Object} cachedOpDocs
     * @param {String[]} opNames
     * @param {Object<String, String>} coreSignature
     */
    _rebuildCoreOpDocs(cachedOpDocs, opNames, coreSignature)
    {
        const rebuildOps = new Set(opNames);
        const rebuiltDocs = {};
        rebuildOps.forEach((opName) =>
        {
            if (!coreSignature.hasOwnProperty(opName)) return;
            const opDoc = this.buildOpDocs(opName);
            if (opDoc && opDoc.id)
            {
                rebuiltDocs[opName] = opDoc;
            }
            else
            {
                this._log.error("NO OP ID", opName);
            }
        });

        let opDocs = cachedOpDocs.opDocs
            .filter((opDoc) => { return !rebuildOps.has(opDoc.name) || rebuiltDocs[opDoc.name]; })
            .map((opDoc) => { return rebuiltDocs[opDoc.name] || opDoc; });
        const cachedNames = new Set(opDocs.map((opDoc) => { return opDoc.name; }));
        Object.keys(rebuiltDocs).forEach((opName) =>
        {
            if (!cachedNames.has(opName)) opDocs.push(rebuiltDocs[opName]);
        });

        // new or removed versions change the version info of the other versions of an op
        opDocs = opsUtil.addVersionInfoToOps(opDocs, true);
        const newCache = {
            "generated": Date.now(),
            "opDocs": opDocs
        };
        this.setCachedOpDocs(newCache);
        this._writeCache(this.OP_DOCS_CACHE, newCache);
        this.addOpsToLookup(Object.values(rebuiltDocs));
        this._rebuildOpDocCache = false;
    }

    /**
     * state of everything on disk that opdocs of core and extensions are built from
     *
     * @returns {{build: String, core: Object<String, String>, extensions: Object<String, String>}}
     */
    getOpDocsSignature()
    {
        const signature = { "build": this._getBuildSignature(), "core": {}, "extensions": {} };
        this._addOpsToSignature(cables.getCoreOpsPath(), signature.core);

        const extensionsPath = cables.getExtensionOpsPath();
        let extensionNames = [];
        try
        {
            extensionNames = fs.readdirSync(extensionsPath);
        }
        catch (e) {}
        extensionNames.forEach((extensionName) =>
        {
            if (opsUtil.isExtension(extensionName)) this._addOpsToSignature(path.join(extensionsPath, extensionName), signature.extensions);
        });
        return signature;
    }

    _addOpsToSignature(opsDir, signature)
    {
        let opNames = [];
        try
        {
            opNames = fs.readdirSync(opsDir);
        }
        catch (e) {}
        opNames.forEach((opName) =>
        {
            if (!opsUtil.isOpNameValid(opName)) return;
            const opDir = path.join(opsDir, opName);
            // the directory itself changes whenever files (i.e. attachments) are added or removed
            const files = [opDir, path.join(opDir, opName + ".json"), this._opsUtil.getOpAbsoluteMarkdownFilename(opName)];
            signature[opName] = files.map((file) =>
            {
                try
                {
                    return fs.statSync(file).mtimeMs;
                }
                catch (e)
                {
                    return 0;
                }
            }).join("-");
        });
    }

    _getBuildSignature()
    {
        // ops inside the package only change with a new build, the dates of the files might not
        if (!cables.isPackaged()) return "dev";
        if (!this._buildSignature)
        {
            this._buildSignature = crypto
                .createHash("sha1")
                .update(JSON.stringify(settings.getBuildInfo()))
                .digest("hex");
        }
        return this._buildSignature;
    }

    _getChangedOpNames(cachedSignature, signature)
    {
        if (!cachedSignature) cachedSignature = {};
        const changed = Object.keys(signature).filter((opName) => { return cachedSignature[opName] !== signature[opName]; });
        const removed = Object.keys(cachedSignature).filter((opName) => { return !signature.hasOwnProperty(opName); });
        return changed.concat(removed);
    }

    /**
     * @param {string} cache
     * @param {any} data
     */
    _writeCache(cache, data)
    {
        // store the state of the op directories the cache was built from, see validateOpCaches
        if (cache === this.OP_DOCS_CACHE && data && this._opDocsSignature) data.signature = this._opDocsSignature;

        // the in-memory caches are always up to date, writing them to disk can wait until the current batch is done.
        // adding ops that are missing from the lookup writes the whole file for every single op otherwise
        const scheduleFlush = !this._pendingCacheWrites;
        if (scheduleFlush) this._pendingCacheWrites = {};
        this._pendingCacheWrites[cache] = data;
        if (scheduleFlush) setImmediate(() => { this.flushCaches(); });
    }

    /**
     * removes all ops from the lookup that can not be found on disk anymore,
     * i.e. in core, extensions or the op directories of the current project
     */
    removeMissingOpsFromLookup()
    {
        const cachedLookup = this.getCachedOpLookup(false);
        if (!cachedLookup || !cachedLookup.names) return;

        // ops in core and extensions are in the signature, validateOpCaches removes them as soon as they are deleted on disk
        const cachedOpDocs = this.getCachedOpDocs();
        const signature = (cachedOpDocs && cachedOpDocs.signature) || {};
        const coreOps = signature.core || {};
        const extensionOps = signature.extensions || {};
        const missingOps = Object.keys(cachedLookup.names).filter((opName) =>
        {
            if (coreOps.hasOwnProperty(opName) || extensionOps.hasOwnProperty(opName)) return false;
            return !opsUtil.opFileExists(opName);
        });
        if (missingOps.length === 0) return;
        this._log.info("removing", missingOps.length, "ops that no longer exist on disk from lookup");
        this.removeOpNamesFromLookup(missingOps);
    }

    /**
     * writes pending changes of the caches to disk
     */
    flushCaches()
    {
        const pendingWrites = this._pendingCacheWrites;
        this._pendingCacheWrites = null;
        if (!pendingWrites) return;
        Object.keys(pendingWrites).forEach((cache) =>
        {
            if (cache === this.OP_HISTORY_CACHE)
            {
                try
                {
                    // dev and packaged app share the file and might run at the same time, keep entries the other one added
                    const history = pendingWrites[cache];
                    let fileHistory = {};
                    try
                    {
                        fileHistory = jsonfile.readFileSync(cables.getOpHistoryFile());
                    }
                    catch (e) {}
                    Object.keys(fileHistory).forEach((opId) =>
                    {
                        const fileEntry = fileHistory[opId];
                        const entry = history[opId];
                        if (!entry)
                        {
                            history[opId] = fileEntry;
                            return;
                        }
                        const fileNames = [fileEntry.name].concat(fileEntry.oldNames || []);
                        fileNames.forEach((fileName) =>
                        {
                            if (!fileName || fileName === entry.name) return;
                            entry.oldNames = entry.oldNames || [];
                            if (!entry.oldNames.includes(fileName)) entry.oldNames.push(fileName);
                        });
                        if (!entry.dir && fileEntry.dir) entry.dir = fileEntry.dir;
                    });
                    this._opHistory = history;
                    jsonfile.writeFileSync(cables.getOpHistoryFile(), history);
                }
                catch (e)
                {
                    this._log.warn("failed to write op history", e.message);
                }
            }
            else
            {
                super._writeCache(cache, pendingWrites[cache]);
            }
        });
    }

    /**
     *
     * @param {String} opId
     * @returns {{name: String, oldNames?: String[], dir?: String, removed?: Number, deleted?: Number}|null}
     */
    getOpHistoryEntry(opId)
    {
        if (!opId) return null;
        return this._getOpHistory()[opId] || null;
    }

    _getOpHistory()
    {
        if (!this._opHistory)
        {
            try
            {
                this._opHistory = jsonfile.readFileSync(cables.getOpHistoryFile());
            }
            catch (e)
            {
                this._opHistory = {};
            }
        }
        return this._opHistory;
    }

    _addToOpHistory(opId, opName, removed = false)
    {
        if (!opId || !opName) return;
        const history = this._getOpHistory();
        const entry = history[opId] || { "name": opName };
        let changed = !history[opId];

        if (entry.name !== opName)
        {
            entry.oldNames = entry.oldNames || [];
            if (!entry.oldNames.includes(entry.name)) entry.oldNames.push(entry.name);
            entry.name = opName;
            changed = true;
        }

        if (removed)
        {
            if (entry.dir && !entry.removed)
            {
                entry.removed = Date.now();
                changed = true;
            }
        }
        else
        {
            const opDir = opsUtil.getOpAbsolutePath(opName);
            const opDirPrefix = opDir ? path.join(opDir, path.sep) : "";
            let isCoreOrExtension = false;
            if (opDirPrefix.startsWith(path.join(cables.getCoreOpsPath(), path.sep))) isCoreOrExtension = true;
            if (opDirPrefix.startsWith(path.join(cables.getExtensionOpsPath(), path.sep))) isCoreOrExtension = true;
            if (opDir && !isCoreOrExtension && entry.dir !== opDir && fs.existsSync(opDir))
            {
                entry.dir = opDir;
                changed = true;
            }
            if (entry.removed)
            {
                delete entry.removed;
                changed = true;
            }
            if (entry.deleted)
            {
                delete entry.deleted;
                changed = true;
            }
        }

        history[opId] = entry;
        if (changed) this._writeCache(this.OP_HISTORY_CACHE, history);
    }

    /**
     * @param {String} opName
     */
    markOpDeletedInHistory(opName)
    {
        const cachedLookup = this.getCachedOpLookup(false);
        const opId = cachedLookup && cachedLookup.names ? cachedLookup.names[opName] : null;
        if (!opId) return;
        this._addToOpHistory(opId, opName, true);
        const entry = this._getOpHistory()[opId];
        if (!entry || !entry.dir) return;
        entry.deleted = Date.now();
        this._writeCache(this.OP_HISTORY_CACHE, this._getOpHistory());
    }

    addOpsToLookup(ops, clearFiles = false, haltOnError = false)
    {
        super.addOpsToLookup(ops, clearFiles, haltOnError);
        if (!ops) return;
        ops.forEach((op) =>
        {
            if (op) this._addToOpHistory(op.id, op.name);
        });
    }

    replaceOpNameInLookup(oldName, newName)
    {
        const cachedLookup = this.getCachedOpLookup(false);
        const opId = cachedLookup && cachedLookup.names ? cachedLookup.names[oldName] : null;
        super.replaceOpNameInLookup(oldName, newName);
        this._addToOpHistory(opId, newName);
    }

    removeOpNamesFromLookup(opNames)
    {
        const cachedLookup = this.getCachedOpLookup(false);
        if (opNames && cachedLookup && cachedLookup.names && cachedLookup.ids)
        {
            opNames.forEach((opName) =>
            {
                const opId = cachedLookup.names[opName];
                if (opId && cachedLookup.ids[opId] === opName) this._addToOpHistory(opId, opName, true);
            });
        }
        super.removeOpNamesFromLookup(opNames);
    }

    /**
     *
     * @param {String} opName
     * @returns {OpDoc}
     */
    buildOpDocs(opName)
    {
        const docObj = super.buildOpDocs(opName);
        if (docObj && docObj.hasPublicRepo)
        {
            const opDir = this._opsUtil.getOpAbsolutePath(opName);
            let isPublicRepoOp = false;
            if (opDir)
            {
                const opDirPrefix = path.join(opDir, path.sep);
                if (opDirPrefix.startsWith(path.join(cables.getCoreOpsPath(), path.sep))) isPublicRepoOp = true;
                if (opDirPrefix.startsWith(path.join(cables.getExtensionOpsPath(), path.sep))) isPublicRepoOp = true;
            }
            if (!isPublicRepoOp) delete docObj.hasPublicRepo;
        }
        return docObj;
    }

    getDocForOp(opName, docs = null)
    {
        if (!opName) return null;
        if (!this._opsUtil.isOpNameValid(opName)) return null;
        if (!docs) docs = this.getOpDocs();
        for (let i = 0; i < docs.length; i++)
        {
            if (docs[i].name === opName)
            {
                return docs[i];
            }
        }
        return this.buildOpDocs(opName);
    }

    getOpDocsInDir(opDir)
    {
        const opDocs = [];
        if (fs.existsSync(opDir))
        {
            const opJsons = helper.getFilesRecursive(opDir, ".json");
            for (let jsonPath in opJsons)
            {
                const opName = path.basename(jsonPath, ".json");
                if (opsUtil.isOpNameValid(opName) && fs.existsSync(path.join(opDir, path.dirname(jsonPath), opsUtil.getOpFileName(opName))))
                {
                    try
                    {
                        const opDoc = jsonfile.readFileSync(path.join(opDir, jsonPath));
                        opDoc.name = opName;
                        opDocs[jsonPath] = opDoc;
                    }
                    catch (e)
                    {
                        this._log.warn("failed to parse opdocs for", opName, "from", jsonPath);
                    }
                }
            }
        }
        return opDocs;
    }

    /**
     *
     * @param {OpDoc[]} opDocs
     * @param {Boolean} [includeOpDir=false]
     * @returns {OpDoc[]}
     */
    makeReadable(opDocs, includeOpDir = false)
    {
        const readableDocs = super.makeReadable(opDocs, true);
        if (!readableDocs) return readableDocs;

        const dirInfos = this._projectsUtil.getOpDirs(settings.getCurrentProject());
        readableDocs.forEach((opDoc) =>
        {
            if (!opDoc.opDir || !opDoc.opDir.dir) return;
            const opDirPrefix = path.join(opDoc.opDir.dir, path.sep);
            const dirInfo = dirInfos.find((info) => { return opDirPrefix.startsWith(path.join(info.dir, path.sep)); });
            if (dirInfo)
            {
                opDoc.opDir.type = dirInfo.type;
            }
            else if (cables.isPackaged())
            {
                // core and extension ops of the app package
                delete opDoc.opDir;
            }
        });
        return readableDocs;
    }

    updateOpDocs(opName)
    {
        if (this._projectsUtil.isOpInProjectDir(opName)) this._projectsUtil.invalidateProjectCaches();
        this._updateExtensionSignature(opName);
        return super.updateOpDocs(opName);
    }

    deleteOpDocs(opName)
    {
        this._updateExtensionSignature(opName);
        return super.deleteOpDocs(opName);
    }

    _updateExtensionSignature(opName)
    {
        // collection caches are rebuilt by the caller, no need to do that again on the next check
        const cachedOpDocs = this.getCachedOpDocs();
        if (!opName || !opsUtil.isExtensionOp(opName)) return;
        if (!cachedOpDocs || !cachedOpDocs.signature || !cachedOpDocs.signature.extensions) return;

        const signature = this.getOpDocsSignature().extensions[opName];
        if (signature)
        {
            cachedOpDocs.signature.extensions[opName] = signature;
        }
        else
        {
            delete cachedOpDocs.signature.extensions[opName];
        }
    }
}
export default new DocUtil(utilProvider);
