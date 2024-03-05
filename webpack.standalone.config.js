import path from "path";
import webpack from "webpack";

export default (isLiveBuild, buildInfo) =>
{
    return {
        "mode": isLiveBuild ? "production" : "development",
        "devtool": isLiveBuild ? "source-map" : "eval-cheap-module-source-map",
        "entry": {
            "scripts.standalone.js": [path.resolve("./src_client", "index_standalone.js")]
        },
        "output": {
            "path": path.resolve("./public", "js"),
            "filename": "[name]",
        },
        "stats": isLiveBuild,
        "optimization": { "minimize": isLiveBuild },
        "externals": ["CABLES"],
        "resolve": {
            "extensions": [".js"],
        },
        "plugins": [
            new webpack.DefinePlugin({
                "window.BUILD_INFO": JSON.stringify(buildInfo)
            })
        ]
    };
};
