import cablesElectron from "./renderer.js";

export { CmdElectron };

class CmdElectron
{

    static get commands()
    {

        return [
            {
                "cmd": "collect assets into patch dir",
                "category": "patch",
                "func": CmdElectron.collectAssets,
                "icon": "file"
            },
            {
                "cmd": "collect ops into patch dir",
                "category": "ops",
                "func": CmdElectron.collectOps,
                "icon": "op"
            },
            {
                "cmd": "manage op directories",
                "category": "ops",
                "func": CmdElectron.manageOpDirs,
                "icon": "folder"
            },
            // {
            //     "cmd": "install ops from package.json",
            //     "category": "ops",
            //     "func": CmdElectron.addOpPackage,
            //     "icon": "op"
            // },
            {
                "cmd": "copy op dir to clipboard",
                "category": "ops",
                "func": CmdElectron.copyOpDirToClipboard,
                "icon": "op"
            },
            {
                "cmd": "open op directory",
                "category": "ops",
                "func": CmdElectron.openOpDir,
                "icon": "folder"
            },
            {
                "cmd": "open project directory",
                "category": "patch",
                "func": CmdElectron.openProjectDir,
                "icon": "folder"
            },
            {
                "cmd": "open os file manager",
                "category": "cables",
                "func": CmdElectron.openFileManager,
                "icon": "folder"
            }
        ];
    }

    static collectAssets()
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
    }

    static collectOps()
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
    }

    static manageOpDirs()
    {
        cablesElectron.openOpDirsTab();
    }

    static openProjectDir()
    {
        cablesElectron.editor.api("openProjectDir", {}, (_err, r) => {});
    }

    static openFileManager(url = null)
    {
        const data = {};
        if (url) data.url = url;
        cablesElectron.editor.api("openFileManager", data, (_err, r) => {});
    }

    static copyOpDirToClipboard(opId = null)
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
    }

    // static toggleTransparentPopout()
    // {
    //     const current = gui.userSettings.get("transparentpopout", true);
    //     gui.userSettings.set("transparentpopout", !current);
    //     cablesElectron.editor.notify("Transparent popout canvas: " + (!current ? "enabled" : "disabled"));
    // };

    static openOpDir(opId = null, opName = null)
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
    }
}
