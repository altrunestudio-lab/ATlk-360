# ATlk-360 mono WebXR viewer

Open index.html through a web server, or go directly to webxr-mono/. The root redirects to the new viewer. Original index.htm and 3DVista assets remain unchanged.

Ten mono scenes are discovered from this export. Each scene has separately tiled right/left/top/bottom/front/back faces. tour.json selects each face's 1536-pixel level (540 source tiles total). Both eyes receive the same panorama. No stereoscopic depth is synthesized.

Desktop: drag to look around; choose Panorama to change scenes; Reset view restores the starting view.
Quest Browser: open directly over trusted HTTPS and choose Enter VR. Controller trigger advances to the next scene. Exit VR using the browser's control. Localhost on a desktop supports testing, but a plain HTTP LAN IP on the Quest does not meet WebXR secure-context requirements.

Original menus, hotspots, and other proprietary 3DVista behavior remain available through the original-tour link and are not ported into this viewer.

Checks: all ten scenes rendered locally with no missing assets, page exceptions, or WebGL errors. Simulated WebXR start, both-eye rendering, exit, and scene change passed. Actual Quest headset rendering, comfort, and performance still require a physical device test.

No upload, commit, push, or publication was performed.
