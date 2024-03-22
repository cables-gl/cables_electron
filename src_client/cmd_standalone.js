const CABLES_CMD_STANDALONE = {};
const CMD_STANDALONE_COMMANDS = [];

CABLES_CMD_STANDALONE.runNpm = () =>
{
    const options = {};
    window.ipcRenderer.invoke("talkerMessage", "installProjectDependencies", options).then((r) => {});
};

CABLES_CMD_STANDALONE.openProjectDir = () =>
{
    const options = {};
    window.ipcRenderer.invoke("talkerMessage", "openProjectDir", options).then((r) => {});
};

CABLES_CMD_STANDALONE.openAssetDir = () =>
{
    const options = {};
    window.ipcRenderer.invoke("talkerMessage", "openAssetDir", options).then((r) => {});
};

CMD_STANDALONE_COMMANDS.push(
    {
        "cmd": "install project npm packages",
        "category": "patch",
        "func": CABLES_CMD_STANDALONE.runNpm,
        "icon": "file"
    },
    {
        "cmd": "open project working directory",
        "category": "patch",
        "func": CABLES_CMD_STANDALONE.openProjectDir,
        "icon": "file"
    },
    {
        "cmd": "open project asset path",
        "category": "patch",
        "func": CABLES_CMD_STANDALONE.openAssetDir,
        "icon": "file"
    }
);

export { CABLES_CMD_STANDALONE, CMD_STANDALONE_COMMANDS };
