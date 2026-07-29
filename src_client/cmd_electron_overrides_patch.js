import pako from "pako";
import cablesElectron from "./renderer.js";

export { CmdElectronOverridesPatch };

class CmdElectronOverridesPatch
{

    static saveAs()
    {
        const gui = cablesElectron.gui;
        let patchName = cablesElectron.gui.project() ? cablesElectron.gui.project().name : null;

        let b64 = null;
        if (gui)
        {
            const patch = cablesElectron.gui.patchView.store.makePatchSavable();
            const patchstr = JSON.stringify(patch);
            let uint8data = pako.deflate(patchstr);
            b64 = CmdElectronOverridesPatch.bytesArrToBase64(uint8data);
        }
        cablesElectron.editor.api("saveProjectAs", {
            "name": patchName,
            "dataB64": b64
        }, (err) =>
        {
            if (!err && gui)
            {
                gui.savedState.setSaved("save as end", 0);
            }
        });
    }

    static uploadFileDialog()
    {
        cablesElectron.editor.api("selectFile", {}, (_err, filepath) =>
        {
            if (!_err && filepath)
            {
                const gui = cablesElectron.gui;
                if (gui) gui.patchView.addAssetOpAuto(filepath);
            }
        });
    }

    static newPatch()
    {
        cablesElectron.editor.api("newPatch", { }, (_err, r) => {});
    }

    static bytesArrToBase64(arr)
    {
        const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; // base64 alphabet
        const bin = (n) => { return n.toString(2).padStart(8, 0); }; // convert num to 8-bit binary string
        const l = arr.length;
        let result = "";

        for (let i = 0; i <= (l - 1) / 3; i++)
        {
            let c1 = i * 3 + 1 >= l; // case when "=" is on end
            let c2 = i * 3 + 2 >= l; // case when "=" is on end
            let chunk = bin(arr[3 * i]) + bin(c1 ? 0 : arr[3 * i + 1]) + bin(c2 ? 0 : arr[3 * i + 2]);
            let r = chunk.match(/.{1,6}/g).map((x, j) => { return (j == 3 && c2 ? "=" : (j == 2 && c1 ? "=" : abc[+("0b" + x)])); });
            result += r.join("");
        }

        return result;
    }

}
