import { notarize } from "electron-notarize";
import { fileURLToPath } from "url";
import path from "path";

export default async function notarizing(context)
{
    const { electronPlatformName, appOutDir } = context;

    console.log("NOTARIZE", electronPlatformName, process.env.NOTARIZE);
    if (electronPlatformName !== "darwin")
    {
        return;
    }

    if (!process.env.NOTARIZE || process.env.NOTARIZE === "false")
    {
        return;
    }

    return await notarize({
        "tool": "notarytool",
        "appBundleId": "gl.cables.standalone",
        "appPath": appOutDir,
        "appleId": process.env.APPLE_ID,
        "appleIdPassword": process.env.APPLE_APP_SPECIFIC_PASSWORD,
        "teamId": process.env.APPLE_TEAM_ID
    });
}
