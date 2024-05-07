# Cables Standalone Version

[![dev build](https://github.com/cables-gl/cables_electron/actions/workflows/dev.yml/badge.svg)](https://github.com/cables-gl/cables_electron/actions/workflows/dev.yml)

This is an early-access version of [cables.gl](https://cables.gl) core and editor part, packaged into an electron
executable for mac/windows/linux.

***This is under heavy development, things may (and will break), use it at your own peril. Please provide feedback in
the issue tracker attached to this repository.***

## Issue Workflow

- create an issue, pick "Bug report" or "Feature Request" from the templates
- the issue will be assigned a "new" label
- we will check on these issues regularily, add them to a milestone and remove the "new" label
- once we added the feature or fixed the bug in any release (also dev/nighty) we will close the issue
- stable releases will have a changelog with all the closed issues

## Local Build

- check out this repository
- run `npm install`
- run `npm run deps` to fetch cables dependencies (shared code, cables ops, ui)
- run `npm run build` to build the standalone version
- run `npm run start` to start the standalone from the checked out sources

## Local Development

- take the steps that are described in "Local Build" above
- use `npm run build` and/op `npm run build:sources` to rebuild with your changes
- restart the standalone

## Building an executable

- take the steps that are described in "Local Build" above
- use `npm run pack` or `npm run dist` (will try to sign the exe)  - add `:mac`, `:win`, `:linux` to only build one architecture
- find the executable in `dist/`

## Appreciation

This project was funded through the [NGI0 Entrust Fund](https://nlnet.nl/entrust/), a fund established by [NLnet](https://nlnet.nl/) with financial support
from the European Commission's [Next Generation Internet](https://www.ngi.eu/) programme, under the aegis of [DG Communications Networks](https://commission.europa.eu/about-european-commission/departments-and-executive-agencies/communications-networks-content-and-technology_en),
Content and Technology under grant agreement No 101069594. Navigate projects
