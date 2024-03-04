import path from "path";
import webpack from "webpack";

export default (isLiveBuild, buildInfo) =>
{
    const __dirname = new URL(".", import.meta.url).pathname;
    console.log("DIRNAME", __dirname);
    return {
        "context": __dirname,
        "mode": isLiveBuild ? "production" : "development",
        "devtool": isLiveBuild ? "source-map" : "eval-cheap-module-source-map",
        "entry": {
            "scripts.standalone.js": [path.resolve(__dirname, "src_client", "index_standalone.js")]
        },
        "output": {
            "path": path.resolve(__dirname, "public", "js"),
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
