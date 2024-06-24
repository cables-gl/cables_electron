import path, { dirname } from "path";
import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import { fileURLToPath } from "url";

export default (isLiveBuild, buildInfo, minify = false, analyze = false) =>
{
    const __dirname = dirname(fileURLToPath(import.meta.url));

    const plugins = [
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
                        if (process.env.BUILD_VERSION)
                        {
                            buildInfo.version = process.env.BUILD_VERSION;
                        }
                        return JSON.stringify(buildInfo);
                    }
                },
            ],
        })
    ];

    if (analyze)
    {
        plugins.push(new BundleAnalyzerPlugin({ "analyzerMode": "static", "openAnalyzer": false, "reportTitle": "cables electron", "reportFilename": path.join(__dirname, "dist", "report_selectron.html") }));
    }

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
        "plugins": plugins
    };
};
