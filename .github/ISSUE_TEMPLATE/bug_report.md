---
name: Bug report
about: Create a report to help us improve
title: ''
labels: bug, new, standalone
assignees: ''

---
**Describe the bug**
A description of what the bug is. Screenshots also help a lot!

**How To Reproduce**
1. Open Editor
2. Click on "crash" button

**Platform**
- Please tell us which version you are using and which operating system you are running.

**Dev Tools**
If possible, check the devtools of the application (`cmd or ctrl - shift - i` or `F12`) and include any messages that seem relevant.

**Logs**
If possible, start the standalone so you see terminal logs, this should work like this:

* Windows: open command prompt `cmd`, change to the directory of the downloaded executable, type `start "" cables.exe` (change name of `cables.exe` if appropriate)
* OSX: open terminal, change to the directory of the downloaded executable, type `open --stdout cables.log --stderr cables.log cables.app` (change name of `cables.app` if appropriate)
  * this will create a file `cables.log`, include this in you bugreport
* Linux: open terminal, change to the directory of the downloaded executable, type `cables.AppImage` (change name of `cables.AppImage` if appropriate)

