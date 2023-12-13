import gulp from "gulp";
import fs from "fs";
import path from "path";

let configLocation = "./cables.json";
if (process.env.npm_config_apiconfig) configLocation = "./cables_env_" + process.env.npm_config_apiconfig + ".json";

if (!fs.existsSync(configLocation))
{
    console.error("config file not found at", configLocation);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configLocation, "utf-8"));

function _api_copy()
{
    const fileNames = config.apiDependencies || [];
    const apiPath = config.path.api;
    const files = fileNames.map((file) => { return path.join(apiPath, file); });
    return gulp.src(files, { "base": apiPath }).pipe(gulp.dest("api/"));
}

function _ui_copy()
{
    return gulp.src("../cables_ui/dist/*/**").pipe(gulp.dest("ui/"));
}

function _ops_copy()
{
    return gulp.src("../cables_ui/dist/*").pipe(gulp.dest("cables/src/ops/"));
}

/*
 * -------------------------------------------------------------------------------------------
 * MAIN TASKS
 * -------------------------------------------------------------------------------------------
 */
gulp.task("build", gulp.series(
    gulp.parallel(
        _api_copy,
        _ui_copy,
        // _ops_copy
    ),
));
