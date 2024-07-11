import standalone from "./index_electron.js";

const CABLES_CMD_ELECTRON = {};
const CABLES_CMD_ELECTRON_OVERRIDES = {};
const CMD_ELECTRON_COMMANDS = [];

CABLES_CMD_ELECTRON.runNpm = () =>
{
    const loadingModal = standalone.gui.startModalLoading("Installing packages...");
    const options = {};
    standalone.editor.api("installProjectDependencies", options, (_err, r) =>
    {
        if (r.data)
        {
            if (r.data.packages && r.data.packages.length > 0)
            {
                loadingModal.setTask("found packages");
                r.data.packages.forEach((p) =>
                {
                    loadingModal.setTask(p);
                });
            }
            if (r.data.stdout)
            {
                loadingModal.setTask(r.data.stdout);
            }
            if (r.data.stderr)
            {
                loadingModal.setTask(r.data.stderr);
            }
        }
        setTimeout(() => { standalone.gui.endModalLoading(); }, 3000);
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
    const loadingModal = standalone.gui.startModalLoading("Copying assets...");
    let closeTimeout = 2000;
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
        setTimeout(() => { standalone.gui.endModalLoading(); }, closeTimeout);
    });
};

CABLES_CMD_ELECTRON.collectOps = (options) =>
{
    const loadingModal = standalone.gui.startModalLoading("Copying ops...");
    let closeTimeout = 2000;
    standalone.editor.api("collectOps", options, (_err, r) =>
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
            setTimeout(() => { standalone.gui.endModalLoading(); }, closeTimeout);
        }
        else
        {
            loadingModal.setTask("failed to copy ops");
            loadingModal.setTask("---");
            loadingModal.setTask(_err);
            closeTimeout = 5000;
            setTimeout(() => { standalone.gui.endModalLoading(); }, closeTimeout);
        }
    });
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
CABLES_CMD_ELECTRON_OVERRIDES.PATCH.newPatch = () =>
{
    standalone.editor.api("newPatch", { }, (_err, r) => {});
};

CABLES_CMD_ELECTRON_OVERRIDES.RENDERER = {};
CABLES_CMD_ELECTRON_OVERRIDES.RENDERER.fullscreen = () =>
{
    standalone.editor.api("cycleFullscreen", { }, (_err, r) => {});
};

CMD_ELECTRON_COMMANDS.orderOpDirs = () =>
{
    new StandaloneOpDirs(gui.mainTabs);
    gui.maintabPanel.show(true);
};


CMD_ELECTRON_COMMANDS.push(
    {
        "cmd": "install project npm packages",
        "category": "electron",
        "func": CABLES_CMD_ELECTRON.runNpm,
        "icon": "electron"
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
    },
    {
        "cmd": "set search order of op directories",
        "category": "ops",
        "func": CABLES_CMD_ELECTRON.orderOpDirs,
        "icon": "folder"
    }
);

export default {
    "commands": CMD_ELECTRON_COMMANDS,
    "functions": CABLES_CMD_ELECTRON,
    "functionOverrides": CABLES_CMD_ELECTRON_OVERRIDES
};
