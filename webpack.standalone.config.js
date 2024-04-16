import path from "path";
import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";

export default (isLiveBuild, buildInfo, minify = false) =>
{
    return {
        "mode": isLiveBuild ? "production" : "development",
        "devtool": minify ? "source-map" : "eval-cheap-module-source-map",
        "entry": {
            "scripts.standalone.js": [path.resolve("./src_client", "index_standalone.js")]
        },
        "output": {
            "path": path.resolve("./public", "js"),
            "filename": "[name]",
        },
        "optimization": {
            "minimizer": [new TerserPlugin({ "extractComments": false })],
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
                "banner": "var CABLES = CABLES || { \"STANDALONE\": {}}; CABLES.STANDALONE = CABLES.STANDALONE || {}; CABLES.STANDALONE.build = " + JSON.stringify(buildInfo) + ";"
            })
        ]
    };
};
