import jsonfile from "jsonfile";
import fs from "fs-extra";
import eslint from "eslint";
import path from "path";
import marked from "marked";
import Moment from "moment";
import XMLWriter from "xml-writer";
import basename from "basename";
import uuidv4 from "uuid-v4";
import mkdirp from "mkdirp";
import Util from "./util.js";
import cables from "../cables.js";
import doc from "./doc_util.js";
import helper from "./helper_util.js";
import teamsUtil from "./teams_util.js";

jsonfile.spaces = 4;
const CLIEngine = eslint.CLIEngine;

class OpsUtil extends Util
{
    constructor()
    {
        super();

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

    getOpAbsoluteJsonFilename(opname)
    {
        const p = this.getOpAbsolutePath(opname);
        if (!p) return null;
        return p + opname + ".json";
    }

    getOpAbsolutePath(opname)
    {
        if (!opname) return null;
        if (!this.isOpNameValid(opname)) return null;

        return this.getOpSourceDir(opname);
    }

    getOpById(opDocs, id)
    {
        for (let i = 0; i < opDocs.length; i++)
        {
            if (opDocs[i].id === id) return opDocs[i];
        }
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


    /**
     * deperately try to find opid, slow and unused now (removed becasue - pandrr/cables/issues/4884)!
     * @param id
     * @param currentUser
     * @return {*|string}
     */
    _getOpNameByIdUncached(id, currentUser)
    {
        if (!id) return "";
        let opDoc = null;
        let opNames = this.getAllExtensionOpNames();
        let docs = doc.getOpDocsForCollections(opNames, currentUser);
        if (docs)
        {
            doc.addOpsToLookup(docs);
            opDoc = docs.find((d) => { return d.id === id; });
            if (opDoc && opDoc.name) return opDoc.name;
        }

        opNames = this.getAllTeamOpNames();
        docs = doc.getOpDocsForCollections(opNames, currentUser);
        if (docs)
        {
            doc.addOpsToLookup(docs);
            opDoc = docs.find((d) => { return d.id === id; });
            if (opDoc && opDoc.name) return opDoc.name;
        }

        opNames = this.getAllUserOpNames();
        docs = doc.getOpDocsForCollections(opNames, currentUser);
        if (doc)
        {
            doc.addOpsToLookup(docs);
            opDoc = docs.find((d) => { return d.id === id; });
            if (opDoc && opDoc.name) return opDoc.name;
        }

        opNames = this.getAllPatchOpNames();
        docs = doc.getOpDocsForCollections(opNames, currentUser);
        if (docs)
        {
            doc.addOpsToLookup(docs);
            opDoc = docs.find((d) => { return d.id === id; });
            if (opDoc && opDoc.name) return opDoc.name;
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
            return lookupId;
        }
        return null;
    }

    getAllVersionsOpIds(opname)
    {
        const ids = [];
        const nameLookup = doc.getCachedOpLookup();
        const opBaseName = this.getOpNameWithoutVersion(opname);
        if (nameLookup && nameLookup.names)
        {
            for (let name in nameLookup.names)
            {
                const id = nameLookup.names[name];
                if (name === opname || name.startsWith(opBaseName + this.SUFFIX_VERSION))
                {
                    ids.push(id);
                }
            }
        }
        return ids;
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

    getHighestVersionOpName(opName, opDocs = false)
    {
        if (!opDocs) opDocs = doc.getOpDocs();
        const opnameWithoutVersion = this.getOpNameWithoutVersion(opName);
        const highestVersion = this.getHighestVersionNumber(opName, opDocs);
        if (highestVersion === 0)
        {
            return opnameWithoutVersion;
        }
        else
        {
            return opnameWithoutVersion + this.SUFFIX_VERSION + highestVersion;
        }
    }

    getHighestVersionNumber(opName, opDocs)
    {
        const opnameWithoutVersion = this.getOpNameWithoutVersion(opName);

        let highestVersion = 0;
        opDocs.forEach((opDoc) =>
        {
            if (opDoc.nameNoVersion === opnameWithoutVersion)
            {
                if (opDoc.version > highestVersion)
                {
                    highestVersion = opDoc.version;
                }
            }
        });
        return highestVersion;
    }

    getNextVersionOpName(opName, opDocs)
    {
        const highestVersion = this.getHighestVersionOpName(opName, opDocs);
        let version = this.getVersionFromOpName(highestVersion);

        const noVersionName = this.getOpNameWithoutVersion(opName);

        let nextName = "";
        if (!this.opExists(noVersionName))
        {
            nextName = noVersionName;
        }
        else if (version === 0)
        {
            nextName = noVersionName + this.SUFFIX_VERSION + 2;
        }
        else
        {
            version++;
            nextName = noVersionName + this.SUFFIX_VERSION + version;
        }
        return nextName;
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

    getOpInfo(opname)
    {
        let info = {};

        const jsonFilename = this.getOpAbsolutePath(opname) + opname + ".json";
        const screenshotFilename = this.getOpAbsolutePath(opname) + "screenshot.png";
        const jsonExists = fs.existsSync(jsonFilename);
        let screenshotExists = false;
        try
        {
            screenshotExists = fs.existsSync(screenshotFilename);
        }
        catch (e)
        {}

        if (jsonExists)
        {
            info = jsonfile.readFileSync(jsonFilename);
            info.hasScreenshot = screenshotExists;
            info.shortName = opname.split(".")[opname.split(".").length - 1];
            info.hasExample = !!info.exampleProjectId;
        }
        info.doc = doc.getOpDocMd(opname);
        return info;
    }

    replaceLibrary(opname, oldLib, newLib, cb)
    {
        const filename = this.getOpAbsoluteJsonFilename(opname);
        jsonfile.readFile(filename, (err, obj) =>
        {
            if (obj)
            {
                const filteredLibs = obj.libs.filter((lib) => { return lib && (lib !== oldLib); });
                filteredLibs.push(newLib);
                obj.libs = filteredLibs;
            }
            jsonfile.writeFileSync(filename, obj, {
                "encoding": "utf-8",
                "spaces": 4
            });
            const newOpDocs = doc.updateOpDocs(opname);
            if (cb) cb(newOpDocs);
        });
    }

    addOpChangelog(user, opname, message, type, cb)
    {
        const change =
            {
                "message": message,
                "type": type,
                "author": user.username,
                "date": Date.now()
            };

        const filename = this.getOpAbsoluteJsonFilename(opname);
        this._log.info("add changelog", change, opname);
        const obj = jsonfile.readFileSync(filename);
        if (obj)
        {
            obj.changelog = obj.changelog || [];

            if (obj.changelog.length > 0)
            {
                if (obj.changelog[obj.changelog.length - 1].message !== change.message) obj.changelog.push(change);
            }
            else
            {
                obj.changelog.push(change);
            }
            jsonfile.writeFileSync(filename, obj, { "encoding": "utf-8", "spaces": 4 });
            if (cb)
            {
                const docs = doc.updateOpDocs(opname);
                cb(null, docs);
            }
            const logStr = "*" + user.username + "* added changelog " + opname + " " + message + " - https://cables.gl/op/" + opname;
            this._log.info(logStr);
        }
    }

    getOpFullCode(fn, name, opid = null)
    {
        try
        {
            const code = fs.readFileSync(fn, "utf8");
            if (!opid) opid = this.getOpIdByObjName(name);
            let codeAttachments = "const attachments=op.attachments={";
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

    getOpCodeWarnings(opname, jsFile = null)
    {
        const info = this.getOpInfo(opname);

        const blendmodeWarning = ": use `{{CGL.BLENDMODES}}` in your shader and remove all manual replace code";
        const srcWarnings = [];
        const fn = this.getOpAbsoluteFileName(opname);
        if (this.existingCoreOp(opname))
        {
            const parts = opname.split(".");
            for (let i = 0; i < parts.length; i++)
                if (parts[i].charAt(0) !== parts[i].charAt(0)
                    .toUpperCase())
                    srcWarnings.push({
                        "type": "name",
                        "id": "lowercase",
                        "text": marked("all namespace parts have to be capitalized")
                    });
        }

        if (jsFile || fs.existsSync(fn))
        {
            let code = jsFile || fs.readFileSync(fn, "utf8");

            if (!info.id) srcWarnings.push({
                "type": "json",
                "id": "noId",
                "text": marked("has no op id")
            });
            if (!info) srcWarnings.push({
                "type": "json",
                "id": "noJson",
                "text": marked("has no json")
            });
            else
            {
                if (!info.layout) srcWarnings.push({
                    "type": "json",
                    "id": "noLayout",
                    "text": marked("has no layout")
                });
                if (!info.authorName || info.authorName === "") srcWarnings.push({
                    "type": "json",
                    "id": "noAuthor",
                    "text": marked("has no author")
                });
            }

            if (code.indexOf("void main()") > -1) srcWarnings.push({
                "type": "code",
                "id": "inlineShaderCode",
                "text": marked("found shader code in the .js, should be put to an attachment")
            });

            if (code.indexOf("self.") > -1) srcWarnings.push({
                "type": "code",
                "id": "self",
                "text": ""
            });

            if (code.indexOf("cgl.mvMatrix") > -1) srcWarnings.push({
                "type": "code",
                "id": "mvMatrix",
                "text": marked("use of `MvMatrix` is deprecated, use cgl.mMatrix / cgl.vMatrix instead.")
            });

            if (code.indexOf("OP_PORT_TYPE_TEXTURE") > -1) srcWarnings.push({
                "type": "code",
                "id": "texturePortType",
                "text": marked("use `op.inTexture(\"name\")` to create a texture port ")
            });

            if (opname.indexOf("Ops.Gl.ImageCompose") >= 0 && code.indexOf("checkOpInEffect") == -1 && opname.indexOf("ImageCompose") == -1) srcWarnings.push({
                "type": "code",
                "id": "no_check_effect",
                "text": marked("every textureEffect op should use `if(!CGL.TextureEffect.checkOpInEffect(op)) return;` in the rendering function to automatically show a warning to the user if he is trying to use it outside of an imageCompose")
            });

            if (code.indexOf(".onValueChange") > -1) srcWarnings.push({
                "type": "code",
                "id": "onValueChanged",
                "text": marked("do not use `port.onValueChanged=`, now use `port.onChange=`")
            });

            if (code.indexOf(".inValueEditor") > -1) srcWarnings.push({
                "type": "code",
                "id": "inValueEditor",
                "text": marked("do not use `op.inValueEditor()`, now use `op.inStringEditor()`")
            });

            if (code.indexOf(".inFile") > -1) srcWarnings.push({
                "type": "code",
                "id": "inFile",
                "text": marked("do not use `op.inFile()`, now use `op.inUrl()`")
            });

            if (code.indexOf("op.outValue") > -1) srcWarnings.push({
                "type": "code",
                "id": "op.outValue",
                "text": marked("use `op.outNumber`, or `op.outString` ")
            });

            if (code.indexOf("\"use strict\";") > -1) srcWarnings.push({
                "type": "code",
                "id": "use strict",
                "text": marked("\"use strict\"; is not needed, remove it!")
            });

            if (code.indexOf("\nvar ") > -1) srcWarnings.push({
                "type": "code",
                "id": "var",
                "text": marked("use `let`, or `const` ")
            });

            if (code.indexOf(".val=") > -1 || code.indexOf(".val =") > -1 || code.indexOf(".val;") > -1) srcWarnings.push({
                "type": "code",
                "id": ".val",
                "text": marked("do not use `port.val`, now use `port.get()`")
            });

            if (code.indexOf("op.addInPort(") > -1) srcWarnings.push({
                "type": "code",
                "id": "port",
                "text": marked("use `op.inValue` or `op.inTrigger` etc. to create ports...")
            });

            if (code.indexOf("colorPick: 'true'") > -1 || code.indexOf("colorPick:'true'") > -1) srcWarnings.push({
                "type": "code",
                "id": "colorpick",
                "text": marked("how to create a colorpicker the nice way: \n const r = op.inValueSlider(\"r\", Math.random());\n\nconst g = op.inValueSlider(\"g\", Math.random());\nconst b = op.inValueSlider(\"b\", Math.random()); \nr.setUiAttribs({ colorPick: true }); ")
            });

            if (code.indexOf("blendMode.onChange") > -1) srcWarnings.push({
                "type": "code",
                "id": "blendmode",
                "text": marked("do not directly set `.onChange` for blendMode select. use this now: `CGL.TextureEffect.setupBlending(op,shader,blendMode,amount);`")
            });

            if (code.indexOf("op.outFunction") > -1) srcWarnings.push({
                "type": "code",
                "id": "outFunction",
                "text": marked("use `op.outTrigger` instead of `op.outFunction` ")
            });
            if (code.indexOf("op.inFunction") > -1) srcWarnings.push({
                "type": "code",
                "id": "inFunction",
                "text": marked("use `op.inTrigger` instead of `op.inFunction` ")
            });

            if (code.indexOf("{{BLENDCODE}}") > -1) srcWarnings.push({
                "type": "shadercode",
                "id": "blendmode",
                "text": marked(blendmodeWarning)
            });

            // remove comments, before checking for console usage
            code = code.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1");
            if (code.indexOf("console.log") > -1) srcWarnings.push({
                "type": "code",
                "id": "console.log",
                "text": marked("use `op.log`, not `console.log` ")
            });

            // if (code.indexOf("console.warn") > -1) srcWarnings.push({
            //     "type": "code",
            //     "id": "console.warn",
            //     "text": marked("use `op.logWarn`, not `console.warn` ")
            // });

            // if (code.indexOf("console.error") > -1) srcWarnings.push({
            //     "type": "code",
            //     "id": "console.error",
            //     "text": marked("use `op.logError`, not `console.error` ")
            // });

            const atts = this.getAttachmentFiles(opname);

            for (let i = 0; i < atts.length; i++)
            {
                if (atts[i].indexOf(".frag"))
                {
                    const opFn = this.getOpAbsolutePath(opname) + atts[i];
                    const att = fs.readFileSync(opFn, "utf8");

                    if (att.indexOf("gl_FragColor") > -1) srcWarnings.push({
                        "type": "shadercode",
                        "id": "gl_FragColor",
                        "text": marked(atts[i] + ": use `outColor=vec4();` instead of gl_FragColor.")
                    });
                    // if (att.indexOf("precision ") > -1) srcWarnings.push({ "type": "shadercode", "id": "precision ", "text": marked(atts[i] + ": do not set precision in shadercode") });
                    if (att.indexOf("texture2D(") > -1) srcWarnings.push({
                        "type": "shadercode",
                        "id": "texture2D ",
                        "text": marked(atts[i] + ": do not set `texture2D`, use `texture()`")
                    });
                    if (att.indexOf(" uniform") > -1) srcWarnings.push({
                        "type": "shadercode",
                        "id": "uniform ",
                        "text": marked(atts[i] + ": use `UNI` instead of `uniform`")
                    });
                    if (att.indexOf("{{BLENDCODE}}") > -1) srcWarnings.push({
                        "type": "shadercode",
                        "id": "blendmode",
                        "text": marked(atts[i] + blendmodeWarning)
                    });

                    if (att.indexOf("_blend(base.rgb,col.rgb)") > -1) srcWarnings.push({
                        "type": "shadercode",
                        "id": "blending",
                        "text": marked(atts[i] + " use `outColor=cgl_blend(oldColor,newColor,amount);`")
                    });
                }
            }
        }

        return srcWarnings;
    }

    getOpAbsoluteFileName(opname)
    {
        if (this.isOpNameValid(opname))
        {
            return this.getOpAbsolutePath(opname) + opname + ".js";
        }
        return null;
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
            this._log.warn("getattachmentfiles exception " + dirName);
        }

        return attachmentFiles;
    }

    getAttachments(opName)
    {
        const attachments = {};
        const attachmentFiles = this.getAttachmentFiles(opName);
        const dirName = this.getOpAbsolutePath(opName);
        attachmentFiles.forEach((file) =>
        {
            const filename = path.join(dirName, file);

            if (fs.existsSync(filename))
            {
                const att = fs.readFileSync(filename, { "encoding": "utf8" });
                attachments[file] = att;
            }
        });
        return attachments;
    }

    getAttachment(opName, attachmentName)
    {
        if (!opName || !attachmentName) return null;
        let attachment = null;
        const attachmentFiles = this.getAttachmentFiles(opName);
        const dirName = this.getOpAbsolutePath(opName);
        for (let i = 0; i < attachmentFiles.length; i++)
        {
            const file = attachmentFiles[i];
            if (file === attachmentName)
            {
                const filename = path.join(dirName, file);

                if (fs.existsSync(filename))
                {
                    attachment = fs.readFileSync(filename, { "encoding": "utf8" });
                    break;
                }
            }
        }
        return attachment;
    }

    userHasReadRightsOp(user, opname, teams = null, project = null)
    {
        if (!opname) return false;
        if (user && opname.startsWith(this.getUserNamespace(user.usernameLowercase))) return true;
        if (user && user.isAdmin === true) return true;
        if (this.isCoreOp(opname)) return true;
        if (this.isExtensionOp(opname)) return true;
        if (user && teams)
        {
            for (let i = 0; i < teams.length; i++)
            {
                const team = teams[i];
                if (teamsUtil.isMember(user, team)) return true;
            }
        }
        if (this.isPatchOpOfProject(opname, project))
        {
            // patchops are allowed to be seen by all patch collaborators, patch owners, and admins
            if (["public", "unlisted"].includes(project.visibility)) return true;
            if (user)
            {
                if (user.isAdmin) return true;
                if (project.users && project.users.indexOf(user._id) > -1) return true;
                if (project.usersReadOnly && project.usersReadOnly.indexOf(user._id) > -1) return true;
                if (project.userId == user._id) return true;
            }
        }

        if (user && this.isUserOp(opname))
        {
            if (!project) return false;
            const userId = user._id;
            if (project.usersReadOnly && project.usersReadOnly.indexOf(userId) > -1) return true;
            if (project.users && project.users.indexOf(userId) > -1) return true;
            if (project.userId == userId) return true;
        }
        return false;
    }

    userHasCreateRightsOp(user, opName, teams = [], project = null)
    {
        return (user && user.isAdmin) ? true : this.userHasWriteRightsOp(user, opName, teams, project);
    }

    userHasDeleteRightsOp(user, opName, teams = [], project = null)
    {
        // if (!this.isPrivateOp(opName)) return false;
        if (user && user.isAdmin)
        {
            return true;
        }
        if (this.isCoreOp(opName)) return false;
        return this.userHasWriteRightsOp(user, opName, teams, project);
    }

    userHasWriteRightsOp(user, opName, teams = [], project = null)
    {
        if (!user) return false;
        if (!opName) return false;
        if (!opName.startsWith(this.PREFIX_OPS)) return false;
        if (opName.indexOf("..") > -1) return false;
        if (opName.indexOf(" ") > -1) return false;
        if (opName.startsWith(".")) return false;
        if (opName.endsWith(".")) return false;

        const validName = this.isOpNameValid(opName);
        if (!validName) return false;

        const userRoles = (cables.getConfig().userRoles && cables.getConfig().userRoles.hasOwnProperty(user.usernameLowercase)) ? cables.getConfig().userRoles[user.usernameLowercase] : [];
        if (userRoles.includes("alwaysEditor"))
        {
            // users with "alwaysEditor" role are always allowed to edit everything
            return true;
        }

        if (this.isPatchOpOfProject(opName, project))
        {
            // patchops are allowed to be edited by project collaborators with full access, patch owners, and staff
            if (user.isStaff) return true;
            if (project.users && project.users.indexOf(user._id) > -1) return true;
            if (project.userId == user._id) return true;
        }
        if (this.isUserOp(opName))
        {
            if (user.isStaff || this.ownsUserOp(opName, user))
            {
                // staff may edit any userop, users are only allowed to edit their own userops
                return true;
            }
        }
        if (this.isExtensionOp(opName))
        {
            // extensions are readonly, except for staff
            return user.isStaff;
        }
        if (this.isTeamOp(opName))
        {
            // teamops are editable for team members with write access, and for staff
            if (user.isStaff) return true;

            let inTeam = false;
            for (let i = 0; i < teams.length; i++)
            {
                const team = teams[i];
                if (!this.isTeamOpOfTeam(opName, team)) continue;
                inTeam = teamsUtil.userHasWriteAccess(user, team);
                if (inTeam) break;
            }
            return inTeam;
        }
        if (user.isStaff)
        {
            // only staff admins is allowed to edit everything on dev
            return cables.isDevEnv();
        }
        return false;
    }

    userHasReadRightsNamespace(user, namespace, namespaceTeam)
    {
        if (!user || !namespace) return false;
        if (user.isStaff) return true;
        if (namespaceTeam && teamsUtil.isVisibleForUser(user, namespaceTeam)) return true;
        return false;
    }

    userHasWriteRightsNamespace(user, namespace, namespaceTeam)
    {
        if (!user || !namespace || !namespaceTeam) return false;
        if (user.isStaff) return true;
        if (namespaceTeam && teamsUtil.userHasWriteAccess(user, namespaceTeam)) return true;
        return false;
    }

    userHasDeleteRightsNamespace(user, namespace, namespaceTeam)
    {
        if (!user || !namespace) return false;
        return user.isStaff;
    }

    getAllOps(sessionUser, opDocs)
    {
        let i = 0;
        const arr = [];
        const dir = fs.readdirSync(cables.getCoreOpsPath());

        if (sessionUser)
        {
            const userOps = [];
            const dirUser = fs.readdirSync(cables.getUserOpsPath());

            for (i in dirUser)
            {
                if ((dirUser[i] + "").startsWith(this.getUserNamespace(sessionUser.username)) && this.isOpNameValid(dirUser[i]))
                {
                    dir.push(dirUser[i]);
                    userOps.push(dirUser[i]);
                }
            }
        }

        for (i in dir)
        {
            if (this.isOpNameValid(dir[i]))
            {
                const op = {
                    "id": this.getOpIdByObjName(dir[i]),
                    "name": dir[i]
                };

                if (this.isOpOldVersion(dir[i], opDocs)) op.oldVersion = true;
                if (this.isDeprecated(dir[i])) op.deprecated = true;

                const p = this.getOpAbsoluteFileName(dir[i]);
                try
                {
                    const o = jsonfile.readFileSync(p + "on");
                    if (o.libs && o.libs.length > 0) op.libs = o.libs;
                    if (o.coreLibs && o.coreLibs.length > 0) op.coreLibs = o.coreLibs;
                }
                catch (e) {}
                arr.push(op);
            }
        }
        return arr;
    }

    getOpsFromNameList(names)
    {
        const allOps = [];
        for (const i in names)
        {
            const op = {
                "id": this.getOpIdByObjName(names[i]),
                "name": names[i],
            };
            const libs = this.getOpLibs(names[i]);
            if (libs && libs.length > 0) op.libs = libs;

            const coreLibs = this.getOpCoreLibs(names[i]);
            if (coreLibs && coreLibs.length > 0) op.coreLibs = coreLibs;
            allOps.push(op);
        }
        return allOps;
    }

    addPermissionsToOps(ops, user, teams = [], project = null)
    {
        if (!ops) return ops;
        ops.forEach((op) => { if (op) op.allowEdit = this.userHasWriteRightsOp(user, op.name, teams, project); });
        return ops;
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


    getOpLibs(opName)
    {
        const p = this.getOpAbsoluteFileName(opName);
        try
        {
            const o = jsonfile.readFileSync(p + "on");
            if (o && o.libs) return o.libs;
        }
        catch (e) {}
        return [];
    }

    getOpCoreLibs(opName)
    {
        const p = this.getOpAbsoluteFileName(opName);
        try
        {
            const o = jsonfile.readFileSync(p + "on");
            if (o && o.coreLibs) return o.coreLibs;
        }
        catch (e) {}
        return [];
    }

    getUserOps(username)
    {
        const ops = [];
        const dirUser = fs.readdirSync(cables.getUserOpsPath());

        for (const i in dirUser)
        {
            const opname = dirUser[i];
            if ((opname + "").startsWith(this.getUserNamespace(username)) && this.isOpNameValid(opname))
            {
                const opn = opname;
                const fn = this.getOpJsonPath(opn);
                const jsonData = jsonfile.readFileSync(fn);

                let created = jsonData.created;
                if (created) created = new Moment(created).fromNow();
                else
                {
                    created = "";
                }

                const nameFields = ("" + opn).split(".");
                const shortName = nameFields[nameFields.length - 1];

                ops.push({
                    "name": "" + opn,
                    "shortName": shortName,
                    "created": created,
                    "createdDate": jsonData.created || 0,
                });
            }
        }

        ops.sort((a, b) =>
        {
        // if(!a.createdDate || !b.createdDate) return 10000;
            return b.createdDate - a.createdDate;
        });

        return ops;
    }

    getPatchOpNamespace(opName)
    {
        if (!opName || !this.isPatchOp(opName)) return null;
        let namespace = opName.split(".", 3).join(".");
        Object.keys(this.PATCHOPS_ID_REPLACEMENTS).forEach((key) =>
        {
            namespace = namespace.replaceAll(key, this.PATCHOPS_ID_REPLACEMENTS[key]);
        });
        return namespace + ".";
    }

    getPatchOpsNamespaceForProject(proj)
    {
        if (!proj || !proj.shortId) return null;
        let namespace = proj.shortId;
        Object.keys(this.PATCHOPS_ID_REPLACEMENTS).forEach((key) =>
        {
            namespace = namespace.replaceAll(key, this.PATCHOPS_ID_REPLACEMENTS[key]);
        });
        return this.PREFIX_PATCHOPS + namespace + ".";
    }

    getUserNamespace(username)
    {
        return this.PREFIX_USEROPS + helper.sanitizeUsername(username) + ".";
    }

    getAllPatchOpNames()
    {
        let opNames = [];

        const patches = fs.readdirSync(cables.getPatchOpsPath());

        for (const i in patches)
        {
            if (this.isPatchOpNamespace(patches[i]))
            {
                const dir = fs.readdirSync(path.join(cables.getPatchOpsPath(), patches[i]));
                for (const j in dir)
                {
                    if (this.isOpNameValid(dir[j])) opNames.push(dir[j]);
                }
            }
        }
        return opNames;
    }

    getAllUserOpNames()
    {
        const opNames = [];
        const dirUser = fs.readdirSync(cables.getUserOpsPath());

        for (const i in dirUser)
        {
            if (this.isOpNameValid(dirUser[i]))
            {
                opNames.push(dirUser[i]);
            }
        }
        return opNames;
    }

    getAllExtensionOpNames()
    {
        let opNames = [];

        const extensions = fs.readdirSync(cables.getExtensionOpsPath());

        for (const i in extensions)
        {
            if (this.isExtension(extensions[i]))
            {
                const dir = fs.readdirSync(path.join(cables.getExtensionOpsPath(), extensions[i]));
                for (const j in dir)
                {
                    if (this.isOpNameValid(dir[j])) opNames.push(dir[j]);
                }
            }
        }
        return opNames;
    }

    getAllTeamOpNames()
    {
        let opNames = [];

        const teams = fs.readdirSync(cables.getTeamOpsPath());

        for (const i in teams)
        {
            if (this.isTeamNamespace(teams[i]))
            {
                const dir = fs.readdirSync(path.join(cables.getTeamOpsPath(), teams[i]));
                for (const j in dir)
                {
                    if (this.isOpNameValid(dir[j])) opNames.push(dir[j]);
                }
            }
        }
        return opNames;
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

    getOpRenameProblems(newName, oldName, userObj, teams = [], newOpProject = null, oldOpProject = null)
    {
        const problems = {};
        if (!newName)
        {
            problems.no_name = "No op name.";
            newName = "";
        }

        let opNamespace = this.getNamespace(newName);
        if (!opNamespace || opNamespace === this.PREFIX_OPS) problems.namespace_empty = "Op namespace cannot be empty or only '" + this.PREFIX_OPS + "'.";

        if (newName.endsWith(".")) problems.name_ends_with_dot = "Op name cannot end with '.'";
        if (!newName.startsWith(this.PREFIX_OPS)) problems.name_not_op_namespace = "Op name does not start with '" + this.PREFIX_OPS + "'.";
        if (newName.startsWith(this.PREFIX_OPS + this.PREFIX_OPS)) problems.name_not_op_namespace = "Op name starts with '" + this.PREFIX_OPS + this.PREFIX_OPS + "'.";
        if (this.opExists(newName)) problems.target_exists = "Op exists already.";
        if (newName.length < this.OP_NAME_MIN_LENGTH) problems.name_too_short = "Op name too short (min. " + this.OP_NAME_MIN_LENGTH + " characters).";
        if (newName.indexOf("..") !== -1) problems.name_contains_doubledot = "Op name contains '..'.";
        let matchString = "[^abcdefghijklmnopqrstuvwxyz._ABCDEFGHIJKLMNOPQRSTUVWXYZ0-9";
        // patchops can have - because they contain the patch shortid
        if (this.isPatchOp(newName) || this.isTeamOp(newName)) matchString += "\\-";
        matchString += "]";

        if (newName.match(matchString)) problems.name_contains_illegal_characters = "Op name contains illegal characters.";

        const parts = newName.split(".");
        for (let i = 0; i < parts.length; i++) // do not start
        {
            if (parts[i].length > 0)
            {
                const firstChar = parts[i].charAt(0);
                const isnum = helper.isNumeric(firstChar);
                if (isnum) problems.namespace_starts_with_numbers = "Op namespace parts cannot start with numbers (" + parts[i] + ").";
                if (firstChar === " ") problems.namespace_starts_with_whitespace = "Op namespace cannot start with whitespace (" + parts[i] + ").";
                if (firstChar === "-") problems.namespace_starts_with_dash = "Op namespace parts can not start with - (" + parts[i] + ").";
                if (parts[i].charAt(0) !== parts[i].charAt(0).toUpperCase())
                {
                    if (!this.isUserOp(newName) || i > 2)
                    {
                        problems.namespace_not_uppercase = "All namespace parts have to be uppercase (" + parts[i] + ").";
                    }
                }
            }
        }

        if (Object.keys(problems).length === 0)
        {
            if (!this.userHasWriteRightsOp(userObj, newName, teams, newOpProject))
            {
                problems.no_rights_target = "You lack permissions to " + newName + ".";
            }

            if (oldName)
            {
                if (!this.userHasWriteRightsOp(userObj, oldName, teams, oldOpProject)) problems.no_rights_source = "You lack permissions to " + oldName + ".";
                if (!this.opExists(oldName)) problems.not_found_source = oldName + " does not exist.";
            }
        }

        return problems;
    }

    getOpRenameConsequences(newName, oldName)
    {
        const consequences = {};
        if (this.isUserOp(newName))
        {
            consequences.will_be_userop = "Your new op will be available only to you in all your patches.";
            consequences.edit_only_user = "Only you will be able to make changes to your new op.";
        }
        else if (this.isTeamOp(newName))
        {
            consequences.will_be_teamop = "Your new op will be available only by members of the owning team.";
            consequences.edit_only_team = "Team members with full-access rights will be able to make changes to your new op.";
            consequences.no_public_patches = "You will NOT be able to publish patches using this op in private or unlisted teams.";
        }
        else if (this.isExtensionOp(newName))
        {
            if (!this.isExtensionOp(oldName) && !this.isCoreOp(oldName)) consequences.will_by_copied = "Your old op will be kept, not moved!";
            consequences.will_be_extensionop = "Your new op will be available to all users.";
            consequences.read_only = "You will no longer be able to make changes to your new op.";
        }
        else if (this.isPatchOp(newName))
        {
            consequences.will_be_patchop = "Your new op will be available only in the current patch.";
            consequences.edit_only_collaborators = "People with access to the patch will be able to see, edit and copy it.";
        }
        else
        {
            consequences.will_be_extensionop = "Your new op will be available to all users of cables.";
            consequences.edit_only_staff = "Only cables-staff will be able to make changes to this op.";
        }
        if (this.isDevOp(newName))
        {
            consequences.will_be_devop = "You new op will be available ONLY on dev.cables.gl.";
        }
        return consequences;
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

    namespaceExistsInCore(name, opDocs)
    {
        return opDocs.some((d) => { return d.name.startsWith(name); });
    }

    existingCoreOp(opname)
    {
        if (!opname) return false;
        return this.opExists(opname) && this.isCoreOp(opname);
    }

    isOpId(id)
    {
        return uuidv4.isUUID(id);
    }

    isCoreOp(opname)
    {
        if (!opname) return false;
        return !(this.isUserOp(opname) || this.isTeamOp(opname) || this.isExtensionOp(opname) || this.isPatchOp(opname));
    }

    isUserOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_USEROPS);
    }

    isAdminOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_ADMINOPS);
    }

    isPrivateOp(opname)
    {
        if (!opname) return false;
        return this.isTeamOp(opname) || this.isPatchOp(opname) || this.isUserOp(opname);
    }

    isDevOp(opname)
    {
        if (!opname) return false;
        return opname.includes(this.INFIX_DEVOPS);
    }

    isTeamOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_TEAMOPS);
    }

    isTeamOpOfTeam(opname, team)
    {
        if (!this.isTeamOp(opname)) return false;
        if (!team) return false;
        if (!team.namespaces || team.namespaces.length === 0) return false;
        const namespace = this.getFullTeamNamespaceName(opname);
        return team.namespaces.some((ns) => { return ns.startsWith(namespace); });
    }

    isExtensionOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_EXTENSIONOPS);
    }

    isDeprecated(opname)
    {
        if (!opname) return false;
        return opname.includes(this.INFIX_DEPRECATED);
    }

    isPatchOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith(this.PREFIX_PATCHOPS);
    }

    isPatchOpOfProject(opname, project)
    {
        if (!this.isPatchOp(opname)) return false;
        if (!project) return false;
        return this.getPatchIdFromOpName(opname) === project.shortId;
    }

    ownsUserOp(opname, user)
    {
        if (!user) return false;
        const usernamespace = this.PREFIX_USEROPS + user.usernameLowercase + ".";
        if (opname.startsWith(usernamespace)) return true;
        return false;
    }

    getUserOpOwnerName(opname)
    {
        if (!this.isUserOp(opname)) return null;
        const fields = opname.split(".", 3);
        return fields[2];
    }

    isExtension(name)
    {
        if (!name) return false;
        return name.startsWith(this.PREFIX_EXTENSIONOPS);
    }

    isPatchOpNamespace(name)
    {
        if (!name) return false;
        return name.startsWith(this.PREFIX_PATCHOPS);
    }

    isCollection(name)
    {
        if (!name) return false;
        return this.isTeamNamespace(name) || this.isExtensionNamespace(name);
    }

    collectionExists(name)
    {
        if (!this.isCollection(name)) return false;
        const dir = this.getCollectionDir(name);
        if (dir) return fs.existsSync(dir);
        return false;
    }

    getCollectionDir(name)
    {
        if (this.isExtensionNamespace(name)) return this.getExtensionDir(name);
        if (this.isTeamNamespace(name)) return this.getTeamNamespaceDir(name);
        return null;
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

    isUserOpNamespace(name)
    {
        if (!name) return false;
        return name.startsWith(this.PREFIX_USEROPS);
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

    isVariableSetter(opname)
    {
        if (!opname) return false;
        return opname.startsWith("Ops.Vars.VarSet") || opname.startsWith("Ops.Vars.VarTrigger");
    }

    isCallbackOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith("Ops.Cables.Callback");
    }

    isFunctionOp(opname)
    {
        if (!opname) return false;
        return opname.startsWith("Ops.Cables.Function");
    }

    isSubPatch(opname)
    {
        if (!opname) return false;
        return opname.startsWith("Ops.Ui.SubPatch");
    }

    isBlueprint(opname)
    {
        if (!opname) return false;
        return ((opname === this.BLUEPRINT_OP_NAME || opname.startsWith(this.BLUEPRINT_OP_NAME + "_v")));
    }

    getOpSVG(name, cb)
    {
        const filename = this.getOpJsonPath(name);

        if (!filename)
        {
            this._sendErrorSvg(name, cb, "unknown filename");
            return;
        }

        jsonfile.readFile(filename, (err, obj) =>
        {
            if (err)
            {
                this._sendErrorSvg(name, cb, err);
                return;
            }

            const xw = new XMLWriter();
            const height = 40;

            xw.startDocument();
            xw.startElement("svg");

            let w = 200;
            if (obj.layout)
            {
                if (obj.layout.portsIn)w = Math.max(w, obj.layout.portsIn.length * 14);
                if (obj.layout.portsOut)w = Math.max(w, obj.layout.portsOut.length * 14);
            }

            xw.writeAttribute("xmlns", "http://www.w3.org/2000/svg");
            xw.writeAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
            xw.writeAttribute("version", "1.1");
            xw.writeAttribute("width", w);
            xw.writeAttribute("height", "40");

            xw.startElement("rect");
            xw.writeAttribute("width", w);
            xw.writeAttribute("height", height);
            xw.writeAttribute("fill", "#333");
            xw.endElement();

            if (obj.layout)
            {
                if (obj.layout.portsIn)
                    for (let i = 0; i < obj.layout.portsIn.length; i++)
                    {
                        xw.startElement("rect");
                        xw.writeAttribute("x", i * 14);
                        xw.writeAttribute("width", "11");
                        xw.writeAttribute("height", "6");
                        xw.writeAttribute("fill", this.opGetPortColor(obj.layout.portsIn[i].type));
                        xw.endElement();
                    }

                if (obj.layout.portsOut)
                    for (let i = 0; i < obj.layout.portsOut.length; i++)
                    {
                        xw.startElement("rect");
                        xw.writeAttribute("x", i * 14);
                        xw.writeAttribute("y", height - 6);
                        xw.writeAttribute("width", "11");
                        xw.writeAttribute("height", "6");
                        xw.writeAttribute("fill", this.opGetPortColor(obj.layout.portsOut[i].type));
                        xw.endElement();
                    }
            }

            const parts = basename(filename).split(".");
            const opname = parts[parts.length - 1];

            xw.startElement("text");
            xw.writeAttribute("x", 8);
            xw.writeAttribute("y", 25);
            xw.writeAttribute("style", "font-family:SourceSansPro, arial;font-size:14px;");
            xw.writeAttribute("fill", this.opGetNamespaceColor(basename(filename)));
            xw.text(this.getOpNameWithoutVersion(opname));
            xw.endElement();
            xw.endDocument();

            cb(null, xw.toString());
        });
    }

    getOpPng(name, cb)
    {
        const filename = this.getOpJsonPath(name);

        if (!filename)
        {
            this._sendErrorSvg(name, cb, "unknown filename");
            return;
        }

        jsonfile.readFile(filename, (err, obj) =>
        {
            const w = 240, h = 40;
            const paddingTop = 40;
            const paddingLeft = 20;

            const canvas = import("canvas").then((canvas) =>
            {
                if (canvas)
                {
                    const _canvas = canvas.createCanvas(w + paddingLeft * 2, h + paddingTop * 2);
                    const ctx = _canvas.getContext("2d");

                    ctx.fillStyle = "#555555";
                    ctx.fillRect(0, 0, w + paddingLeft * 2, h + paddingTop * 2);

                    ctx.fillStyle = "#333333";
                    ctx.fillRect(paddingLeft, paddingTop, w, h);

                    if (obj.layout)
                    {
                        if (obj.layout.portsIn)
                            for (let i = 0; i < obj.layout.portsIn.length; i++)
                            {
                                ctx.fillStyle = this.opGetPortColor(obj.layout.portsIn[i].type);
                                ctx.fillRect(paddingLeft + i * 14, paddingTop, 10, 7);
                            }

                        if (obj.layout.portsOut)
                            for (let i = 0; i < obj.layout.portsOut.length; i++)
                            {
                                ctx.fillStyle = this.opGetPortColor(obj.layout.portsOut[i].type);
                                ctx.fillRect(paddingLeft + i * 14, paddingTop + h - 7, 10, 7);
                            }
                    }

                    const parts = basename(filename).split(".");
                    const opname = parts[parts.length - 1];

                    ctx.font = "18px monospace";
                    ctx.fillStyle = this.opGetNamespaceColor(basename(filename));
                    ctx.fillText(this.getOpNameWithoutVersion(opname), paddingLeft + 8, paddingTop + 26);

                    cb(null, _canvas.toBuffer("image/png"));
                }
                else
                {
                    cb(null, null);
                }
            }).catch((e) =>
            {
                cb(null, null);
            });
        });
    }

    opGetPortColor(type)
    {
        if (type == 0) return "#5CB59E";
        if (type == 1) return "#F0D165";
        if (type == 2) return "#AB5A94";
        if (type == 3) return "#8084D4";
        if (type == 4) return "#ffffff";
        if (type == 5) return "#d57272";
        return "#F00";
    }

    opGetNamespaceColor(ns)
    {
        if (!ns) return "#8084d4";

        if (ns.startsWith("Ops.Array")) return "#c0e04d";
        if (
            ns.startsWith("Ops.String") ||
            ns.startsWith("Ops.Website")) return "#d57272";

        if (ns.startsWith("Ops.Sidebar") ||
            ns.startsWith("Ops.Json") ||
            ns.startsWith("Ops.Net") ||
            ns.startsWith("Ops.Webaudio") ||
            ns.startsWith("Ops.Html")) return "#c567ab";


        if (ns.startsWith("Ops.Gl") ||
            ns.startsWith("Ops.Trigger") ||
            ns.startsWith("Ops.Graphics")) return "#f0d165";

        if (ns.startsWith("Ops.Math") ||
            ns.startsWith("Ops.Boolean") ||
            ns.startsWith("Ops.Date") ||
            ns.startsWith("Ops.Color") ||
            ns.startsWith("Ops.Time") ||
            ns.startsWith("Ops.Anim") ||
            ns.startsWith("Ops.Number")) return "#5cb59e";

        if (ns.startsWith(this.PREFIX_USEROPS)) return "#ff00ff";
        return "#e7e7e7";
    }

    getPortTypeString(type)
    {
        if (type == 0) return "Number";
        else if (type == 1) return "Trigger";
        else if (type == 2) return "Object";
        else if (type == 4) return "Dynamic";
        else if (type == 5) return "String";
        else if (type == 3) return "Array";
        else return "Unknown";
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

    getNamespace(opname)
    {
        if (!opname) return "";
        const parts = opname.split(".");
        parts.length -= 1;
        return parts.join(".") + ".";
    }

    getCollectionDisplayName(namespace)
    {
        if (!namespace) return "";
        if (namespace.endsWith(".")) namespace = namespace.substring(0, namespace.length - 1);
        return namespace;
    }

    getNamespaceSummary(ns)
    {
        if (!ns) return "";
        if (ns === "Ops") return "";
        for (let i = 0; i < this.OP_NAMESPACE_SUMMARIES.length; i++)
            if (ns.toLowerCase().indexOf(this.OP_NAMESPACE_SUMMARIES[i].ns.toLowerCase()) === 0)
                return this.OP_NAMESPACE_SUMMARIES[i].summary;
        return "";
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

    filterHighestVersionOpNames(opNames, search = "")
    {
        let items = [];
        for (let i = 0; i < opNames.length; i++)
        {
            const opName = opNames[i];
            if (opName.toLowerCase().includes(search.toLowerCase()))
            {
                items.push(opName);
            }
        }

        const versionedOps = items.filter((item) => { return item.includes(this.SUFFIX_VERSION); });
        const sortedVersions = versionedOps.sort((a, b) => { return b.localeCompare(a); });

        let lastBaseOp = "";
        let filteredItems = items.filter((item) => { return !versionedOps.includes(item); });
        for (let i = 0; i < sortedVersions.length; i++)
        {
            const versionOp = sortedVersions[i];
            const baseName = versionOp.split(this.SUFFIX_VERSION, 2)[0];
            if (lastBaseOp === baseName) continue;
            lastBaseOp = baseName;
            filteredItems.push(versionOp);
            filteredItems = filteredItems.filter((item) => { return item !== baseName; });
        }

        return filteredItems.sort((a, b) => { return a.localeCompare(b); });
    }

    _sendErrorSvg(filename, cb, err)
    {
        const xw = new XMLWriter();
        xw.startDocument();
        xw.startElement("svg");

        const height = 40;

        const parts = filename.split(".");
        const opname = parts[parts.length - 1];

        xw.writeAttribute("xmlns", "http://www.w3.org/2000/svg");
        xw.writeAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        xw.writeAttribute("version", "1.1");
        xw.writeAttribute("width", "200");
        xw.writeAttribute("height", "40");

        xw.startElement("rect");
        xw.writeAttribute("width", "200");
        xw.writeAttribute("height", height);
        xw.writeAttribute("fill", "#333");
        xw.endElement();

        xw.startElement("text");
        xw.writeAttribute("x", 8);
        xw.writeAttribute("y", 26);
        xw.writeAttribute("style", "font-family:SourceSansPro, arial;font-size:18px;");
        xw.writeAttribute("fill", "#ffffff");
        xw.text(this.getOpNameWithoutVersion(opname));
        xw.endElement();
        xw.endDocument();

        cb(null, xw.toString());
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

    opHasExampleScreenshot(opName)
    {
        const opPath = this.getOpAbsolutePath(opName);
        if (fs.pathExistsSync(opPath))
        {
            const screenshotPath = this.getExampleScreenshotPath(opName);
            if (fs.pathExistsSync(screenshotPath)) return true;
            return false;
        }
        else
        {
            return null;
        }
    }

    getExampleScreenshotPath(opName)
    {
        const opPath = this.getOpAbsolutePath(opName);
        return path.join(opPath, "/screenshot.png");
    }

    renameToCoreOp(oldName, newName, currentUser, removeOld, cb)
    {
        this._renameOp(oldName, newName, currentUser, true, removeOld, false, cb);
    }

    renameToExtensionOp(oldName, newName, currentUser, removeOld, cb)
    {
        this._renameOp(oldName, newName, currentUser, true, removeOld, false, cb);
    }

    renameToTeamOp(oldName, newName, currentUser, removeOld, cb)
    {
        this._renameOp(oldName, newName, currentUser, false, removeOld, false, cb);
    }

    renameToUserOp(oldName, newName, currentUser, removeOld, cb)
    {
        this._renameOp(oldName, newName, currentUser, false, removeOld, false, cb);
    }

    renameToPatchOp(oldName, newName, currentUser, removeOld, newId, cb)
    {
        this._renameOp(oldName, newName, currentUser, false, removeOld, newId, cb);
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

    getOpTargetDir(opName)
    {
        return this.getOpSourceDir(opName);
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

    getPatchOpDir(name)
    {
        const patchOpDir = name ? name.split(".", 3).join(".") : null;
        const extensionPath = path.join(cables.getPatchOpsPath(), "/", patchOpDir, "/");
        return path.join(extensionPath, "/");
    }

    getNewPatchOpName(oldName, newProject)
    {
        if (!oldName || !newProject || !newProject.shortId) return null;
        const oldPrefix = this.getPatchOpNamespace(oldName);
        const newPrefix = this.getPatchOpsNamespaceForProject(newProject);
        let newName = oldName.replace(oldPrefix, newPrefix);
        const existingPatchOps = this.getCollectionOpNames(newPrefix);
        let oldId = this.getPatchIdFromOpName(oldName);
        Object.keys(this.PATCHOPS_ID_REPLACEMENTS).forEach((key) =>
        {
            oldId = oldId.replaceAll(key, this.PATCHOPS_ID_REPLACEMENTS[key]);
        });
        let randomName = false;
        for (let i = 0; i < existingPatchOps.length; i++)
        {
            const opName = existingPatchOps[i];
            if (opName === newName)
            {
                newName = newName + "_" + oldId;
                randomName = true;
                break;
            }
        }
        if (randomName)
        {
            let version = 0;
            existingPatchOps.forEach((patchOp) =>
            {
                if (patchOp.startsWith(newName)) version++;
            });
            newName += String(version);
        }
        return newName;
    }

    getCollectionJsonPath(name, create = true)
    {
        let filename = this.getExtensionJsonPath(name, create);
        if (!filename) filename = this.getTeamNamespaceJsonPath(name, create);
        return filename;
    }

    getCollectionDocs(name)
    {
        const file = this.getCollectionJsonPath(name, false);
        let docs = {};
        if (fs.existsSync(file)) docs = jsonfile.readFileSync(file);
        return docs;
    }

    updateCollectionDocs(name, newDocs)
    {
        const file = this.getCollectionJsonPath(name, true);
        const fileExists = fs.existsSync(file);
        let docs = {};
        if (fileExists)
        {
            docs = jsonfile.readFileSync(file);
        }
        docs = { ...docs, ...newDocs };
        jsonfile.writeFileSync(file, docs, { "encoding": "utf-8", "spaces": 4 });
        return docs;
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

    getCollectionName(opName)
    {
        return opName ? opName.split(".", 3).join(".") : null;
    }

    getCollectionNamespace(opName)
    {
        return this.getCollectionName(opName) + ".";
    }

    getCollectionOpDocFile(collectionName)
    {
        if (collectionName.endsWith(".")) collectionName = collectionName.substring(0, collectionName.length - 1);
        return path.join(cables.getOpDocsCachePath() + collectionName + ".json");
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
        if (filterInvisibleOps) opNames = opNames.filter((opName) => { return !this.isInvisible(opName); });
        return opNames;
    }

    getPatchIdFromOpName(opName)
    {
        if (!opName) return null;
        let namespace = opName.split(".", 3).join(".");
        Object.keys(this.PATCHOPS_ID_REPLACEMENTS).forEach((key) =>
        {
            namespace = namespace.replaceAll(this.PATCHOPS_ID_REPLACEMENTS[key], key);
        });
        return namespace.replace(this.PREFIX_PATCHOPS, "");
    }

    getExtensionNamespaceByOpName(opName)
    {
        return opName ? opName.split(".", 3).join(".") + "." : null;
    }

    getTeamNamespaceByOpName(opName)
    {
        return opName ? opName.split(".", 3).join(".") + "." : null;
    }

    getOpShortName(opName)
    {
        if (!opName) return "";
        const parts = opName.split(".");
        return parts.pop();
    }

    getExtensionShortName(extensionName)
    {
        const parts = extensionName.split(".", 3);
        return parts[2] || extensionName;
    }

    getFullExtensionName(shortName)
    {
        let name = shortName;
        if (!name.endsWith(".")) name += ".";
        if (!name.startsWith(this.PREFIX_EXTENSIONOPS))
        {
            return this.PREFIX_EXTENSIONOPS + teamsUtil.sanitizeShortNameForNamespace(name) + ".";
        }
        return name;
    }

    getTeamNamespaceShortName(namespaceName)
    {
        const parts = namespaceName.split(".", 3);
        return parts[2] || namespaceName;
    }

    getFullTeamNamespaceName(shortName)
    {
        let name = shortName;
        if (!name.endsWith(".")) name += ".";
        if (!name.startsWith(this.PREFIX_TEAMOPS))
        {
            return this.PREFIX_TEAMOPS + teamsUtil.sanitizeShortNameForNamespace(name) + ".";
        }
        return this.getTeamNamespaceByOpName(name);
    }

    deleteOp(opName)
    {
        const fn = this.getOpAbsoluteFileName(opName);
        if (fn)
        {
            try
            {
                if (fs.existsSync(fn))
                {
                    fs.unlinkSync(fn);
                    doc.removeOpNameFromLookup(opName);
                }
                try
                {
                    fs.rmSync(this.getOpAbsolutePath(opName), { "recursive": true, "force": true });
                }
                catch (e)
                {
                    this._log.error(e);
                    return false;
                }
                doc.updateOpDocs(opName);
            }
            catch (e)
            {
                this._log.error(e);
                return false;
            }
            return true;
        }
        return false;
    }

    deleteNamespace(namespace)
    {
        if (!namespace) return false;
        let dir = null;
        if (this.isCollection(namespace))
        {
            dir = this.getCollectionDir(namespace);
        }
        else
        {
            this._log.error("trying to delete namespace that is not team or extension: " + namespace);
            return false;
        }
        if (fs.existsSync(dir))
        {
            this._log.info("deleting namespace dir", dir);
            doc.rebuildOpCaches(() => { this._log.info("updated cache after delete"); }, ["teams", "extensions"]);
            fs.rmSync(dir, { "recursive": true, "force": true });
            return true;
        }
        else
        {
            return true;
        }
    }

    _renameOp(oldName, newName, currentUser, formatCode, removeOld, newId, cb)
    {
        if (!this.isPatchOp(newName)) this._log.verbose("STARTING RENAME");
        let log = [];

        if (!this.isPatchOp(newName)) this._log.info("*" + currentUser.username + "* renaming " + oldName + " to " + newName);

        let oldOpDir = this.getOpSourceDir(oldName);
        let newOpDir = this.getOpTargetDir(newName);

        const oldOpFile = path.join(oldOpDir, oldName + ".js");
        const newOpFile = path.join(newOpDir, newName + ".js");

        let actionString = "moving";
        if (!removeOld) actionString = "copying";
        if (!this.isPatchOp(newName)) this._log.info("*" + currentUser.username + "* " + actionString + " " + oldOpFile + " to " + newOpFile);

        const exists = fs.existsSync(oldOpFile);
        const existsNew = fs.existsSync(newOpFile);

        if (!this.isPatchOp(newName)) this._log.verbose(oldOpFile);
        if (!this.isPatchOp(newName)) this._log.verbose("old exists", exists, "new exists", existsNew);

        if (existsNew)
        {
            log.push("ERROR: new op already exists!");
            if (cb) cb("OP_ALREADY_EXISTS", log);
            return;
        }

        log.push("Good: New op does not exist.");

        if (!exists)
        {
            log.push("ERROR: old op does not exist!");
            if (cb) cb("OP_DOES_NOT_EXIST", log);
            return;
        }

        log.push("Good: Old op does exist.");

        if (formatCode)
        {
            const code = fs.readFileSync(oldOpFile, "utf8");
            const format = this.validateAndFormatOpCode(code);
            if (format.error)
            {
                log.push("ERROR: failed to format opcode when moving to base-op!");
                if (cb) cb("OP_FORMAT_FAILED", log);
                return;
            }
            else
            {
                fs.writeFileSync(oldOpFile, format.formatedCode);
                log.push("successfully formatted op code");
            }

            const opFiles = fs.readdirSync(oldOpDir);
            for (let i = 0; i < opFiles.length; i++)
            {
                const opFile = opFiles[i];
                if (!opFile.startsWith("att_")) continue;
                if (!opFile.endsWith(".js")) continue;
                const attFile = path.join(oldOpDir, opFile);
                const attCode = fs.readFileSync(attFile, "utf8");
                const attFormat = this.validateAndFormatOpCode(attCode);
                if (attFormat.error)
                {
                    log.push("ERROR: failed to format attachment code: " + opFile);
                    if (cb) cb("ATT_FORMAT_FAILED", log);
                    return;
                }
                else
                {
                    fs.writeFileSync(attFile, attFormat.formatedCode);
                    log.push("successfully formatted attachment code: " + opFile);
                }
            }
        }

        mkdirp.sync(newOpDir);
        fs.copySync(oldOpDir, newOpDir);

        log.push("Renamed path");

        if (!this.isPatchOp(newName)) this._log.verbose("newpath", newOpDir);
        if (!this.isPatchOp(newName)) this._log.verbose("oldpath", oldOpDir);

        fs.renameSync(path.join(newOpDir, oldName + ".js"), newOpFile);

        if (currentUser.isStaff)
        {
            log.push("Renamed JS to " + newOpFile);
        }
        else
        {
            log.push("Renamed JS");
        }

        const oldMd = path.join(oldOpDir, oldName + ".md");
        const newMd = path.join(newOpDir, newName + ".md");
        if (fs.existsSync(oldMd))
        {
            fs.renameSync(path.join(newOpDir, oldName + ".md"), newMd);
            log.push("Renamed MD file");
        }

        const oldJson = path.join(oldOpDir, oldName + ".json");
        const newJson = path.join(newOpDir, newName + ".json");
        if (fs.existsSync(oldJson))
        {
            fs.renameSync(path.join(newOpDir, oldName + ".json"), newJson);
            log.push("Renamed JSON file");
        }

        let jsonChange = false;
        const newJsonData = jsonfile.readFileSync(newJson);

        if (removeOld)
        {
            fs.emptyDirSync(oldOpDir);
            doc.replaceOpNameInLookup(oldName, newName);
            fs.rmSync(oldOpDir, { "recursive": true });
        }

        if (!removeOld || newId)
        {
            if (newJsonData)
            {
                newJsonData.id = uuidv4();
                doc.addOpToLookup(newJsonData.id, newName);
                jsonChange = true;
            }
        }

        if (jsonChange) jsonfile.writeFileSync(newJson, newJsonData, { "encoding": "utf-8", "spaces": 4 });

        this.addOpChangelog(
            currentUser,
            newName,
            oldName + " renamed to " + newName,
            "rename"
        );

        let updateOld = false;
        if (removeOld)
        {
            updateOld = true;
        }

        this._log.event(null, "ops", "renamed", "renamed");

        if (!this.isPatchOp(newName)) this._log.verbose("*" + currentUser.username + " finished rename ");

        doc.updateOpDocs(newName);
        if (updateOld) doc.updateOpDocs(oldName);
        if (cb) cb(null, log, newJsonData);
    }

    getOpBreadCrumb(ns)
    {
        if (!ns)
        {
            return null;
        }
        const parts = ns.split(".");
        const crumbs = [];

        for (let i = 0; i < parts.length; i++)
        {
            if (i === 0)
                crumbs.push(
                    {
                        "url": "/ops/",
                        "name": "Ops",
                        "notlast": true
                    });
            else
            {
                let partns = "";
                for (let j = 0; j <= i; j++)
                {
                    if (j > 0)partns += ".";
                    partns += parts[j];
                }

                crumbs.push(
                    {
                        "url": "/ops/" + partns,
                        "name": parts[i],
                        "notlast": true
                    });
            }
        }
        crumbs[crumbs.length - 1].notlast = false;
        return crumbs;
    }

    getDeprecatedOpName(opName)
    {
        if (!opName) return "";
        const parts = opName.split(".");
        parts.splice(parts.length - 1, 0, "Deprecated");
        return parts.join(".");
    }

    findOpsWithShortName(opName, exact = true)
    {
        if (!opName) return [];
        const opDocs = doc.getOpDocs(false, true);
        if (!exact)
        {
            return opDocs.filter((opDoc) => { return opDoc.shortName.toUpperCase().includes(opName.toUpperCase()); });
        }
        else
        {
            return opDocs.filter((opDoc) => { return opDoc.shortName.toUpperCase() === opName.toUpperCase(); });
        }
    }
}

export default new OpsUtil();
