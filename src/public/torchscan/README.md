# TorchScan Brand Assets

Brand files produced for the redesigned UI.

- `logo-mark.svg` - transparent vector mark for navigation and loading states
- `logo-horizontal.svg` - horizontal logo lockup
- `logo-horizontal.png` - cropped raster logo lockup used by the app shell
- `app-icon.svg` - SVG wrapper for the raster desktop icon
- `logo-mark.png` - cropped raster logo lockup used by navigation and loading states
- `app-icon-256.png`, `app-icon-64.png`, `app-icon-48.png`, `app-icon-32.png`, `app-icon-16.png` - desktop icon sizes generated from the current 1024px app icon source
- `icons/original/` - icon crops extracted from the provided UI design draft
- `icons/` - vector fallback functional icon set

Desktop package icons live in `src-tauri/icons/`:

- macOS: `icon.icns`
- Windows: `icon.ico`, `Square*Logo.png`, `StoreLogo.png`
- Tauri PNG set: `icon.png`, `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`
- Tray: `tray.png`, `tray@2x.png`, generated from the readable emblem area of the current desktop icon
