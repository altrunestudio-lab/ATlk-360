# ATlk-360 WebXR controls

The viewer includes 14 mono panoramas. Open index.html through a server; it redirects to webxr-mono/. Original export files and media are preserved.

## In Quest VR
- Point either controller at a menu button; the white pointer and highlighted button show the target. Pull the trigger to select.
- Previous / Next changes panorama. The list has four entries per page, with List arrows for the remaining entries.
- Exit VR ends the immersive session and returns to the normal browser viewer.
- Hide menu removes the panel. Grip brings it back in front of you; a trigger press also reopens a hidden menu.
- Scene changes fade to black, show Loading panorama and the destination name, and fade back in only after all tiles are assembled.

Desktop has Previous / Next, the scene selector, and a loading overlay. Navigation locks while a scene is changing. Load failures return to the preceding panorama with an error message.

Six tile requests may run concurrently. Current 1536-pixel cube-face source level and media remain unchanged. A 28-tile WebP size experiment saved 21.5% at quality 80 and 5.2% at quality 85; quality 90 increased size 19.8%. No WebP conversion was applied. These figures do not measure Quest decode time or verify visual equivalence.

Validation: all fourteen scenes loaded without page exceptions, missing assets, or WebGL errors. Simulated controller rays selected navigation, paged list, a direct scene jump, hide, grip reopen, and Exit VR. Simulated loading UI was visually inspected. Physical Quest usability and performance remain to be checked.

Use trusted HTTPS for physical Quest WebXR testing. Nothing published or pushed. Original 3DVista menus and hotspots remain in index.htm. The earlier apparent-scale concern is not changed by these controls.
