import StandaloneEditor from "./standalone_editor.js";

const CABLES_CMD_STANDALONE = {};
const CMD_STANDALONE_COMMANDS = [];

window.web = { "StandaloneEditor": StandaloneEditor };
window.standaloneCommands = {
    "commands": CMD_STANDALONE_COMMANDS,
    "functions": CABLES_CMD_STANDALONE
};

CABLES_CMD_STANDALONE.runNpm = () =>
{
    const options = {};
    window.ipcRenderer.invoke("talkerMessage", "installProjectDependencies", options).then((r) => {});
};


CMD_STANDALONE_COMMANDS.push({
    "cmd": "install project npm packages",
    "category": "patch",
    "func": CABLES_CMD_STANDALONE.runNpm,
    "icon": "file"
});

