import path from "path";
import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import getRepoInfo from "git-repo-info";

export default (isLiveBuild, minify = false) =>
{
    const getBuildInfo = () =>
    {
        const git = getRepoInfo();
        const date = new Date();
        const info = {
            "timestamp": date.getTime(),
            "created": date.toISOString(),
            "git": {
                "branch": git.branch,
                "commit": git.sha,
                "date": git.committerDate,
                "message": git.commitMessage,
                "tag": git.tag
            }
        };
        if (process.env.BUILD_VERSION)
        {
            info.version = process.env.BUILD_VERSION;
        }
        return JSON.stringify(info);
    };

    let buildInfo = getBuildInfo();

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
                            console.log("P", buildInfo);
                            return buildInfo;
                        }
                    },
                ],
            })
        ]
    };
};
