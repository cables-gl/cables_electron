import { notarize } from "electron-notarize";
import { fileURLToPath } from "url";
import path from "path";

export default async function notarizing(context)
{
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== "darwin")
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
