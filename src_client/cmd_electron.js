import standalone from "./index_electron.js";

const CABLES_CMD_ELECTRON = {};
const CABLES_CMD_ELECTRON_OVERRIDES = {};
const CMD_ELECTRON_COMMANDS = [];


CABLES_CMD_ELECTRON.newPatch = () =>
{
    standalone.editor.api("newPatch", { }, (_err, r) => {});
};

CABLES_CMD_ELECTRON.gotoPatch = () =>
{
    standalone.editor.api("gotoPatch", { }, (_err, r) => {});
};

CABLES_CMD_ELECTRON.runNpm = () =>
{
    const loadingModal = standalone.gui.startModalLoading("Installing packages...");
    const options = {};
    standalone.editor.api("installProjectDependencies", options, (_err, r) =>
    {
        if (r.stdout)
        {
            loadingModal.setTask(r.stdout);
        }
        if (r.stderr)
        {
            loadingModal.setTask(r.stderr);
        }
    });
};


CABLES_CMD_ELECTRON.openOpDir = (opId, opName) =>
{
    standalone.editor.api("openOpDir", { "opId": opId, "opName": opName }, (_err, r) => {});
};

CABLES_CMD_ELECTRON.openProjectDir = (options) =>
{
    standalone.editor.api("openProjectDir", options, (_err, r) => {});
};

CABLES_CMD_ELECTRON.openAssetDir = (options) =>
{
    standalone.editor.api("openAssetDir", options, (_err, r) => {});
};

CABLES_CMD_ELECTRON.addProjectOpDir = (options) =>
{
    standalone.editor.api("addProjectOpDir", options, (_err, r) => {});
};

CABLES_CMD_ELECTRON.collectAssets = (options) =>
{
    standalone.editor.api("collectAssets", options, (_err, r) =>
    {
        if (!_err)
        {
            const ops = standalone.gui.corePatch().ops;
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
                Object.keys(oldNew).forEach((srch) =>
                {
                    const rplc = oldNew[srch];
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
            }
        }
    });
};

CABLES_CMD_ELECTRON.collectOps = (options) =>
{
    standalone.editor.api("collectOps", options, (_err, r) => {});
};

CABLES_CMD_ELECTRON_OVERRIDES.PATCH = {};
CABLES_CMD_ELECTRON_OVERRIDES.PATCH.saveAs = () =>
{
    standalone.editor.api("saveProjectAs", { }, (_err, r) => {});
};
CABLES_CMD_ELECTRON_OVERRIDES.PATCH.uploadFileDialog = () =>
{
    standalone.editor.api("openAssetDir", (_err, r) => {});
};

CABLES_CMD_ELECTRON_OVERRIDES.RENDERER = {};
CABLES_CMD_ELECTRON_OVERRIDES.RENDERER.fullscreen = () =>
{
    standalone.editor.api("cycleFullscreen", { }, (_err, r) => {});
};

CMD_ELECTRON_COMMANDS.push(
    {
        "cmd": "new patch",
        "category": "electron",
        "func": CABLES_CMD_ELECTRON.newPatch,
        "icon": "electron"
    },
    {
        "cmd": "open patch",
        "category": "electron",
        "func": CABLES_CMD_ELECTRON.openPatch,
        "icon": "electron"
    },
    {
        "cmd": "install project npm packages",
        "category": "electron",
        "func": CABLES_CMD_ELECTRON.runNpm,
        "icon": "electron"
    },
    {
        "cmd": "open project working directory",
        "category": "electron",
        "func": CABLES_CMD_ELECTRON.openProjectDir,
        "icon": "file"
    },
    {
        "cmd": "open project asset path",
        "category": "electron",
        "func": CABLES_CMD_ELECTRON.openAssetDir,
        "icon": "file"
    },
    {
        "cmd": "copy assets into project dir",
        "category": "patch",
        "func": CABLES_CMD_ELECTRON.collectAssets,
        "icon": "file"
    },
    {
        "cmd": "copy ops into project dir",
        "category": "ops",
        "func": CABLES_CMD_ELECTRON.collectOps,
        "icon": "op"
    }
);

export default {
    "commands": CMD_ELECTRON_COMMANDS,
    "functions": CABLES_CMD_ELECTRON,
    "functionOverrides": CABLES_CMD_ELECTRON_OVERRIDES
};
