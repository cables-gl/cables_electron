import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import marked from "marked";
import jsonfile from "jsonfile";
import crypto from "crypto";
import pako from "pako";
import opsUtil from "./src/utils/ops_util.js";
import * as cables from "./src/cables.js";
import * as doc from "./src/doc.js";
import helper from "./src/utils/helper_util.js";

export default class ElectronApi
{
    constructor()
    {
        this._log = console;
    }

    init()
    {
        ipcMain.handle("talkerMessage", async (event, cmd, data) =>
        {
            let response = null;
            if (!cmd) return null;
            this._log.info("[electron] calling", cmd);
            if (typeof this[cmd] === "function")
            {
                response = this[cmd](data);
            }
            return response;
        });
    }

    getCoreOpsCode(data)
    {
        const opDocs = doc.getOpDocs(true, true);
        return opsUtil.buildCode(cables.getCoreOpsPath(), null, opDocs, true, true);
    }

    getProjectOpsCode(data)
    {
        const project = {};
        const opDocs = doc.getOpDocs(true, true);
        let code = "";
        if (project.ops)
        {
            let missingOps = project.ops.filter((op) =>
            {
                return !opDocs.some((d) =>
                {
                    return d.id === op.opId;
                });
            });
            code = opsUtil.buildFullCode(missingOps, opsUtil.PREFIX_OPS, opDocs);
            return code;
        }
        else
        {
            return code;
        }
    }

    patchCreateBackup()
    {
    }

    savePatch(patch)
    {
        const project = this.getPatch();
        if (patch.data || patch.dataB64)
        {
            try
            {
                let buf = patch.data;
                if (patch.dataB64) buf = Buffer.from(patch.dataB64, "base64");

                const qData = JSON.parse(pako.inflate(buf, { "to": "string" }));

                if (qData.ops) project.ops = qData.ops;
                if (qData.ui) project.ui = qData.ui;
            }
            catch (e)
            {
                this._log.error("patch save error/invalid data", e);
                return;
            }
        }
        else
        {
            this._log.error("[apiUpdateProject] body does not contain patch data");
        }

        // filter imported ops, so we do not save these to the database
        project.ops = project.ops.filter((op) =>
        {
            return !(op.storage && op.storage.blueprint);
        });

        project.updated = new Date();

        project.opsHash = crypto
            .createHash("sha1")
            .update(JSON.stringify(project.ops))
            .digest("hex");
        project.buildInfo = patch.buildInfo;

        jsonfile.writeFileSync(path.join(cables.getPatchesPath(), "/test.json"), project);

        const re = {
            "success": true,
            "msg": "PROJECT_SAVED"
        };
        re.updated = project.updated;
        re.updatedByUser = project.updatedByUser;

        return re;
    }

    getPatch(data)
    {
        const patch = fs.readFileSync(path.join(cables.getPatchesPath(), "/test.json"));
        return JSON.parse(patch.toString("utf-8"));
    }

    newPatch()
    {
    }

    saveProjectAs()
    {
    }

    saveScreenshot()
    {
    }

    setProjectName()
    {
    }

    getBuildInfo()
    {
        return {
            "updateWarning": false,
            "core": {
                "timestamp": 1700734919296,
                "created": "2023-11-23T10:21:59.296Z",
                "git": {
                    "branch": "develop",
                    "commit": "04f23fcd2b2830840ed0c62595104fc7c3d96ae3",
                    "date": "2023-11-22T16:18:12.000Z",
                    "message": "viztexture aspect ratio/color picking etc"
                }
            },
            "ui": {
                "timestamp": 1700746574919,
                "created": "2023-11-23T13:36:14.919Z",
                "git": {
                    "branch": "develop",
                    "commit": "7acf5719f001a0ec07034fbe4c0fdfe15946dd7b",
                    "date": null,
                    "message": null
                }
            },
            "api": {
                "timestamp": 1700748324495,
                "created": "2023-11-23T14:05:24.495Z",
                "git": {
                    "branch": "master",
                    "commit": "ac06849ffb3e594b368bd2f5a63bd6eed62ea1a9",
                    "date": "2023-11-23T11:11:29.000Z",
                    "message": "patreon api hotfixes"
                }
            }
        };
    }

    getFilelist()
    {
    }

    fileConvert()
    {
    }

    getFileDetails()
    {
    }

    getLibraryFileInfo()
    {
    }

    deleteFile()
    {
    }

    createFile()
    {
    }

    fileUploadStr()
    {
    }

    getAllProjectOps()
    {
        return [];
    }

    getAllOps()
    {
    }

    async getOpDocsAll(data)
    {
        const opDocs = doc.getOpDocs(true, true);
        const cleanDocs = doc.makeReadable(opDocs);
        opsUtil.addPermissionsToOps(cleanDocs, null);

        const extensions = doc.getAllExtensionDocs();
        const _libs = fs.readdirSync(cables.getLibsPath());
        const libs = [];
        for (let i = 0; i < _libs.length; i++)
        {
            let skip = false;
            if (_libs[i].endsWith(".js"))
            {
                const libName = path.parse(_libs[i]);
                if (libName)
                {
                    let jsonName = path.join(cables.getLibsPath(), libName.name);
                    jsonName += ".json";
                    if (fs.existsSync(jsonName))
                    {
                        const json = JSON.parse(fs.readFileSync(jsonName));
                        if (json.hidden)
                        {
                            skip = true;
                        }
                    }
                }
                if (!skip)
                {
                    libs.push(_libs[i]);
                }
            }
        }

        const _coreLibs = fs.readdirSync(cables.getCoreLibsPath());
        const coreLibs = [];
        for (let i = 0; i < _coreLibs.length; i++)
        {
            const coreFilename = _coreLibs[i];
            if (coreFilename.endsWith(".max.js"))
            {
                coreLibs.push(coreFilename.split(".")[0]);
            }
        }

        return {
            "opDocs": cleanDocs,
            "extensions": extensions,
            "teamNamespaces": [],
            "libs": libs,
            "coreLibs": coreLibs
        };
    }

    getOpDocs(data)
    {
        const opName = opsUtil.getOpNameById(data.op.opId);
        if (!opName)
        {
            return {};
        }
        const result = {};
        result.opDocs = [];

        const opDoc = doc.getDocForOp(opName);
        result.content = "No docs yet...";

        const opDocs = [];
        if (opDoc) opDocs.push(opDoc);
        result.opDocs = doc.makeReadable(opDocs);
        result.opDocs = opsUtil.addPermissionsToOps(result.opDocs, null);
        const c = doc.getOpDocMd(opName);
        if (c) result.content = marked(c || "");
        return result;
    }

    getCollectionOpDocs()
    {
    }

    opCreate()
    {
    }

    saveOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opname);
        const fn = opsUtil.getOpAbsoluteFileName(opName);
        this._log.info("save op ", opName, fn);

        const code = data.code;
        let returnedCode = code;

        const format = opsUtil.validateAndFormatOpCode(code);
        if (format.error)
        {
            const {
                line,
                message
            } = format.message;
            this._log.info({
                line,
                message
            });
            return {
                "error": {
                    line,
                    message
                }
            };
        }
        const formatedCode = format.formatedCode;
        if (opsUtil.existingCoreOp(opName) || data.format)
        {
            returnedCode = formatedCode;
        }
        returnedCode = helper.removeTrailingSpaces(returnedCode);

        fs.writeFileSync(fn, returnedCode);
        const jsonFile = opsUtil.getOpJsonPath(opName);
        let jsonData = jsonfile.readFileSync(jsonFile);
        if (!jsonData) jsonData = {};
        if (jsonData.updated) delete jsonData.updated;
        jsonfile.writeFileSync(jsonFile, jsonData, {
            "encoding": "utf-8",
            "spaces": 4
        });

        setTimeout(() =>
        {
            doc.updateOpDocs(opName);
            opsUtil.setOpDefaults(opName, null);
        }, 1000);

        console.log("HERE!!!");
        return {
            "success": true,
            "opFullCode": returnedCode
        };
    }

    getOpCode(data)
    {
        const opName = opsUtil.getOpNameById(data.opname);
        if (opsUtil.opExists(opName))
        {
            let code = opsUtil.getOpCode(opName);
            const opId = opsUtil.getOpIdByObjName(opName);
            return {
                "name": opName,
                "id": opId,
                "code": code
            };
        }
        else
        {
            let code = "//empty file...";
            return {
                "name": opName,
                "id": null,
                "code": code
            };
        }
    }

    getBlueprintOps()
    {
    }

    formatOpCode(data)
    {
        const code = data.code;
        if (code)
        {
            const format = opsUtil.validateAndFormatOpCode(code);
            if (format.error)
            {
                const {
                    line,
                    message
                } = format.message;
                return {
                    "error": {
                        line,
                        message
                    }
                };
            }
            else
            {
                return {
                    "opFullCode": format.formatedCode,
                    "success": true
                };
            }
        }
        else
        {
            return {
                "opFullCode": "",
                "success": true
            };
        }
    }

    opSaveLayout()
    {
    }

    opAddLib()
    {
    }

    opRemoveLib()
    {
    }

    opAddCoreLib()
    {
    }

    opRemoveCoreLib()
    {
    }

    opClone()
    {
    }

    opAttachmentAdd()
    {
    }

    opAttachmentGet()
    {
    }

    opAttachmentDelete()
    {
    }

    opAttachmentSave()
    {
    }

    saveUserSettings()
    {
    }

    checkOpName()
    {
    }

    setIconUnsaved()
    {
    }

    setIconSaved()
    {
    }

    checkProjectUpdated(data)
    {
        const project = this.getPatch();

        return {
            "updated": project.updated,
            "updatedByUser": project.updatedByUser,
            "buildInfo": project.buildInfo,
            "maintenance": false,
            "disallowSave": false
        };
    }
}
