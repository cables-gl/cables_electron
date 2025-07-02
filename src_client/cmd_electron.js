import pako from "pako";
import cablesElectron from "./renderer.js";

const CABLES_CMD_ELECTRON = {};
const CABLES_CMD_ELECTRON_OVERRIDES = {};
const CMD_ELECTRON_COMMANDS = [];

function bytesArrToBase64(arr)
{
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; // base64 alphabet
    const bin = (n) => { return n.toString(2).padStart(8, 0); }; // convert num to 8-bit binary string
    const l = arr.length;
    let result = "";

    for (let i = 0; i <= (l - 1) / 3; i++)
    {
        let c1 = i * 3 + 1 >= l; // case when "=" is on end
        let c2 = i * 3 + 2 >= l; // case when "=" is on end
        let chunk = bin(arr[3 * i]) + bin(c1 ? 0 : arr[3 * i + 1]) + bin(c2 ? 0 : arr[3 * i + 2]);
        let r = chunk.match(/.{1,6}/g).map((x, j) => { return (j == 3 && c2 ? "=" : (j == 2 && c1 ? "=" : abc[+("0b" + x)])); });
        result += r.join("");
    }

    return result;
}

CABLES_CMD_ELECTRON.openOpDir = (opId = null, opName = null) =>
{
    const gui = cablesElectron.gui;
    if (gui)
    {
        let options = { "opId": opId, "opName": opName };
        if (!opId && !opName)
        {
            const ops = gui.patchView.getSelectedOps();
            if (!ops.length) return;
            options = {
                "opId": ops[0].opId,
                "opName": ops[0].name
            };
        }
        cablesElectron.editor.api("openOpDir", options, (_err, r) => {});
    }
};

CABLES_CMD_ELECTRON.openProjectDir = () =>
{
    cablesElectron.editor.api("openProjectDir", {}, (_err, r) => {});
};

CABLES_CMD_ELECTRON.openFileManager = (url = null) =>
{
    const data = {};
    if (url) data.url = url;
    cablesElectron.editor.api("openFileManager", data, (_err, r) => {});
};

CABLES_CMD_ELECTRON.collectAssets = () =>
{
    const loadingModal = cablesElectron.gui.startModalLoading("Copying assets...");
    let closeTimeout = 2000;
    cablesElectron.editor.api("collectAssets", {}, (_err, r) =>
    {
        if (!_err)
        {
            const ops = cablesElectron.gui.corePatch().ops;
            const oldNew = r.data;
            if (oldNew)
            {
                const assetPorts = [];
                for (let i = 0; i < ops.length; i++)
                {
                    for (let j = 0; j < ops[i].portsIn.length; j++)
                    {
                        if (ops[i].portsIn[j].uiAttribs && ops[i].portsIn[j].uiAttribs.display && ops[i].portsIn[j].uiAttribs.display === "file")
                        {
                            assetPorts.push(ops[i].portsIn[j]);
                        }
                    }
                }
                const oldNames = Object.keys(oldNew);
                if (oldNames.length > 0)
                {
                    oldNames.forEach((srch) =>
                    {
                        const rplc = oldNew[srch];
                        loadingModal.setTask("copied " + srch + " to " + rplc);
                        assetPorts.forEach((assetPort) =>
                        {
                            let v = assetPort.get();
                            if (v && v.startsWith(srch))
                            {
                                v = rplc + v.substring(srch.length);
                                assetPort.set(v);
                            }
                        });
                    });
                    cablesElectron.gui.setStateUnsaved();
                }
                else
                {
                    loadingModal.setTask("nothing to copy");
                }
            }
            else
            {
                loadingModal.setTask("nothing to copy");
            }
        }
        else
        {
            loadingModal.setTask("failed to copy assets");
            loadingModal.setTask("---");
            loadingModal.setTask(_err);
            closeTimeout = 5000;
        }
        setTimeout(() => { cablesElectron.gui.endModalLoading(); }, closeTimeout);
    });
};

CABLES_CMD_ELECTRON.collectOps = () =>
{
    const loadingModal = cablesElectron.gui.startModalLoading("Copying ops...");
    let closeTimeout = 2000;
    cablesElectron.editor.api("collectOps", { }, (_err, r) =>
    {
        if (!_err && r && r.data)
        {
            const oldNames = Object.keys(r.data);
            if (r && oldNames.length > 0)
            {
                oldNames.forEach((srch) =>
                {
                    const rplc = r.data[srch];
                    loadingModal.setTask("copied " + srch + " to " + rplc);
                });
            }
            else
            {
                loadingModal.setTask("nothing to copy");
            }
            setTimeout(() => { cablesElectron.gui.endModalLoading(); }, closeTimeout);
        }
        else
        {
            loadingModal.setTask("failed to copy ops");
            loadingModal.setTask("---");
            loadingModal.setTask(_err);
            closeTimeout = 5000;
            setTimeout(() => { cablesElectron.gui.endModalLoading(); }, closeTimeout);
        }
    });
};

CABLES_CMD_ELECTRON.manageOpDirs = () =>
{
    cablesElectron.openOpDirsTab();
};

CABLES_CMD_ELECTRON.copyOpDirToClipboard = (opId = null) =>
{
    const gui = cablesElectron.gui;
    if (gui)
    {
        if (!opId)
        {
            const ops = gui.patchView.getSelectedOps();
            if (!ops.length) return;
            opId = ops[0].opId;
        }
        const modulePath = window.ipcRenderer.sendSync("getOpDir", { "opId": opId });
        if (modulePath)
        {
            navigator.clipboard.writeText(modulePath);
            cablesElectron.editor.notify("Op path copied to clipboard");
        }
    }
};

CABLES_CMD_ELECTRON_OVERRIDES.PATCH = {};
CABLES_CMD_ELECTRON_OVERRIDES.PATCH.saveAs = () =>
{
    const gui = cablesElectron.gui;
    let patchName = cablesElectron.gui.project() ? cablesElectron.gui.project().name : null;

    let b64 = null;
    if (gui)
    {
        const patch = cablesElectron.gui.patchView.store.makePatchSavable();
        const patchstr = JSON.stringify(patch);
        let uint8data = pako.deflate(patchstr);
        b64 = bytesArrToBase64(uint8data);
    }
    cablesElectron.editor.api("saveProjectAs", {
        "name": patchName,
        "dataB64": b64
    }, (err) =>
    {
        if (!err && gui)
        {
            gui.savedState.setSaved("save as end", 0);
        }
    });
};
CABLES_CMD_ELECTRON_OVERRIDES.PATCH.uploadFileDialog = () =>
{
    cablesElectron.editor.api("selectFile", {}, (_err, filepath) =>
    {
        if (!_err && filepath)
        {
            const gui = cablesElectron.gui;
            if (gui) gui.patchView.addAssetOpAuto(filepath);
        }
    });
};
CABLES_CMD_ELECTRON_OVERRIDES.PATCH.newPatch = () =>
{
    cablesElectron.editor.api("newPatch", { }, (_err, r) => {});
};

CABLES_CMD_ELECTRON_OVERRIDES.PATCH.renameOp = (opName = null) =>
{
    const gui = cablesElectron.gui;
    if (gui)
    {
        if (!opName)
        {
            const ops = gui.patchView.getSelectedOps();
            if (!ops.length) return;

            const op = ops[0];
            opName = op.objName;
        }

        gui.serverOps.renameDialog(opName);
    }
};

CABLES_CMD_ELECTRON_OVERRIDES.RENDERER = {};
CABLES_CMD_ELECTRON_OVERRIDES.RENDERER.fullscreen = () =>
{
    cablesElectron.editor.api("cycleFullscreen", { }, (_err, r) => {});
};

CABLES_CMD_ELECTRON_OVERRIDES.UI = {};
CABLES_CMD_ELECTRON_OVERRIDES.UI.windowFullscreen = () =>
{
    cablesElectron.editor.api("cycleFullscreen", { }, (_err, r) => {});
};

const CABLES_CMD_COMMAND_OVERRIDES = [
    {
        "cmd": "save patch as...",
        "func": CABLES_CMD_ELECTRON_OVERRIDES.PATCH.saveAs
    },
    {
        "cmd": "upload file dialog",
        "func": CABLES_CMD_ELECTRON_OVERRIDES.PATCH.uploadFileDialog
    },
    {
        "cmd": "create new patch",
        "func": CABLES_CMD_ELECTRON_OVERRIDES.PATCH.newPatch
    },
    {
        "cmd": "rename op",
        "func": CABLES_CMD_ELECTRON_OVERRIDES.PATCH.renameOp
    },
    {
        "cmd": "Toggle window fullscreen",
        "func": CABLES_CMD_ELECTRON_OVERRIDES.UI.windowFullscreen
    }
];

CMD_ELECTRON_COMMANDS.push(
    {
        "cmd": "collect assets into patch dir",
        "category": "patch",
        "func": CABLES_CMD_ELECTRON.collectAssets,
        "icon": "file"
    },
    {
        "cmd": "collect ops into patch dir",
        "category": "ops",
        "func": CABLES_CMD_ELECTRON.collectOps,
        "icon": "op"
    },
    {
        "cmd": "manage op directories",
        "category": "ops",
        "func": CABLES_CMD_ELECTRON.manageOpDirs,
        "icon": "folder"
    },
    {
        "cmd": "install ops from package.json",
        "category": "ops",
        "func": CABLES_CMD_ELECTRON.addOpPackage,
        "icon": "op"
    },
    {
        "cmd": "copy op dir to clipboard",
        "category": "ops",
        "func": CABLES_CMD_ELECTRON.copyOpDirToClipboard,
        "icon": "op"
    },
    {
        "cmd": "open op directory",
        "category": "ops",
        "func": CABLES_CMD_ELECTRON.openOpDir,
        "icon": "folder"
    },
    {
        "cmd": "open project directory",
        "category": "patch",
        "func": CABLES_CMD_ELECTRON.openProjectDir,
        "icon": "folder"
    },
    {
        "cmd": "open os file manager",
        "category": "cables",
        "func": CABLES_CMD_ELECTRON.openFileManager,
        "icon": "folder"
    }
);

export default {
    "commands": CMD_ELECTRON_COMMANDS,
    "functions": CABLES_CMD_ELECTRON,
    "functionOverrides": CABLES_CMD_ELECTRON_OVERRIDES,
    "commandOverrides": CABLES_CMD_COMMAND_OVERRIDES,
};
