import standalone from "./index_electron.js";

const CABLES_CMD_ELECTRON = {};
const CABLES_CMD_ELECTRON_OVERRIDES = {};
const CMD_ELECTRON_COMMANDS = [];


CABLES_CMD_ELECTRON.newPatch = () =>
{
    standalone.editor.invoke("newPatch", { }, (_err, r) => {});
};

CABLES_CMD_ELECTRON.gotoPatch = () =>
{
    standalone.editor.invoke("gotoPatch", { }, (_err, r) => {});
};

CABLES_CMD_ELECTRON.runNpm = () =>
{
    const loadingModal = standalone.gui.startModalLoading("Installing packages...");
    const options = {};
    standalone.editor.invoke("installProjectDependencies", options, (_err, r) =>
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
    standalone.editor.invoke("openOpDir", { "opId": opId, "opName": opName }, (_err, r) => {});
};

CABLES_CMD_ELECTRON.openProjectDir = (options) =>
{
    standalone.editor.invoke("openProjectDir", options, (_err, r) => {});
};

CABLES_CMD_ELECTRON.openAssetDir = (options) =>
{
    standalone.editor.invoke("openAssetDir", options, (_err, r) => {});
};

CABLES_CMD_ELECTRON.addProjectOpDir = (options) =>
{
    standalone.editor.invoke("addProjectOpDir", options, (_err, r) => {});
};

CABLES_CMD_ELECTRON_OVERRIDES.PATCH = {};
CABLES_CMD_ELECTRON_OVERRIDES.PATCH.saveAs = () =>
{
    standalone.editor.invoke("saveProjectAs", { }, (_err, r) => {});
};
CABLES_CMD_ELECTRON_OVERRIDES.PATCH.uploadFileDialog = () =>
{
    standalone.editor.invoke("openAssetDir", (_err, r) => {});
};

CABLES_CMD_ELECTRON_OVERRIDES.RENDERER = {};
CABLES_CMD_ELECTRON_OVERRIDES.RENDERER.fullscreen = () =>
{
    standalone.editor.invoke("cycleFullscreen", { }, (_err, r) => {});
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
    }
);

export default {
    "commands": CMD_ELECTRON_COMMANDS,
    "functions": CABLES_CMD_ELECTRON,
    "functionOverrides": CABLES_CMD_ELECTRON_OVERRIDES
};
