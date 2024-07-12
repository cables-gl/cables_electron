import { ele } from "cables-shared-client";
import CablesStandalone from "./standalone.js";

const standalone = new CablesStandalone();
window.ele = ele;
document.addEventListener("DOMContentLoaded", () =>
{
    standalone.init();
    window.standalone = standalone;
    document.dispatchEvent(new Event("cablesStandaloneReady"));
});
export default standalone;

