# Cables Standalone Version

[cables.gl](https://cables.gl) and [cables standalone](https://cables.gl/downloads) are mainly developed by [undev](https://undev.studio/),
with contributions by the [cables community](https://discord.gg/cablesgl) and support by [various other parties and projects](https://cables.gl/credits).

## Early-Access

This is an early-access version of [cables.gl](https://cables.gl) core and editor part, packaged into an electron
executable for mac/windows/linux.

***This is under heavy development, things may (and will) break, use it at your own peril. Please provide feedback in
the issue tracker attached to this repository.***

## Download

mac/win/linux: [cables standalone](https://cables.gl/downloads)

### Mac

[Download](https://cables.gl/downloads) the latest version for mac (`.mac-arm64.dmg` for `m1/m2` or `.mac-x64.dmg` for `intel macs`).
Open the `.dmg`, drag the icon to your applications folder or any other place you want and start it. Acknowledge that this software has been
downloaded form the internet (the executable is signed and notarized, though) and start patching!

### Win
[Download](https://cables.gl/downloads) the latest version for windows (`-win.zip ` for a portable executable).
Unpack the software and run it. You might need to acknowledge that this software is not signed and select "more info" and/or "run anyhow" on
the shown dialog. Once that is done, start patching!

### Linux
[Download](https://cables.gl/downloads) the latest version for linux (`linux.AppImage`).
Once you downloaded the package, set its permissions to executable via your file-manager or using the terminal (`chmod +x ...AppImage`).
Open the AppImage and start patching!

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

- create an issue, pick "Bug report" or "Feature Request" from the templates
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

### Local Build

- set up your local environment (see above)
- change to `cables_electron` directory (`cd cables_electron`)
- run `npm install --no-save`
- run `npm run build` to build the standalone version
- run `npm run start` to start the standalone from the checked out sources

### Local Development

- set up your local environment (see above)
- change to `cables_electron` directory (`cd cables_electron`)
- run `npm install --no-save`
- run `npm run build`
- use `npm run start` to start the app
    - this will start watchers for changes in client-side javascript dirs (e.g. `src_client` and `../shared/client/`
    - when making changes to files in these directories, a reload of the electron app is enough to see the changes (Cmd/Ctrl+R)
- if you want to develop on ops and/or the ui, change to cables_dev (`cd ..`) and run `npm run start:standalone`
    - this will create watchers on files in `cables` and `cables_ui` that trigger a rebuild on change
    - when making changes to files in these directories, a reload of the electron app is enough to see the changes (Cmd/Ctrl+R)

### Building an executable

- take the steps that are described in "Local Build" above
- use `npm run pack` or `npm run dist` (will try to sign the exe)  - add `:mac`, `:win`, `:linux` to only build one architecture
- find the executable in `dist/`

## Appreciation

Thanks to the [cables community](https://discord.gg/cablesgl) and our [supporters](https://cables.gl/credits) for making this possible. If you like this project, think about supporting it on [patreon](https://www.patreon.com/cables_gl).

This project was partly funded through the [NGI0 Entrust Fund](https://nlnet.nl/entrust/), a fund established by [NLnet](https://nlnet.nl/) with financial support
from the European Commission's [Next Generation Internet](https://www.ngi.eu/) programme, under the aegis of [DG Communications Networks](https://commission.europa.eu/about-european-commission/departments-and-executive-agencies/communications-networks-content-and-technology_en),
Content and Technology under grant agreement No 101069594. Navigate projects
