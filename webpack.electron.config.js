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
            "path": path.resolve("./dist", "public", "js"),
            "filename": "[name]",
        },
        "optimization": {
            "concatenateModules": true,
            "minimizer": [new TerserPlugin({
                "extractComments": false,
                "terserOptions": { "output": { "comments": false } }
            })],
            "minimize": minify,
            "usedExports": true
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
                        "to": path.resolve("./dist", "public", "js", "buildinfo.json"),
                        "transform": () =>
                        {
                            if (!buildInfo.platform)
                            {
                                buildInfo.platform = {};
                            }
                            if (process.env.BUILD_VERSION)
                            {
                                buildInfo.version = process.env.BUILD_VERSION;
                            }
                            if (process.env.BUILD_OS)
                            {
                                buildInfo.platform.os = process.env.BUILD_OS;
                            }
                            if (process.env.npm_config_npm_version)
                            {
                                buildInfo.platform.npm = process.env.npm_config_npm_version;
                            }
                            if (process.env.npm_package_engines_node)
                            {
                                buildInfo.platform.node = process.env.npm_package_engines_node;
                            }
                            console.log("PRO", buildInfo);
                            return JSON.stringify(buildInfo);
                        }
                    },
                ],
            })
        ]
    };
};
