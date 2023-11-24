import path from "path";
import fs from "fs";
import { mkdirp } from "mkdirp";
import { app } from "electron";

let config = null;

export function getConfig()
{
    if (!config)
    {
        const configLocation = path.join(app.getAppPath(), "/cables.json");
        if (!fs.existsSync(configLocation))
        {
            console.error("no cables.json!!");
            process.exit(1);
        }

        config = JSON.parse(fs.readFileSync(configLocation, "utf-8"));
        config.maxFileSizeMb = config.maxFileSizeMb || 256;
    }
    return config;
}

config = getConfig();

mkdirp(getAssetPath());
mkdirp(getLibsPath());
mkdirp(getCoreLibsPath());
mkdirp(getOpsPath());

if (!fs.existsSync("gen")) mkdirp.sync("gen");
if (!fs.existsSync(getUserOpsPath())) mkdirp.sync(getUserOpsPath());
if (!fs.existsSync(getTeamOpsPath())) mkdirp.sync(getTeamOpsPath());
if (!fs.existsSync(getExtensionOpsPath())) mkdirp.sync(getExtensionOpsPath());
if (!fs.existsSync(getPatchOpsPath())) mkdirp.sync(getPatchOpsPath());
if (!fs.existsSync(getOpDocsCachePath())) mkdirp.sync(getOpDocsCachePath());
if (!fs.existsSync(getOpDocsFile())) fs.writeFileSync(getOpDocsFile(), JSON.stringify({}));
if (!fs.existsSync(getOpLookupFile())) fs.writeFileSync(getOpLookupFile(), JSON.stringify({ "names": {}, "ids": {} }));

export function getOpsPath()
{
    if (!config.path.ops) logger.error("no path.ops found in cables.json!");

    return path.join(app.getAppPath(), config.path.ops);
}

export function getCoreOpsPath()
{
    return path.join(getOpsPath(), "/base/");
}

export function getUserOpsPath()
{
    if (!config.path.userops) return path.join(getOpsPath(), "/users/");
    return config.path.userops.startsWith("/") ? config.path.userops : path.join(app.getAppPath(), config.path.userops);
}

export function getPatchOpsPath()
{
    if (!config.path.patchops) return path.join(getOpsPath(), "/patches/");
    return config.path.patchops.startsWith("/") ? config.path.patchops : path.join(app.getAppPath(), config.path.patchops);
}

export function getTeamOpsPath()
{
    if (!config.path.teamops) return path.join(getOpsPath(), "/teams/");
    return config.path.teamops.startsWith("/") ? config.path.teamops : path.join(app.getAppPath(), config.path.teamops);
}

export function getExtensionOpsPath()
{
    if (!config.path.extensionops) return path.join(getOpsPath(), "/extensions/");
    return config.path.extensionops.startsWith("/") ? config.path.extensionops : path.join(app.getAppPath(), config.path.extensionops);
}

export function getOpDocsFile()
{
    return getGenPath() + "opdocs.json";
}

export function getOpLookupFile()
{
    return getGenPath() + "oplookup.json";
}

export function getOpDocsCachePath()
{
    return path.join(getGenPath(), "opdocs_collections/");
}

function getGenPath()
{
    return path.join(app.getAppPath(), "/gen/");
}

export function getLibsPath()
{
    if (!config.path.libs) logger.error("no path.libs found in cables.json!");
    return path.join(app.getAppPath(), config.path.libs);
}

export function getCoreLibsPath()
{
    if (!config.path.corelibs) logger.error("no path.corelibs found in cables.json!");
    return path.join(app.getAppPath(), config.path.corelibs);
}

function getAssetPath()
{
    let dirName = path.join(app.getAppPath(), config.path.assets);
    if (config.path.assets.startsWith("/")) dirName = config.path.assets;
    return dirName;
}

export function getPatchesPath()
{
    return path.join(app.getAppPath(), "/patches/");
}

export function isDevEnv()
{
    return config.env === "dev";
}
