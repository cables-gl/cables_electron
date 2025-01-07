import { ele } from "cables-shared-client";
import CablesElectron from "./cables_electron.js";

const cablesElectron = new CablesElectron();
window.ele = ele;
document.addEventListener("DOMContentLoaded", () =>
{
    cablesElectron.init();
    window.electron = cablesElectron;
    document.dispatchEvent(new Event("cablesStandaloneReady"));
});
export default cablesElectron;

