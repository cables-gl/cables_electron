import gulp from "gulp";
import fs from "fs";
import path from "path";
import getRepoInfo from "git-repo-info";

import webpack from "webpack-stream";
import compiler from "webpack";
import webpackStandaloneConfig from "./webpack.standalone.config.js";

let configLocation = "./cables.json";
if (process.env.npm_config_apiconfig) configLocation = "./cables_env_" + process.env.npm_config_apiconfig + ".json";

if (!fs.existsSync(configLocation))
{
    console.error("config file not found at", configLocation);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configLocation, "utf-8"));
const isLiveBuild = config.env === "electron";

let buildInfo = getBuildInfo();

function getBuildInfo()
{
    const git = getRepoInfo();
    const date = new Date();
    return JSON.stringify({
        "timestamp": date.getTime(),
        "created": date.toISOString(),
        "git": {
            "branch": git.branch,
            "commit": git.sha,
            "date": git.committerDate,
            "message": git.commitMessage
        }
    });
}

function _api_copy()
{
    return gulp.src("../cables_api/public/libs/**").pipe(gulp.dest("public/libs/"));
}

function _core_copy()
{
    return gulp.src("../cables/build/libs/**").pipe(gulp.dest("public/libs_core/"));
}

function _ui_copy()
{
    return gulp.src("../cables_ui/dist/**").pipe(gulp.dest("ui/"));
}

function _editor_scripts_webpack(done)
{
    return gulp.src(["src_client/index_standalone.js"])
        .pipe(
            webpack(
                {
                    "config": webpackStandaloneConfig(isLiveBuild, buildInfo),
                },
                compiler,
                (err, stats) =>
                {
                    if (err) done(err);
                    if (stats.hasErrors())
                    {
                        done(new Error(stats.compilation.errors.join("\n")));
                    }
                    else
                    {
                        done();
                    }
                }
            )
        )
        .pipe(gulp.dest("public/js"))
        .on("error", (err) =>
        {
            console.error("WEBPACK ERROR NEU!!!!!!!", err);
            done(err);
        });
}

/*
 * -------------------------------------------------------------------------------------------
 * MAIN TASKS
 * -------------------------------------------------------------------------------------------
 */
gulp.task("build", gulp.series(
    gulp.parallel(
        _editor_scripts_webpack,
        _core_copy,
        _api_copy,
        _ui_copy
    ),
));
