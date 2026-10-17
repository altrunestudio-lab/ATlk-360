# ATlk-360 WebXR viewer

The root index.html is a new standalone WebXR viewer for Scene 19. It reuses the original twelve stereo cube faces directly from media/. Original 3DVista index.htm, script.js, and assets are unchanged. Open index.htm to use the original tour and its menus. Those proprietary menus, SCORM tracking, and other tour effects are not ported into the new viewer.

## Local preview
Serve the repository using a static HTTP server; open /ATlk-360/ when its parent is served. Desktop localhost is allowed for WebXR. Opening index.html as a file is not a supported test.

## Quest 3S
Open the viewer directly in Quest Browser over HTTPS. Click Enter VR and accept the browser prompt. This local change has not been published. Plain HTTP to a computer's LAN IP does not qualify as a secure WebXR context; use a trusted HTTPS development endpoint or an approved HTTPS host for headset testing.

The renderer requests immersive-vr, renders each XRView using its projection and orientation, and assigns the first six source faces to the left eye and the next six to the right eye. Translation is intentionally excluded from the panorama projection. This is a fixed-position 360 capture, not a walkable 3D model. A controller trigger recenters horizontal orientation. Reset view and Swap stereo eyes are available before entering VR. End the session through the browser's VR exit control.

## Source quality and stereo
Each cube face in this clone is only 512 x 512. This limits headset sharpness. Higher-resolution original stereo panoramas are needed for an improvement in detail. Both eye groups use source order right, left, top, bottom, front, back. Eye order and depth comfort must be confirmed on the physical headset; if depth appears reversed, exit VR, select Swap stereo eyes, and re-enter.

## Validation
Local browser rendering, all twelve face loads, drag, reset, WebGL errors, and simulated WebXR session start / two-eye rendering / exit are checked during development. Simulation does not verify actual headset display, optical stereo correctness, browser consent, or device performance. A Quest 3S test remains required.

No external JavaScript dependencies, CDN, build step, or server logic are needed. Relative paths support GitHub Pages project subfolders. No files were pushed or published.
