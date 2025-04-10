import gulp from "gulp";
import fs from "fs";
import path from "path/posix";
import mkdirp from "mkdirp";
import webpack from "webpack";
import jsonfile from "jsonfile";
import git from "git-last-commit";
import { execa } from "execa";
import webpackElectronConfig from "./webpack.electron.config.js";

const corePath = "../../cables/";
const uiPath = "../../cables_ui/";
const sharedPath = "../../shared/";
let analyze = false;
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
        defaultConfig.path.uiDist = path.join(uiPath, "dist/");
        defaultConfig.path.ops = path.join(corePath, "src/ops/");
        defaultConfig.path.libs = path.join(sharedPath, "libs/");
        defaultConfig.path.corelibs = path.join(corePath, "build/libs/");
        jsonfile.writeFileSync(configLocation, defaultConfig, { "encoding": "utf-8", "spaces": 4 });
    }
    else
    {
        console.error("config file found at neither", configLocation, "nor", defaultConfigLocation);
        process.exit(1);
    }
}

let defaultConfig = JSON.parse(fs.readFileSync(defaultConfigLocation, "utf-8"));
let config = defaultConfig;
if (configLocation !== defaultConfigLocation)
{
    const localConfig = JSON.parse(fs.readFileSync(configLocation, "utf-8"));
    config = { ...config, ...localConfig };
    jsonfile.writeFileSync(configLocation, config, { "encoding": "utf-8", "spaces": 4 });
}
const isLiveBuild = config.env === "electron";
const minify = config.hasOwnProperty("minifyJs") ? config.minifyJs : false;

const watchers = [];
function _watch(done)
{
    const watchOptions = { "usePolling": true, "ignored": (fileName) => { return fileName.includes("node_modules"); } };
    watchers.push(gulp.watch(["src_client/*.js", "src_client/**/*.js", "../shared/constants.json", "../shared/client/**/*.js"], watchOptions, gulp.series(defaultSeries)));
    watchers.push(gulp.watch(["src/*.js", "src/**/*.js", "../shared/api/**/*.js"], watchOptions, gulp.series(electronChanges)));
    done();
}

function electronChanges(done)
{
    console.log("\x1b[33m Registered changes that require a restart of electron! \x1b[0m");
    done();
}

function _analyze(done)
{
    analyze = true;
    done();
}

function _serve(done)
{
    execa(
        "electron",
        ["."],
        { "preferLocal": true, "stdout": "inherit", "stderr": "inherit" }).then((o, te, thr) =>
    {
        watchers.forEach((watcher) =>
        {
            watcher.close();
        });
    });
    done();
}

function _create_ops_dirs(done)
{
    const opsPath = path.join("./src", defaultConfig.path.ops);
    fs.rmSync("ops", { "recursive": true, "force": true });
    mkdirp.sync(path.join(opsPath, "/base/"));
    mkdirp.sync(path.join(opsPath, "/extensions/"));
    mkdirp.sync(path.join(opsPath, "/patches/"));
    mkdirp.sync(path.join(opsPath, "/teams/"));
    mkdirp.sync(path.join(opsPath, "/users/"));
    done();
}

function _libs_copy(done)
{
    const source = path.join("./src", config.sourcePath.libs);
    const target = path.join("./src", defaultConfig.path.libs);
    mkdirp.sync(target);
    if (fs.existsSync(source))
    {
        console.info("copying libs from", source, "to", target);
        return gulp.src(source + "**", { "encoding": false }).pipe(gulp.dest(target));
    }
    else
    {
        console.error("FAILED to copy libs from", source, "to", target);
        done();
    }
}

function _corelibs_copy(done)
{
    const source = path.join("./src", config.sourcePath.corelibs);
    const target = path.join("./src", defaultConfig.path.corelibs);
    mkdirp.sync(target);
    if (fs.existsSync(source))
    {
        console.info("copying corelibs from", source, "to", target);
        return gulp.src(source + "**", { "encoding": false }).pipe(gulp.dest(target));
    }
    else
    {
        console.error("FAILED to copy corelibs from", source, "to", target);
        done();
    }
}

function _core_ops_copy(done)
{
    const source = path.join("./src", config.sourcePath.ops, "/base/");
    const target = path.join("./src", defaultConfig.path.ops, "/base/");
    mkdirp.sync(target);
    if (fs.existsSync(source))
    {
        console.info("copying ops from", source, "to", target);
        return gulp.src(source + "**", { "encoding": false }).pipe(gulp.dest(target));
    }
    else
    {
        console.error("FAILED to copy ops from", source, "to", target);
        done();
    }
}

function _extension_ops_copy(done)
{
    const source = path.join("./src", config.sourcePath.ops, "/extensions/");
    const target = path.join("./src", defaultConfig.path.ops, "/extensions/");
    mkdirp.sync(target);
    if (fs.existsSync(source))
    {
        console.info("copying extensions from", source, "to", target);
        return gulp.src(source + "**", { "encoding": false }).pipe(gulp.dest(target));
    }
    else
    {
        console.warn("FAILED to copy extensions from", source, "to", target);
        done();
    }
}

function _ui_copy(done)
{
    const source = path.join("./src", config.sourcePath.uiDist);
    const target = path.join("./src", defaultConfig.path.uiDist);
    mkdirp.sync(target);
    if (fs.existsSync(source))
    {
        console.info("copying ui from", source, "to", target);
        return gulp.src(source + "**", { "encoding": false }).pipe(gulp.dest(target));
    }
    else
    {
        console.error("FAILED to copy ui from", source, "to", target);
        done();
    }
}

function _editor_scripts_webpack(done)
{
    getBuildInfo((buildInfo) =>
    {
        webpack(webpackElectronConfig(isLiveBuild, buildInfo, minify, analyze), (err, stats) =>
        {
            if (err) done(err);
            if (stats.hasErrors())
            {
                done(new Error(getWebpackErrorMessage(stats)));
            }
            else
            {
                done();
            }
        });
    });
}

function getWebpackErrorMessage(stats)
{
    let errorMessage = stats.compilation.errors.join("\n");
    const errorsWarnings = stats.toJson("errors-warnings");
    if (errorsWarnings && errorsWarnings.errors)
    {
        const modules = errorsWarnings.errors.filter((e) => { return !!e.moduleIdentifier; });
        if (modules && modules.length > 0)
        {
            modules.forEach((m) =>
            {
                const parts = m.moduleIdentifier.split("|");
                const filename = parts.length > 0 ? parts[1] : m.moduleIdentifier;
                const em = m.message.split("\n");
                errorMessage = filename + ":" + m.loc + " - " + em[0] || m.message;
            });
        }
    }
    return errorMessage;
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

const defaultSeries = gulp.series(
    _editor_scripts_webpack,
);

gulp.task("build", gulp.series(
    _create_ops_dirs,
    gulp.parallel(
        defaultSeries,
        _corelibs_copy,
        _core_ops_copy,
        _extension_ops_copy,
        _libs_copy,
        _ui_copy
    ),
));

gulp.task("analyze", gulp.series(_analyze, defaultSeries));

gulp.task("watch", gulp.series(
    defaultSeries,
    gulp.parallel(
        _serve,
        _watch
    )
));
