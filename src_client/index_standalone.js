import StandaloneEditor from "./standalone_editor.js";
import { CABLES_CMD_STANDALONE, CMD_STANDALONE_COMMANDS } from "./cmd_standalone.js";


window.web = { "StandaloneEditor": StandaloneEditor };
window.standaloneCommands = {
    "commands": CMD_STANDALONE_COMMANDS,
    "functions": CABLES_CMD_STANDALONE
};

