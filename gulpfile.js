import gulp from "gulp";
import fs from "fs";
import path from "path/posix";
import mkdirp from "mkdirp";
import webpack from "webpack";
import git from "git-last-commit";
import { execa } from "execa";
import { fileURLToPath } from "url";
import jsonfile from "jsonfile";
import webpackElectronConfig from "./webpack.electron.config.js";
import helper from "./src/utils/buildhelper_util.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
let config = helper.rebuildCablesJson(__dirname, process.env.npm_config_apiconfig, "../gen/electron/");
let distConfig = helper.rebuildCablesJson(__dirname, "dist", "./dist/", "cables.json");

let analyze = false;
const isLiveBuild = config.env === "electron";
const minify = config.hasOwnProperty("minifyJs") ? config.minifyJs : false;

const watchers = [];
function _watch(done)
{
    const watchOptions = { "ignored": (file) =>
    {
        const basename = path.basename(file);
        return file.includes("/node_modules/") || basename.startsWith(".");
    } };
    watchers.push(gulp.watch(["src_client/**/*.js", "../shared/shared_constants.json", "../shared/client/**/*.js"], watchOptions, gulp.series(defaultSeries)));
    watchers.push(gulp.watch(["src/**/*.js", "../shared/api/**/*.js"], watchOptions, gulp.series(electronChanges)));
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
    let args = process.argv.slice(3);
    execa(
        "electron",
        [".", ...args],
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
    const opsPath = path.join("./src", config.path.ops);
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
    const source = path.join("./src", distConfig.sourcePath.libs);
    const target = path.join("./src", distConfig.path.libs);
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
    const source = path.join("./src", distConfig.sourcePath.corelibs);
    const target = path.join("./src", distConfig.path.corelibs);
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
    const source = path.join("./src", distConfig.sourcePath.ops, "/base/");
    const target = path.join("./src", distConfig.path.ops, "/base/");
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
    const source = path.join("./src", distConfig.sourcePath.ops, "/extensions/");
    const target = path.join("./src", distConfig.path.ops, "/extensions/");
    mkdirp.sync(target);
    if (fs.existsSync(source))
    {
        const extensionGlobs = [];
        const allExtensions = fs.readdirSync(source);
        allExtensions.forEach((extension) =>
        {
            if (extension.startsWith("Ops."))
            {
                const configFile = path.join(source, extension, extension + ".json");
                if (fs.existsSync(configFile))
                {
                    try
                    {
                        const extensionConfig = jsonfile.readFileSync(configFile);
                        if (extensionConfig.visibility !== "private")
                        {
                            extensionGlobs.push(path.join(source, extension, "**"));
                        }
                    }
                    catch (e)
                    {
                        console.warn("FAILED to parse extension config", configFile, "treating as public extension");
                        extensionGlobs.push(path.join(source, extension, "**"));
                    }
                }
                else
                {
                    extensionGlobs.push(path.join(source, extension, "**"));
                }
            }
        });
        console.info("copying public/unlisted extensions from", source, "to", target);
        return gulp.src(extensionGlobs, { "encoding": false, "base": source }).pipe(gulp.dest(target));
    }
    else
    {
        console.warn("FAILED to copy extensions from", source, "to", target);
        done();
    }
}

function _ui_copy(done)
{
    const source = path.join("./src", distConfig.sourcePath.uiDist);
    const target = path.join("./src", distConfig.path.uiDist);
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
        webpack(webpackElectronConfig(isLiveBuild, buildInfo, minify, analyze, config.sourceMap), (err, stats) =>
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
