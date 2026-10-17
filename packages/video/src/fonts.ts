import { FONT } from "@fleetfizz/brand-assets";
import { loadFont } from "@remotion/fonts";
import url from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2";

// The brand's typeface, registered under its family name. loadFont holds
// every frame until the file has loaded, so no frame renders in a fallback.
void loadFont({ family: FONT, url, weight: "100 800" });
