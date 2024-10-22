import standalone from "./renderer.js";

const CABLES_CMD_STANDALONE = {};
const CABLES_CMD_STANDALONE_OVERRIDES = {};
const CMD_STANDALONE_COMMANDS = [];

CABLES_CMD_STANDALONE.runNpm = () =>
{
    const loadingModal = standalone.gui.startModalLoading("Installing packages...");
    const options = {};
    standalone.editor.api("installProjectDependencies", options, (_err, result) =>
    {
        if (result.data)
        {
            result.data.forEach((r) =>
            {
                if (r.targetDir)
                {
                    loadingModal.setTask("installing to " + r.targetDir);
                }
                if (r.packages && r.packages.length > 0)
                {
                    loadingModal.setTask("found packages");
                    r.packages.forEach((p) =>
                    {
                        loadingModal.setTask(p);
                    });
                }
                if (r.stdout)
                {
                    loadingModal.setTask(r.stdout);
                }
                if (r.stderr)
                {
                    loadingModal.setTask(r.stderr);
                }
            });
            setTimeout(() => { standalone.gui.endModalLoading(); }, 3000);
        }
    });
};

CABLES_CMD_STANDALONE.openOpDir = (opId, opName) =>
{
    standalone.editor.api("openOpDir", { "opId": opId, "opName": opName }, (_err, r) => {});
};

CABLES_CMD_STANDALONE.openProjectDir = (options) =>
{
    standalone.editor.api("openProjectDir", options, (_err, r) => {});
};

CABLES_CMD_STANDALONE.openAssetDir = (options) =>
{
    standalone.editor.api("openAssetDir", options, (_err, r) => {});
};

CABLES_CMD_STANDALONE.addProjectOpDir = (options = {}, cb = null) =>
{
    standalone.editor.api("addProjectOpDir", options, (err, r) =>
    {
        if (cb) cb(err, r.data);
    });
};

CABLES_CMD_STANDALONE.collectAssets = (options) =>
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
                    standalone.gui.setStateUnsaved();
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

CABLES_CMD_STANDALONE.collectOps = (options) =>
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

CABLES_CMD_STANDALONE.exportPatch = () =>
{

};

CABLES_CMD_STANDALONE.orderOpDirs = () =>
{
    standalone.CABLES.platform.openOpDirsTab();
};

CABLES_CMD_STANDALONE.addOpPackage = (options, next) =>
{
    let opTargetDir = null;
    standalone.editor.api("getProjectOpDirs", {}, (err, res) =>
    {
        let html = "";
        let opDirSelect = "Choose target directory:<br/><br/>";
        opDirSelect += "<select id=\"opTargetDir\" name=\"opTargetDir\">";
        for (let i = 0; i < res.data.length; i++)
        {
            const dirInfo = res.data[i];
            if (i === 0) opTargetDir = dirInfo.dir;
            opDirSelect += "<option value=\"" + dirInfo.dir + "\">" + dirInfo.dir + "</option>";
        }
        opDirSelect += "</select>";
        opDirSelect += "<hr/>";
        html += opDirSelect;
        html += "Enter <a href=\"https://docs.npmjs.com/cli/v10/commands/npm-install\">package.json</a> location (git, npm, thz, url, ...):";

        new CABLES.UI.ModalDialog({
            "prompt": true,
            "title": "Install ops from package",
            "html": html,
            "promptOk": (packageLocation) =>
            {
                const loadingModal = standalone.gui.startModalLoading("Installing ops...");
                const packageOptions = { "targetDir": opTargetDir, "package": packageLocation };
                standalone.editor.api("addOpPackage", packageOptions, (_err, result) =>
                {
                    const r = result.data;
                    if (r)
                    {
                        if (r.targetDir)
                        {
                            loadingModal.setTask("installing to " + r.targetDir);
                        }
                        if (r.packages && r.packages.length > 0)
                        {
                            loadingModal.setTask("found ops");
                            r.packages.forEach((p) =>
                            {
                                loadingModal.setTask(p);
                            });
                        }
                        if (r.stdout)
                        {
                            loadingModal.setTask(r.stdout);
                        }
                        if (r.stderr)
                        {
                            loadingModal.setTask(r.stderr);
                        }
                        loadingModal.setTask("done");
                        next(_err, r);
                        setTimeout(() => { standalone.gui.endModalLoading(); }, 3000);
                    }
                });
            }
        });

        const dirSelect = standalone.editorWindow.ele.byId("opTargetDir");
        if (dirSelect)
        {
            dirSelect.addEventListener("change", () =>
            {
                opTargetDir = dirSelect.value;
            });
        }
    });
};

CABLES_CMD_STANDALONE_OVERRIDES.PATCH = {};
CABLES_CMD_STANDALONE_OVERRIDES.PATCH.saveAs = () =>
{
    standalone.editor.api("saveProjectAs", { }, (_err, r) => {});
};
CABLES_CMD_STANDALONE_OVERRIDES.PATCH.uploadFileDialog = () =>
{
    standalone.editor.api("selectFile", {}, (_err, filepath) =>
    {
        if (!_err && filepath)
        {
            const gui = standalone.gui;
            if (gui) gui.patchView.addAssetOpAuto(filepath);
        }
    });
};
CABLES_CMD_STANDALONE_OVERRIDES.PATCH.newPatch = () =>
{
    standalone.editor.api("newPatch", { }, (_err, r) => {});
};

CABLES_CMD_STANDALONE_OVERRIDES.PATCH.renameOp = () =>
{
    const gui = standalone.gui;
    if (gui)
    {
        const ops = gui.patchView.getSelectedOps();
        if (!ops.length) return;

        const op = ops[0];

        gui.serverOps.renameDialog(op.objName);
    }
};

CABLES_CMD_STANDALONE_OVERRIDES.RENDERER = {};
CABLES_CMD_STANDALONE_OVERRIDES.RENDERER.fullscreen = () =>
{
    standalone.editor.api("cycleFullscreen", { }, (_err, r) => {});
};

const CABLES_CMD_COMMAND_OVERRIDES = [
    {
        "cmd": "save patch as...",
        "func": CABLES_CMD_STANDALONE_OVERRIDES.PATCH.saveAs
    },
    {
        "cmd": "upload file dialog",
        "func": CABLES_CMD_STANDALONE_OVERRIDES.PATCH.uploadFileDialog
    },
    {
        "cmd": "create new patch",
        "func": CABLES_CMD_STANDALONE_OVERRIDES.PATCH.newPatch
    },
    {
        "cmd": "rename op",
        "func": CABLES_CMD_STANDALONE_OVERRIDES.PATCH.renameOp
    },
];

CMD_STANDALONE_COMMANDS.push(
    {
        "cmd": "install project npm packages",
        "category": "electron",
        "func": CABLES_CMD_STANDALONE.runNpm,
        "icon": "electron"
    },
    {
        "cmd": "copy assets into patch dir",
        "category": "patch",
        "func": CABLES_CMD_STANDALONE.collectAssets,
        "icon": "file"
    },
    {
        "cmd": "copy ops into patch dir",
        "category": "ops",
        "func": CABLES_CMD_STANDALONE.collectOps,
        "icon": "op"
    },
    {
        "cmd": "set search order of op directories",
        "category": "ops",
        "func": CABLES_CMD_STANDALONE.orderOpDirs,
        "icon": "folder"
    },
    {
        "cmd": "install ops from package.json",
        "category": "ops",
        "func": CABLES_CMD_STANDALONE.addOpPackage,
        "icon": "op"
    },
);

export default {
    "commands": CMD_STANDALONE_COMMANDS,
    "functions": CABLES_CMD_STANDALONE,
    "functionOverrides": CABLES_CMD_STANDALONE_OVERRIDES,
    "commandOverrides": CABLES_CMD_COMMAND_OVERRIDES,
};
