import gulp from "gulp";
import fs from "fs";
import path from "path";
import mkdirp from "mkdirp";

import webpack from "webpack-stream";
import compiler from "webpack";
import jsonfile from "jsonfile";
import git from "git-last-commit";
import webpackElectronConfig from "./webpack.electron.config.js";

const defaultConfigLocation = "./cables.json";
let configLocation = defaultConfigLocation;
if (process.env.npm_config_apiconfig) configLocation = "./cables_env_" + process.env.npm_config_apiconfig + ".json";

if (!fs.existsSync(configLocation))
{
    if (fs.existsSync(defaultConfigLocation))
    {
        console.warn("config file not found at", configLocation, "copying from cables.json");
        let defaultConfig = JSON.parse(fs.readFileSync(defaultConfigLocation, "utf-8"));
        defaultConfig.path.assets = "../resources/assets/";
        jsonfile.writeFileSync(configLocation, defaultConfig, { "encoding": "utf-8", "spaces": 4 });
    }
    else
    {
        console.error("no config file found at neither", configLocation, "nor", defaultConfigLocation);
        process.exit(1);
    }
}

let config = JSON.parse(fs.readFileSync(defaultConfigLocation, "utf-8"));
if (configLocation !== defaultConfigLocation)
{
    const localConfig = JSON.parse(fs.readFileSync(configLocation, "utf-8"));
    config = { ...config, localConfig };
}
const isLiveBuild = config.env === "electron";
const minify = config.hasOwnProperty("minifyJs") ? config.minifyJs : false;

function _create_ops_dirs(done)
{
    const opsPath = path.join("./src", config.path.ops);
    console.log("creating opdirs in", opsPath);
    fs.rmSync("ops", { "recursive": true, "force": true });
    mkdirp.sync(path.join(opsPath, "/base/"));
    mkdirp.sync(path.join(opsPath, "/extensions/"));
    mkdirp.sync(path.join(opsPath, "/patches/"));
    mkdirp.sync(path.join(opsPath, "/teams/"));
    mkdirp.sync(path.join(opsPath, "/users/"));
    done();
}

function _libs_copy()
{
    const target = path.join("./src", config.path.libs);
    const source = path.join("./src", config.sourcePath.libs);
    console.log("copying", source, "to", target);
    mkdirp.sync(target);
    return gulp.src(source + "**").pipe(gulp.dest(target));
}

function _corelibs_copy()
{
    const target = path.join("./src", config.path.corelibs);
    const source = path.join("./src", config.sourcePath.corelibs);
    console.log("copying", source, "to", target);
    mkdirp.sync(target);
    return gulp.src(source + "**").pipe(gulp.dest(target));
}

function _core_ops_copy()
{
    const target = path.join("./src", config.path.ops, "/base/");
    const source = path.join("./src", config.sourcePath.ops, "/base/");
    console.log("copying", source, "to", target);
    mkdirp.sync(target);
    return gulp.src(source + "**").pipe(gulp.dest(target));
}

function _extension_ops_copy()
{
    const target = path.join("./src", config.path.ops, "/extensions/");
    const source = path.join("./src", config.sourcePath.ops, "/extensions/");
    console.log("copying", source, "to", target);
    mkdirp.sync(target);
    return gulp.src(source + "**").pipe(gulp.dest(target));
}

function _ui_copy()
{
    const target = path.join("./src", config.path.uiDist);
    const source = path.join("./src", config.sourcePath.uiDist);
    console.log("copying", source, "to", target);
    mkdirp.sync(target);
    return gulp.src(source + "**").pipe(gulp.dest(target));
}

function _editor_scripts_webpack(done)
{
    getBuildInfo((buildInfo) =>
    {
        const target = path.join("./src", config.path.js);
        return gulp.src(["src_client/index_electron.js"])
            .pipe(
                webpack(
                    {
                        "config": webpackElectronConfig(isLiveBuild, buildInfo, minify),
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
            .pipe(gulp.dest(target))
            .on("error", (err) =>
            {
                console.error("WEBPACK ERROR NEU!!!!!!!", err);
                done(err);
            });
    });
}

const getBuildInfo = (cb) =>
{
    const date = new Date();
    git.getLastCommit((err, commit) =>
    {
        const info = {
            "timestamp": date.getTime(),
            "created": date.toISOString(),
            "git": {
                "branch": commit.branch,
                "commit": commit.hash,
                "date": commit.committedOn,
                "message": commit.subject
            }
        };
        if (commit.tags && commit.tags.length > 0)
        {
            info.git.tag = commit.tags[0];
        }
        cb(info);
    });
};

/*
 * -------------------------------------------------------------------------------------------
 * MAIN TASKS
 * -------------------------------------------------------------------------------------------
 */
gulp.task("build", gulp.series(
    _create_ops_dirs,
    gulp.parallel(
        _editor_scripts_webpack,
        _corelibs_copy,
        _core_ops_copy,
        _extension_ops_copy,
        _libs_copy,
        _ui_copy
    ),
));

gulp.task("build:source", gulp.series(
    gulp.parallel(
        _editor_scripts_webpack
    ),
));
