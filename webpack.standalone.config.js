import path from "path";
import webpack from "webpack";

export default (isLiveBuild, buildInfo) =>
{
    const __dirname = new URL(".", import.meta.url).pathname;
    console.log("DIRNAMES", __dirname, path.join("./src_client", "index.js"), path.resolve("./public", "js"));
    return {
        "mode": isLiveBuild ? "production" : "development",
        "devtool": isLiveBuild ? "source-map" : "eval-cheap-module-source-map",
        "entry": {
            "scripts.standalone.js": [path.join("./src_client", "index_standalone.js")]
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
