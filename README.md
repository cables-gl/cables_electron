# Cables Standalone Version

[cables.gl](https://cables.gl) and [cables standalone](https://cables.gl/standalone) are mainly developed by [undev](https://undev.studio/),
with contributions by the [cables community](https://discord.gg/cablesgl) and support by [various other parties and projects](https://cables.gl/support).

## In Development

This is the development version of [cables.gl](https://cables.gl) packages into a standalone, executable application using electron for mac/windows/linux.

***This is under heavy development, things may (and will) break, use it at your own peril. Please provide feedback in
the issue tracker attached to this repository.***

## Download

mac/win/linux: [cables standalone](https://cables.gl/standalone)

### Mac

[Download](https://cables.gl/standalone) the latest version for mac (`m1/m2` or `intel macs`).
Open the `.dmg`, drag the icon to your applications folder or any other place you want and start it. Acknowledge that this software has been
downloaded form the internet (the executable is signed and notarized, though) and start patching!

### Win
[Download](https://cables.gl/standalone) the latest version for windows (portable executable).
Unpack the software and run it. You might need to acknowledge that this software is not signed and select "more info" and/or "run anyhow" on
the shown dialog. Once that is done, start patching!

### Linux
[Download](https://cables.gl/standalone) the latest version for linux (AppImage).
Once you downloaded the package, set its permissions to executable via your file-manager or using the terminal (`chmod +x ...AppImage`).
Open the AppImage and start patching!

#### Ubuntu > 24.04

Make sure you download and run at least version >= 0.5.15 of cables to workaround any issued with `libfuse2`.

If you run  into permission errors like `FATAL:setuid_sandbox_host.cc`, run cables from the terminal with the `--no-sandbox` option.
You can read up on why and other workarounds [here](https://github.com/ivan-hc/AM/blob/main/docs/troubleshooting.md#ubuntu-mess).

## Command-Line Arguments

- `--fullscreen` open editor in fullscreen window on start
- `--maximize-renderer` maximize the renderer to window size on start

## Builds

release version: [![release build](https://github.com/cables-gl/cables_electron/actions/workflows/release.yml/badge.svg)](https://github.com/cables-gl/cables_electron/tags)

dev version: [![dev build](https://github.com/cables-gl/cables_electron/actions/workflows/dev.yml/badge.svg)](https://github.com/cables-gl/cables_electron/releases)

nightly builds: [![nightly build](https://github.com/cables-gl/cables_electron/actions/workflows/nightly.yml/badge.svg)](https://github.com/cables-gl/cables_electron/releases?q=nightly)

## About

Cables Standalone uses Electron to bring the cables editor and ops to your desktop. For this it uses [Electron](https://www.electronjs.org/) to keep up
to date with the features in the browser version. As your browser is "sandboxed" different security measures apply,
this is no longer the case in the standalone version. This is intentional and gives great power, but also some responsibility
is now shifted to the user-site. Read about some of the implication on the [Electron site](https://www.electronjs.org/docs/latest/tutorial/security).

### IMPORTANT:

The current electron settings, as of now, are almost exactly the opposite that electron suggests. This might change for later versions,
or be configurable. But a lot of these suggestions only make sense for "static" apps that do not run or execute external code, this - on
the other hand - is THE main reason we do this. For now: KNOW THE PEOPLE YOU GET YOUR OPS OR PATCHES FROM!

```javascript
this.editorWindow = new BrowserWindow({
    "width": 1920,
    "height": 1080,
    "webPreferences": {
        "nodeIntegration": true,
        "nodeIntegrationInWorker": true,
        "nodeIntegrationInSubFrames": true,
        "contextIsolation": false,
        "sandbox": false,
        "webSecurity": false,
        "allowRunningInsecureContent": true,
        "plugins": true,
        "experimentalFeatures": true,
        "v8CacheOptions": "none"
    }
});
```

## Giving Feedback

### Issue Workflow

- create an [issue](https://github.com/cables-gl/cables_docs/issues), pick "Bug report" or "Feature Request" from the templates
- the issue will be assigned a "new" label
- we will check on these issues regularly, add them to a milestone and remove the "new" label
- once we added the feature or fixed the bug in any release (also dev/nightly) we will close the issue
- stable releases will have a changelog with all the closed issues

## Development

### Set up local environment

* the preferred way of developing cables locally is using the `cables_dev` repository: https://github.com/cables-gl/cables_dev
* that repo contains scripts that will set up everything for you to get started
* Read up about setting up everything for you to start contributing to cables in the section on ["Developing Cables"](https://cables.gl/docs/6_1_developing_cables/developing_cables)
  of the official cables documentation.

## Appreciation

Thanks to the [cables community](https://discord.gg/cablesgl) and our [supporters](https://cables.gl/support) for making this possible. If you like this project, think about [supporting it](https://cables.gl/support).

This project was partly funded through the [NGI0 Entrust Fund](https://nlnet.nl/entrust/), a fund established by [NLnet](https://nlnet.nl/) with financial support
from the European Commission's [Next Generation Internet](https://www.ngi.eu/) programme, under the aegis of [DG Communications Networks](https://commission.europa.eu/about-european-commission/departments-and-executive-agencies/communications-networks-content-and-technology_en),
Content and Technology under grant agreement No 101069594.
