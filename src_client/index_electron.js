import { ele } from "cables-shared-client";
import standalone from "./standalone.js";

window.ele = ele;
document.addEventListener("DOMContentLoaded", () =>
{
    standalone.init();
    window.standalone = standalone;
    document.dispatchEvent(new Event("cablesStandaloneReady"));
});
export default standalone;

