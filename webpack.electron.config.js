import path from "path";
import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";

export default (isLiveBuild, buildInfo, minify = false) =>
{
    return {
        "mode": isLiveBuild ? "production" : "development",
        "devtool": minify ? "source-map" : false,
        "entry": {
            "scripts.electron.js": [path.resolve("./src_client", "index_electron.js")],
        },
        "output": {
            "path": path.resolve("./public", "js"),
            "filename": "[name]",
        },
        "optimization": {
            "minimizer": [new TerserPlugin({ "extractComments": false, "terserOptions": { "output": { "comments": false } } })],
            "minimize": minify
        },
        "externals": ["CABLES"],
        "resolve": {
            "extensions": [".js"],
        },
        "plugins": [
            new webpack.BannerPlugin({
                "entryOnly": true,
                "footer": true,
                "raw": true,
                "banner": "var CABLES = CABLES || { \"ELECTRON\": {}}; CABLES.ELECTRON = CABLES.ELECTRON || {}; CABLES.ELECTRON.build = " + JSON.stringify(buildInfo) + ";"
            }),
            new CopyPlugin({
                "patterns": [
                    {
                        "from": path.resolve("./src_client", "index_electron.js"),
                        "to": path.resolve("./public", "js", "buildinfo.json"),
                        "transform": () =>
                        {
                            if (process.env.BUILD_VERSION)
                            {
                                buildInfo.version = process.env.BUILD_VERSION;
                            }
                            return JSON.stringify(buildInfo);
                        }
                    },
                ],
            })
        ]
    };
};
