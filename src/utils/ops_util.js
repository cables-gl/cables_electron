import path from "path";
import fs from "fs";
import jsonfile from "jsonfile";
import { mkdirp } from "mkdirp";
import { CLIEngine } from "eslint";
import uuidv4 from "uuid-v4";
import * as doc from "../doc.js";
import * as cables from "../cables.js";
import helper from "./helper_util.js";

class OpsUtil
{
    constructor()
    {
        this._log = console;

        this.PREFIX_OPS = "Ops.";
        this.PREFIX_USEROPS = "Ops.User.";
        this.PREFIX_TEAMOPS = "Ops.Team.";
        this.PREFIX_EXTENSIONOPS = "Ops.Extension.";
        this.PREFIX_ADMINOPS = "Ops.Admin.";
        this.PREFIX_PATCHOPS = "Ops.Patch.P";

        this.INFIX_DEPRECATED = ".Deprecated.";
        this.INFIX_DEVOPS = ".Dev.";
        this.SUFFIX_VERSION = "_v";

        this.PATCHOPS_ID_REPLACEMENTS = {
            "-": "___"
        };

        this.BLUEPRINT_OP_NAME = "Ops.Dev.Blueprint";
        this.SUBPATCH_OP_CURRENT_VERSION = 1;
        this.FXHASH_OP_NAME = "Ops.Api.FxHash.FxHash";

        this.SUBPATCH_ATTACHMENT_NAME = "att_subpatch_json";

        this.OP_NAME_MIN_LENGTH = 5;

        this.OP_NAMESPACE_SUMMARIES =
            [
                {
                    "ns": "Ops.Gl",
                    "summary": "WebGl Ops"
                },
                {
                    "ns": "Ops.Exp",
                    "summary": "Experimental Ops"
                },
                {
                    "ns": "Ops.Anim",
                    "summary": "Animations"
                },
                {
                    "ns": "Ops.Array",
                    "summary": "process and manipulate collections (arrays) of data"
                }
            ];

        this.INVISIBLE_NAMESPACES = [
            this.PREFIX_ADMINOPS,
            this.PREFIX_USEROPS
        ];

        this.cli = new CLIEngine(this._getCLIConfig());
    }

    _getCLIConfig()
    {
        return {
            "fix": true,
            "baseConfig": {
                "extends": ["airbnb-base"],
            },
            "envs": ["browser"],
            "useEslintrc": false,
            "globals": [
                "op",
                "gui",
                "navigator",
                "document",
                "BroadcastChannel",
                "window",
                "AudioContext",
                "CABLES",
                "XMLHttpRequest",
                "Raphael",
                "ace",
                "logStartup",
                "attachments",
                "CABLESUILOADER",
                "iziToast",
                "CGL",
                "vec2",
                "vec3",
                "vec4",
                "mat3",
                "mat4",
                "quat",
                "chroma",
                "QRCode",
                "moment",
                "introJs",
                "UndoManager",
                "Handlebars",
                "hljs",
                "tinysort",
                "loadjs",
                "MathParser",
                "socketClusterClient",
                "incrementStartup",
                "mmd"
            ],
            "env": {
                "browser": true
            },
            "parserOptions": {
                "ecmaVersion": 2020
            },
            "rules": {
                "object-property-newline": "error",
                "global-require": 1,
                "no-compare-neg-zero": 0,
                "camelcase": 0,
                "class-methods-use-this": 0,
                "no-var": 1,
                "vars-on-top": 0,
                "no-bitwise": 0,
                "no-underscore-dangle": 0,
                "brace-style": [
                    1,
                    "allman",
                    {
                        "allowSingleLine": true
                    }
                ],
                "func-names": 0,
                "max-len": [
                    0,
                    {
                        "code": 120,
                        "tabWidth": 4,
                        "comments": 300,
                        "ignoreComments": true
                    }
                ],
                "no-param-reassign": 0,
                "consistent-return": 0,
                "eqeqeq": 0,
                "one-var": 0,
                "no-unused-vars": 0,
                "no-lonely-if": 0,
                "no-plusplus": 0,
                "indent": [
                    1,
                    4
                ],
                "quotes": [
                    1,
                    "double"
                ],
                "quote-props": [
                    1,
                    "always"
                ],
                "comma-dangle": 0,
                "nonblock-statement-body-position": 0,
                "curly": 0,
                "object-shorthand": 0,
                "prefer-spread": 0,
                "no-loop-func": 0,
                "no-trailing-spaces": 1,
                "space-before-function-paren": 1,
                "space-in-parens": 1,
                "space-infix-ops": 1,
                "keyword-spacing": 1,
                "padded-blocks": 1,
                "comma-spacing": 1,
                "space-before-blocks": 1,
                "spaced-comment": 1,
                "object-curly-spacing": 1,
                "object-curly-newline": 0,
                "implicit-arrow-linebreak": 0,
                "operator-linebreak": 0,
                "array-element-newline": 0,
                "function-paren-newline": 0,
                "no-self-compare": 0,
                "no-case-declarations": 0,
                "default-case": 0,
                "no-empty": 0,
                "no-use-before-define": 0,
                "no-multi-assign": 0,
                "no-extend-native": 0,
                "no-prototype-builtins": 0,
                "array-callback-return": 1,
                "prefer-destructuring": 0,
                "no-restricted-syntax": ["error", "TemplateLiteral"],
                "no-restricted-globals": 0,
                "no-continue": 0,
                "no-console": 1,
                "no-else-return": 0,
                "one-var-declaration-per-line": 0,
                "guard-for-in": 0,
                "no-new": 0,
                "radix": 0,
                "no-template-curly-in-string": 0,
                "no-useless-constructor": 0,
                "import/no-dynamic-require": 0,
                "import/no-cycle": [
                    1,
                    {
                        "maxDepth": 3
                    }
                ],
                "prefer-template": 0,
                "prefer-rest-params": 0,
                "no-restricted-properties": 0,
                "import/prefer-default-export": 0,
                "import/no-default-export": 0,
                "prefer-arrow-callback": 0,
                "arrow-body-style": ["error", "always"],
                "new-cap": 0,
                "prefer-const": 0,
                "padding-line-between-statements": [
                    1,
                    {
                        "blankLine": "always",
                        "prev": "function",
                        "next": "*"
                    }
                ],
                "no-return-await": 0
            }
        };
    }

    buildCode(basePath, codePrefix, opDocs, filterOldVersions = false, filterDeprecated = false)
    {
        if (!opDocs)
        {
            this._log.warn("buildCode without opDocs!");
            return;
        }

        if (!basePath || !fs.existsSync(basePath))
        {
            return "";
        }
        else
        {
            const dir = fs.readdirSync(basePath);
            const ops = [];
            for (let i = 0; i < dir.length; i++)
            {
                const dirName = dir[i];
                if (!this.isOpNameValid(dirName)) continue;
                if (codePrefix !== "none")
                {
                    if (!codePrefix && dirName.startsWith(this.PREFIX_USEROPS)) continue;
                    if (codePrefix && !dirName.startsWith(codePrefix)) continue;
                }
                if (filterDeprecated && this.isDeprecated(dirName)) continue;
                if (filterOldVersions && this.isOpOldVersion(dirName, opDocs)) continue;

                const opId = this.getOpIdByObjName(dirName);
                ops.push({ "objName": dirName, "opId": opId });
            }
            return this.buildFullCode(ops, codePrefix, opDocs, filterOldVersions, filterDeprecated);
        }
    }

    buildFullCode(ops, codePrefix, opDocs, filterOldVersions = false, filterDeprecated = false)
    {
        let codeNamespaces = [];
        let code = "";

        const opNames = [];
        ops = ops.filter((op) =>
        {
            const opName = this.getOpNameById(op.opId) || op.objName;

            if (!this.isOpNameValid(opName)) return false;
            if (codePrefix !== "none")
            {
                if (!codePrefix && opName.startsWith(this.PREFIX_USEROPS)) return false;
                if (codePrefix && !opName.startsWith(codePrefix)) return false;
            }
            if (filterDeprecated && this.isDeprecated(opName)) return false;
            if (filterOldVersions && this.isOpOldVersion(opName, opDocs)) return false;

            opNames.push(opName);
            return true;
        });

        for (const i in ops)
        {
            let fn = "";
            let opName = ops[i].objName;
            if (!ops[i].opId)
            {
                ops[i].opId = this.getOpIdByObjName(ops[i].objName);
            }
            else
            {
                opName = this.getOpNameById(ops[i].opId);
            }

            if (!fn) fn = this.getOpAbsoluteFileName(opName);

            try
            {
                const parts = opName.split(".");
                for (let k = 1; k < parts.length; k++)
                {
                    let partPartname = "";
                    for (let j = 0; j < k; j++) partPartname += parts[j] + ".";

                    partPartname = partPartname.substr(0, partPartname.length - 1);
                    codeNamespaces.push(partPartname + "=" + partPartname + " || {};");
                }

                code += this.getOpFullCode(fn, opName, ops[i].opId);
            }
            catch (e)
            {
                if (this.isUserOp(opName))
                {
                    this._log.warn("op read error: " + opName, fn, e.stacktrace);
                }
                else
                {
                    this._log.error("op read error:" + opName, fn, e.stacktrace);
                }
            }
        }

        codeNamespaces = this._sortAndReduceNamespaces(codeNamespaces);
        let fullCode = "\"use strict\";\n\nvar CABLES=CABLES||{};\nCABLES.OPS=CABLES.OPS||{};\n\n";
        if (codeNamespaces && codeNamespaces.length > 0)
        {
            codeNamespaces[0] = "var " + codeNamespaces[0];
            fullCode += codeNamespaces.join("\n") + "\n\n";
        }

        fullCode += code;
        return fullCode;
    }

    getOpFullCode(fn, name, opid = null)
    {
        try
        {
            const code = fs.readFileSync(fn, "utf8");
            if (!opid) opid = this.getOpIdByObjName(name);
            let codeAttachments = "const attachments={";
            let codeAttachmentsInc = "";
            const dir = fs.readdirSync(path.dirname(fn));
            for (const i in dir)
            {
                if (dir[i].startsWith("att_inc_"))
                {
                    codeAttachmentsInc += fs.readFileSync(path.dirname(fn) + "/" + dir[i], "utf8");
                }
                if (dir[i].startsWith("att_bin_"))
                {
                    let varName = dir[i].substr(4, dir[i].length - 4);
                    varName = varName.replace(/\./g, "_");
                    codeAttachments += "\"" + varName + "\":\"" + Buffer.from(fs.readFileSync(path.dirname(fn) + "/" + dir[i]))
                        .toString("base64") + "\",";
                }
                else if (dir[i].startsWith("att_"))
                {
                    let varName = dir[i].substr(4, dir[i].length - 4);
                    varName = varName.replace(/\./g, "_");
                    codeAttachments += "\"" + varName + "\":" + JSON.stringify(fs.readFileSync(path.dirname(fn) + "/" + dir[i], "utf8")) + ",";
                }
            }

            codeAttachments += "};\n";

            const codeHead = "\n\n// **************************************************************\n" +
                "// \n" +
                "// " + name + "\n" +
                "// \n" +
                "// **************************************************************\n\n" +
                name + " = function()\n{\nCABLES.Op.apply(this,arguments);\nconst op=this;\n";
            let codeFoot = "\n\n};\n\n" + name + ".prototype = new CABLES.Op();\n";

            if (opid) codeFoot += "CABLES.OPS[\"" + opid + "\"]={f:" + name + ",objName:\"" + name + "\"};";
            codeFoot += "\n\n\n";

            return codeHead + codeAttachments + codeAttachmentsInc + code + codeFoot;
        }
        catch (e)
        {
            this._log.error("getfullopcode fail", fn, name, e);
        }
        return "";
    }

    getOpNameById(id)
    {
        const idLookup = doc.getCachedOpLookup();
        if (idLookup && idLookup.ids)
        {
            return idLookup.ids[id] || "";
        }
        return "";
    }

    getOpIdByObjName(objName)
    {
        const nameLookup = doc.getCachedOpLookup();
        if (nameLookup && nameLookup.names)
        {
            let lookupId = nameLookup.names[objName];
            if (!lookupId)
            {
                const opDoc = doc.buildOpDocs(objName);
                if (opDoc && opDoc.id)
                {
                    doc.addOpToLookup(opDoc.id, objName);
                    lookupId = opDoc.id;
                }
            }
            if (!lookupId) this._log.error("FAILED TO FIND OPID FOR", objName);
            return lookupId;
        }
        return null;
    }

    getOpAbsoluteFileName(opname)
    {
        if (this.isOpNameValid(opname))
        {
            return this.getOpAbsolutePath(opname) + opname + ".js";
        }
        return null;
    }


    isOpNameValid(name)
    {
        if (!name) return false;
        if (name.length < this.OP_NAME_MIN_LENGTH) return false;
        if (name.indexOf("..") !== -1) return false;
        let matchString = "[^abcdefghijklmnopqrstuvwxyz._ABCDEFGHIJKLMNOPQRSTUVWXYZ0-9";
        // patchops can have - because they contain the patch shortid
        if (this.isPatchOp(name) || this.isTeamOp(name)) matchString += "\\-";
        matchString += "]";
        if (name.match(matchString)) return false;

        const parts = name.split(".");
        for (let i = 0; i < parts.length; i++) // do not start
        {
            const firstChar = parts[i].charAt(0);
            const isnum = !isNaN(firstChar);
            if (isnum) return false;
            if (firstChar === "-") return false;
        }

        if (name.endsWith(".json")) return false;

        return name.startsWith(this.PREFIX_OPS);
    }

    isPatchOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_PATCHOPS);
    }

    isUserOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_USEROPS);
    }

    isTeamOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_TEAMOPS);
    }

    isPrivateOp(opname)
    {
        if (!opname) return false;
        return this.isTeamOp(opname) || this.isPatchOp(opname) || this.isUserOp(opname);
    }

    isCollection(name)
    {
        if (!name) return false;
        return this.isTeamNamespace(name) || this.isExtensionNamespace(name);
    }

    isTeamNamespace(name)
    {
        if (!name) return false;
        return name.startsWith(this.PREFIX_TEAMOPS);
    }

    isExtensionNamespace(name)
    {
        if (!name) return false;
        return name.startsWith(this.PREFIX_EXTENSIONOPS);
    }

    addVersionInfoToOps(opDocs)
    {
        for (let j = 0; j < opDocs.length; j++)
        {
            opDocs[j].oldVersion = this.isOpOldVersion(opDocs[j].name, opDocs);
            if (this.isPrivateOp(opDocs[j].name))
            {
                opDocs[j].hidden = false;
            }
            else
            {
                if (opDocs[j].oldVersion) opDocs[j].hidden = true;
            }

            opDocs[j].versions = this.getOpVersionNumbers(opDocs[j].name, opDocs);

            opDocs[j].newestVersion = null;
            if (opDocs[j].versions)
            {
                opDocs[j].newestVersion = opDocs[j].versions[opDocs[j].versions.length - 1];
            }
        }
        return opDocs;
    }

    isOpOldVersion(opname, opDocs = null)
    {
        if (!opDocs) opDocs = doc.getOpDocs();
        const opnameWithoutVersion = this.getOpNameWithoutVersion(opname);
        const theVersion = this.getVersionFromOpName(opname);

        for (let i = 0; i < opDocs.length; i++)
            if (opDocs[i] && opDocs[i].nameNoVersion === opnameWithoutVersion)
                if (opDocs[i].version > theVersion) return true;

        return false;
    }

    getOpNameWithoutVersion(opname)
    {
        const ver = this.getVersionFromOpName(opname);

        let str = "";
        if (ver) str = this.SUFFIX_VERSION + ver;

        return opname.substring(0, opname.length - str.length);
    }

    getVersionFromOpName(opname)
    {
        if (!opname) return 0;
        if (opname.indexOf(this.SUFFIX_VERSION) === -1) return 0;

        const parts = opname.split(".");
        const lastPart = parts[parts.length - 1];
        const lastParts = lastPart.split(this.SUFFIX_VERSION);

        if (lastParts.length === 2)
        {
            if (helper.isNumeric(lastParts[1]))
            {
                return parseFloat(lastParts[1]);
            }
            else return 0;
        }
        else return 0;
    }

    getOpVersionNumbers(opname, opDocs)
    {
        let versions = [];
        if (!opname) return versions;

        const nameWithoutVersion = this.getOpNameWithoutVersion(opname);

        for (let i = 0; i < opDocs.length; i++)
            if (opDocs[i].nameNoVersion === nameWithoutVersion)
            {
                versions = versions || [];

                const v = this.getVersionFromOpName(opDocs[i].name);
                let vStr = this.SUFFIX_VERSION + v;
                if (v === 0) vStr = "";
                versions.push(
                    {
                        "name": opDocs[i].name,
                        "versionString": vStr,
                        "version": v
                    }
                );
            }

        return versions;
    }

    getOpSourceDir(opName)
    {
        if (opName.endsWith(".")) opName = opName.substring(0, opName.length - 1);
        if (this.isUserOp(opName))
        {
            return path.join(cables.getUserOpsPath(), opName, "/");
        }
        else if (this.isCollection(opName))
        {
            return path.join(this.getCollectionDir(opName), opName, "/");
        }
        else if (this.isPatchOp(opName))
        {
            return path.join(this.getPatchOpDir(opName), opName, "/");
        }
        else
        {
            return path.join(cables.getCoreOpsPath(), opName, "/");
        }
    }

    getCollectionDir(name)
    {
        if (this.isExtensionNamespace(name)) return this.getExtensionDir(name);
        if (this.isTeamNamespace(name)) return this.getTeamNamespaceDir(name);
        return null;
    }

    getPatchOpDir(name)
    {
        const patchOpDir = name ? name.split(".", 3).join(".") : null;
        const extensionPath = path.join(cables.getPatchOpsPath(), "/", patchOpDir, "/");
        return path.join(extensionPath, "/");
    }

    getTeamNamespaceDir(name)
    {
        let teamNameSpace = this.getTeamNamespaceByOpName(name);
        if (!name || !teamNameSpace) return null;

        if (!teamNameSpace.startsWith(this.PREFIX_TEAMOPS))
        {
            // shortname given
            teamNameSpace = this.PREFIX_TEAMOPS + name;
        }
        if (teamNameSpace.endsWith(".")) teamNameSpace = teamNameSpace.substring(0, teamNameSpace.length - 1);
        const teamNamespacePath = path.join(cables.getTeamOpsPath(), "/", teamNameSpace, "/");
        return path.join(teamNamespacePath, "/");
    }

    getExtensionDir(name)
    {
        let extensionName = this.getExtensionNamespaceByOpName(name);
        if (extensionName.endsWith(".")) extensionName = extensionName.substring(0, extensionName.length - 1);
        const extensionPath = path.join(cables.getExtensionOpsPath(), "/", extensionName, "/");
        return path.join(extensionPath, "/");
    }

    getExtensionNamespaceByOpName(opName)
    {
        return opName ? opName.split(".", 3).join(".") + "." : null;
    }

    getTeamNamespaceByOpName(opName)
    {
        return opName ? opName.split(".", 3).join(".") + "." : null;
    }

    getAttachmentFiles(opname)
    {
        const attachmentFiles = [];
        const dirName = this.getOpAbsolutePath(opname);

        try
        {
            const attFiles = fs.readdirSync(dirName);
            for (const j in attFiles) if (attFiles[j].indexOf("att_") === 0) attachmentFiles.push(attFiles[j]);
        }
        catch (e)
        {
            this._log.error("getattachmentfiles exception " + dirName);
        }

        return attachmentFiles;
    }

    getOpAbsolutePath(opname)
    {
        if (!opname) return null;
        if (!this.isOpNameValid(opname)) return null;

        return this.getOpSourceDir(opname);
    }

    isDeprecated(opname)
    {
        if (!opname) return false;
        return opname.includes(this.INFIX_DEPRECATED);
    }

    isAdminOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_ADMINOPS);
    }

    _sortAndReduceNamespaces(arr)
    {
        const uniq = arr.slice() // slice makes copy of array before sorting it
            .sort()
            .reduce(function (a, b)
            {
                if (a.slice(-1)[0] !== b) a.push(b); // slice(-1)[0] means last item in array without removing it (like .pop())
                return a;
            }, []); // this empty array becomes the starting value for a

        arr = uniq.sort(function (a, b)
        {
            return a.length - b.length;
        });

        return arr;
    }

    addPermissionsToOps(ops, user, teams = [], project = null)
    {
        if (!ops) return ops;
        ops.forEach((op) =>
        {
            if (op) op.allowEdit = true;
        });
        return ops;
    }

    isExtension(name)
    {
        if (!name) return false;
        return name.startsWith(this.PREFIX_EXTENSIONOPS);
    }

    getCollectionOpNames(collectionName, filterInvisibleOps = false)
    {
        let opNames = [];
        let dir = cables.getUserOpsPath();
        if (this.isPatchOpNamespace(collectionName)) dir = this.getPatchOpDir(collectionName);
        if (this.isCollection(collectionName)) dir = this.getCollectionDir(collectionName);

        if (fs.existsSync(dir))
        {
            const dirContents = fs.readdirSync(dir);
            dirContents.forEach((dirContent) =>
            {
                if (this.isOpNameValid(dirContent) && dirContent.startsWith(collectionName))
                {
                    // keep this to update cache during runtime...
                    this.getOpIdByObjName(dirContent);
                    opNames.push(dirContent);
                }
            });
        }
        if (filterInvisibleOps) opNames = opNames.filter((opName) =>
        {
            return !this.isInvisible(opName);
        });
        return opNames;
    }

    isPatchOpNamespace(name)
    {
        if (!name) return false;
        return name.startsWith(this.PREFIX_PATCHOPS);
    }

    isInvisible(opName)
    {
        if (!opName) return true;
        let invisible = false;
        const namespace = this.getNamespace(opName) + ".";
        if (!cables.isDevEnv() && namespace.includes(this.INFIX_DEVOPS))
        {
            return true;
        }
        if (opName.includes(this.INFIX_DEPRECATED)) return true;
        for (let j = 0; j < this.INVISIBLE_NAMESPACES.length; j++)
        {
            if (namespace.startsWith(this.INVISIBLE_NAMESPACES[j]))
            {
                invisible = true;
                break;
            }
        }
        return invisible;
    }

    getNamespace(opname)
    {
        if (!opname) return "";
        const parts = opname.split(".");
        parts.length -= 1;
        return parts.join(".") + ".";
    }

    getExtensionShortName(extensionName)
    {
        const parts = extensionName.split(".", 3);
        return parts[2] || extensionName;
    }

    getCollectionDocs(name)
    {
        const file = this.getCollectionJsonPath(name, false);
        let docs = {};
        if (fs.existsSync(file)) docs = jsonfile.readFileSync(file);
        return docs;
    }

    getCollectionJsonPath(name, create = true)
    {
        let filename = this.getExtensionJsonPath(name, create);
        if (!filename) filename = this.getTeamNamespaceJsonPath(name, create);
        return filename;
    }

    getExtensionJsonPath(name, create = true)
    {
        const dirName = this.getExtensionDir(name);
        let extName = this.getExtensionNamespaceByOpName(name);
        if (extName.endsWith(".")) extName = extName.substring(0, extName.length - 1);
        const filename = path.join(dirName, extName + ".json");
        const exists = fs.existsSync(filename);
        let existsPath = fs.existsSync(dirName);
        if (!existsPath && create)
        {
            mkdirp.sync(dirName);
            existsPath = fs.existsSync(dirName);
        }
        if (existsPath && !exists && create) jsonfile.writeFileSync(filename, { "name": name }, { "encoding": "utf-8", "spaces": 4 });
        if (!existsPath) return null;
        return filename;
    }

    getTeamNamespaceJsonPath(name, create = true)
    {
        const dirName = this.getTeamNamespaceDir(name);
        let extName = this.getTeamNamespaceByOpName(name);
        if (extName.endsWith(".")) extName = extName.substring(0, extName.length - 1);
        const filename = path.join(dirName, extName + ".json");
        const exists = fs.existsSync(filename);
        let existsPath = fs.existsSync(dirName);
        if (!existsPath && create)
        {
            mkdirp.sync(dirName);
            existsPath = fs.existsSync(dirName);
        }
        if (existsPath && !exists && create) jsonfile.writeFileSync(filename, { "name": name }, { "encoding": "utf-8", "spaces": 4 });
        if (!existsPath) return null;
        return filename;
    }

    existingCoreOp(opname)
    {
        if (!opname) return false;
        return this.opExists(opname) && this.isCoreOp(opname);
    }

    opExists(name)
    {
        const p = this.getOpAbsolutePath(name);

        let exists = false;
        try
        {
            exists = fs.existsSync(p);
        }
        catch (e) {}
        return exists;
    }

    isCoreOp(opname)
    {
        if (!opname) return false;
        return !(this.isUserOp(opname) || this.isTeamOp(opname) || this.isExtensionOp(opname) || this.isPatchOp(opname));
    }

    isExtensionOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_EXTENSIONOPS);
    }

    getCollectionName(opName)
    {
        return opName ? opName.split(".", 3).join(".") : null;
    }

    addOpDocsForCollections(opNames, opDocs = [])
    {
        const allOpDocs = [...opDocs];
        const collections = {};
        opNames.forEach((opName) =>
        {
            if (this.existingCoreOp(opName)) return;
            const collectionName = this.getCollectionName(opName);
            if (!collections.hasOwnProperty(collectionName)) collections[collectionName] = [];
            collections[collectionName].push(opName);
        });

        Object.entries(collections).forEach((entry) =>
        {
            const [collectionName] = entry;
            const collectionFile = this.getCollectionOpDocFile(collectionName);
            if (!fs.existsSync(collectionFile))
            {
                this.buildOpDocsForCollection(collectionName);
            }
            let cacheDocs = [];
            try
            {
                if (fs.existsSync(collectionFile)) cacheDocs = JSON.parse(fs.readFileSync(collectionFile, { "encoding": "utf8" }));
            }
            catch (e)
            {
                this._log.warn("failed to read collection opdocs from", collectionFile, e);
            }
            cacheDocs.forEach((cacheDoc) =>
            {
                // keep this to update cache during runtime...
                this.getOpIdByObjName(cacheDoc.name);
                if (opNames.some((name) => { return cacheDoc.name.startsWith(name); })) allOpDocs.push(cacheDoc);
            });
        });

        return Object.values(allOpDocs.reduce((acc, obj) => { return { ...acc, [obj.id]: obj }; }, {}));
    }

    getCollectionOpDocFile(collectionName)
    {
        if (collectionName.endsWith(".")) collectionName = collectionName.substring(0, collectionName.length - 1);
        return path.join(cables.getOpDocsCachePath() + collectionName + ".json");
    }

    buildOpDocsForCollection(collectionName)
    {
        const collectionFile = this.getCollectionOpDocFile(collectionName);
        const collectionOps = this.getCollectionOpNames(collectionName);
        const newOpDocs = [];
        collectionOps.forEach((opName) =>
        {
            newOpDocs.push(doc.buildOpDocs(opName));
        });
        if (newOpDocs.length > 0)
        {
            jsonfile.writeFileSync(collectionFile, newOpDocs, { "encoding": "utf-8", "spaces": 4 });
        }
        else if (fs.existsSync(collectionFile))
        {
            fs.removeSync(collectionFile);
        }
        return newOpDocs;
    }

    getOpCode(objName)
    {
        const fn = this.getOpAbsoluteFileName(objName);
        try
        {
            if (fn && fs.existsSync(fn))
            {
                return fs.readFileSync(fn, "utf8");
            }
        }
        catch (e)
        {
            this._log.warn("op code file not found", objName);
        }
        return null;
    }

    validateAndFormatOpCode(code)
    {
        const { results } = this.cli.executeOnText(code);
        const {
            messages, errorCount, warningCount, fixableErrorCount, fixableWarningCount
        } = results[0];

        const hasFatal = messages.filter((message) => { return Boolean(message.fatal); }).length > 0;

        const status = {
            "formatedCode": helper.removeTrailingSpaces(code),
            "error": hasFatal,
            "message": messages[0]
        };
        if (results[0].output)
        {
            status.formatedCode = helper.removeTrailingSpaces(results[0].output);
        }
        return status;
    }

    getOpJsonPath(opname)
    {
        const dirName = this.getOpSourceDir(opname);
        const filename = path.join(dirName, opname + ".json");
        const exists = fs.existsSync(filename);
        const existsPath = fs.existsSync(dirName);
        if (existsPath && !exists) jsonfile.writeFileSync(filename, { "name": opname }, { "encoding": "utf-8", "spaces": 4 });
        if (!existsPath) return null;

        return filename;
    }

    setOpDefaults(opname, author)
    {
        const fn = this.getOpJsonPath(opname);
        jsonfile.readFile(fn, (err, obj) =>
        {
            if (err)
            {
                this._log.warn("op default error read", opname, fn, err.message);
                return;
            }
            let hasChanged = false;

            if (!obj.hasOwnProperty("authorName") && author)
            {
                obj.authorName = author.username;
                hasChanged = true;
            }

            if (!obj.hasOwnProperty("id"))
            {
                obj.id = uuidv4();
                hasChanged = true;
            }

            if (!obj.hasOwnProperty("created"))
            {
                obj.created = Date.now();
                hasChanged = true;
            }

            if (hasChanged)
            {
                jsonfile.writeFileSync(fn, obj, { "encoding": "utf-8", "spaces": 4 });
                doc.updateOpDocs(opname);
            }
        });
    }
}

export default new OpsUtil();
