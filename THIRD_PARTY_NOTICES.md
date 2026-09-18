# Third-party components

This project is an independent community tool, not an official ATK or OpenAI product.
No ATK executable or ATK-distributed native binary is bundled.

## Product reference imagery

The local UI includes unmodified product imagery for identification and visual reference. These images retain their respective owners' rights and are not covered by this project's MIT license. Inclusion does not imply endorsement or a grant of redistribution rights.

- `ui/assets/yogo-pro-front.png`: ATK, YOGO 75 Pro Yellow front view. https://www.atk.store/cdn/shop/files/YOGO_75_PRO-_e5dbc1.png?v=1779783079&width=1600
- `ui/assets/yogo-pro-controls.png`: ATK, CNC case/control detail (silver). https://www.atk.store/cdn/shop/files/CNC_b7216704-9049-4187-86aa-2886583719e1.png?v=1765788414&width=800
- `ui/assets/yogo-pro-underside.jpg`: HLPLANET / Snimtas, YOGO 75 Pro black underside photograph. https://www.hlplanet.com/atk-yogo-75-pro-review/ (image: https://www.hlplanet.com/wp-content/uploads/2026/07/IMG_7283.jpg)

The interactive 3D model is a visual reconstruction from these references, not measured CAD. Screen and key lighting are simulations. Product photographs remain as identification references and a rendering fallback.

- node-hid 3.4.0: https://github.com/node-hid/node-hid — MIT OR X11. The installed package retains its upstream license notices, including native HID dependencies.
- node-gyp-build and any dependency notices remain in node_modules in the installed distribution; exact versions and integrity digests are recorded in package-lock.json.
- Bundled runtime: Node.js 24.14.0, from https://nodejs.org/dist/v24.14.0/ . The upstream LICENSE file is retained in runtime/LICENSE and includes third-party notices.

The local transcript-watching approach was informed by https://github.com/hatayama/codex-hooks . This package does not bundle that project's implementation. Event semantics were checked against the OpenAI Codex protocol source. Transcript formats are not stable public APIs.

## 3D renderer

Three.js 0.186.0 (MIT), bundled locally in ui/viewer.js. Upstream license retained in ui/THREE-LICENSE.txt. https://github.com/mrdoob/three.js

Camera-controls 3.1.2 (MIT), bundled locally. License: ui/CAMERA-CONTROLS-LICENSE.txt. https://github.com/yomotsu/camera-controls

## Desktop runtime

Electron 44.4.1 (MIT): https://github.com/electron/electron . Desktop builds retain its original license in runtime/licenses/ELECTRON-LICENSE.txt and the bundled Chromium and third-party notices in runtime/licenses/CHROMIUM-LICENSES.html. These notices supplement this project's MIT license. The bundled official Node.js runtime retains its own LICENSE and third-party notices in runtime/LICENSE.

The project owner has confirmed permission to include the product reference images in this distribution. Their original ownership and attribution above remain unchanged; they are not relicensed under MIT by this project.
