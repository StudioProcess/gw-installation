## Gravitational Waves Installation

Based on [sos-illus/ligo](https://github.com/StudioProcess/sos-illus/tree/master/ligo)

### NPM scripts

* `start`: Runs a dev server on `http://localhost:8080`
* `build`: Creates a signed build at `dist/` (Also signs dev files)

### Digital Signature

**Scripts**
* [sign/sign_node.mjs](sign/sign_node.mjs)
* [sign/verify_node.mjs](sign/verify_node.mjs)

**Keys**
* sign/private_key.pem
* sign/public_key.pem

**verify.process.studio**
* Located at [verify/](verify/)

### Forcing device-specific rendering

* `#installation` (or `#inst`, `#hires`): 2160p60
* `#desktop`: 1080p60
* `#mobile`: 720p30

The last used option is remembered. To revert back to auto-detect:
* `#clear`, `#default`, `#reset`, `#auto`

### Hotkeys

See [app/main.js](app/main.js#L25)
