import ElectronEditor from "./electron_editor.js";
import { CABLES_CMD_ELECTRON, CMD_ELECTRON_COMMANDS } from "./cmd_electron.js";


window.web = { "ElectronEditor": ElectronEditor };
window.electronCommands = {
    "commands": CMD_ELECTRON_COMMANDS,
    "functions": CABLES_CMD_ELECTRON
};

