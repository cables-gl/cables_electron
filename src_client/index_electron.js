import { ele } from "cables-shared-client";
import CablesStandalone from "./standalone.js";

window.ele = ele;
document.addEventListener("DOMContentLoaded", () =>
{
    const standalone = new CablesStandalone();
    standalone.init();
    window.standalone = standalone;
    document.dispatchEvent(new Event("cablesStandaloneReady"));
});
export default window.standalone;

