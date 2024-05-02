const CABLES_CMD_ELECTRON = {};
const CMD_ELECTRON_COMMANDS = [];

CABLES_CMD_ELECTRON.newPatch = () =>
{
    window.ipcRenderer.invoke("talkerMessage", "newPatch", { }).then((r) => {});
};

CABLES_CMD_ELECTRON.gotoPatch = () =>
{
    window.ipcRenderer.invoke("talkerMessage", "gotoPatch", { }).then((r) => {});
};


CABLES_CMD_ELECTRON.runNpm = () =>
{
    const loadingModal = window.editorIframe.gui.startModalLoading("Installing packages...");
    const options = {};
    window.ipcRenderer.invoke("talkerMessage", "installProjectDependencies", options).then((r) =>
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
    window.ipcRenderer.invoke("talkerMessage", "openOpDir", { "opId": opId, "opName": opName }).then((r) => {});
};

CABLES_CMD_ELECTRON.openProjectDir = (options) =>
{
    window.ipcRenderer.invoke("talkerMessage", "openProjectDir", options).then((r) => {});
};

CABLES_CMD_ELECTRON.openAssetDir = (options) =>
{
    window.ipcRenderer.invoke("talkerMessage", "openAssetDir", options).then((r) => {});
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

export { CABLES_CMD_ELECTRON, CMD_ELECTRON_COMMANDS };
