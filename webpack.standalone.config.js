import path from "path";
import webpack from "webpack";

export default (isLiveBuild, buildInfo) =>
{
    return {
        "mode": isLiveBuild ? "production" : "development",
        "devtool": "source-map",
        "entry": {
            "scripts.standalone.js": [path.resolve("./src_client", "index_standalone.js")]
        },
        "output": {
            "path": path.resolve("./public", "js"),
            "filename": "[name]",
        },
        "optimization": { "minimize": true },
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
