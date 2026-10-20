# Motion graphics are Remotion compositions in packages/video

fleetfizz.com's motion graphics are React components rendered by Remotion. They live in `packages/video`, not `apps/`: the package is never deployed, it produces files the website imports to show them (`@fleetfizz/video/renders/<id>.webm` and `.mov`), the way `packages/brand-assets` produces the share image.

Every graphic sits on the page's own background, so every render is transparent. No one format carries alpha in every browser: Chrome and Firefox play VP9 WebM with alpha, and Safari plays HEVC with alpha but ignores WebM's. `pnpm video:render` writes both. Remotion cannot encode HEVC with alpha, so it renders ProRes 4444 and macOS's `avconvert` re-encodes it, which makes rendering a macOS step. Renders run on a developer's machine and are committed, like the share image; CI does not render. A graphic's colors are baked into its frames, so a graphic drawn in the site's colors is one composition per theme, and the page shows the one matching the theme.

The brand's name, copy, colors, typeface, and glyph live in `packages/brand-assets`, plain data that the website, the share image, and the motion graphics all import, so a brand change reaches all three.

## Considered Options

- **`apps/video` (rejected).** Nothing in it runs or deploys on its own; it is a dependency of the website.
- **`@remotion/player` on the page (rejected).** It would render the composition live in the browser, crisp and transparent everywhere, but it ships Remotion in the site's bundle and redraws in JavaScript on every frame.
- **Renders written into `apps/website/public` (rejected).** Importing them through the package hashes their file names, so they can be cached forever, and the website's `package.json` shows the dependency.
- **WebM only (rejected).** Safari would show the graphic on a black background.
