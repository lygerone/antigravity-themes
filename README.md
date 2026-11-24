# antigravity-themes

<p align="left">
  <strong>English</strong> | <a href="./README.zh-CN.md">简体中文</a>
</p>

A zero-dependency theme library, layout refinement pack, and instant in-app switcher for the **Antigravity** desktop app on **macOS (Apple Silicon / ARM64)**.

## Features

* **6 Curated Dual-Mode Themes (12 Light & Dark Palettes)**:
  * **`iris` (Default)**: Crisp white canvas with whisper violet sidebar / deep obsidian plum
  * **`slate`**: Cool architectural white / deep ocean slate (`#0F172A`)
  * **`mono`**: Gallery monochrome white / OLED pure black
  * **`stone`**: Warm alabaster paper / dark espresso charcoal
  * **`emerald`**: Mist-sage light / deep pine dark
  * **`midnight`**: Ice-white indigo / deep space navy
* **Native 4-Tier Ink Hierarchy & Translucent Surfaces**:
  * Precisely calibrated `--foreground` (100%), `--secondary-foreground` (~74%), `--muted-foreground` (~56%), and `--placeholder` (~42%) ink tiers — all 12 palettes pass automated **WCAG AA (`>= 4.5:1`)** contrast checks.
  * Uses subtle `4%–10%` translucent borders and interaction layers with a crisp `1px` specular top highlight (`--glass-highlight`) in dark mode, paired with per-theme syntax highlighting and diff colors.
* **Dynamic Sidebar Stage Artwork (Theme-Adaptive)**:
  * **`starlight` (Default)**: Starlit night sky gradient with soft nebula mist, sparkles, and horizon clouds
  * **`blueprint`**: Architectural grid with top scale ticks and dashed dimension lines
  * **`none`**: Clean solid header
* **`0ms` In-App Live Switcher (No Restart Required)**:
  * A single `apply` bundles all 6 dual-mode themes, 3 header backdrops, and 2 UI density modes (`compact` / `comfortable`).
  * Press **`Cmd+Option+T`** or click the **bottom-left palette button** in the sidebar to open the picker: toggle **Light / Dark / Auto** right from the header, preview themes via live wireframe thumbnails, navigate with Arrow keys & Tab focus loop, and persist preferences to `localStorage` with cross-window sync.
* **Safe, Reversible & Patch-Friendly**:
  * Zero third-party npm dependencies (Node.js `>= 20` standard library only), with a built-in pure-JS ASAR parser/rebuilder and 4MB-block SHA-256 verifier.
  * Uses isolated idempotent markers for byte-exact removal — **preserves other coexisting patches (such as localization patches) and never overwrites `app.asar.bak`**.
  * Automatically creates a versioned snapshot in `~/.antigravity-themes/backups/<version>/` on first run, syncs `Info.plist` `ElectronAsarIntegrity`, and re-signs the app with macOS Ad-hoc `codesign`.
  * Strictly preserves the built-in browser cutout transparency (`data-has-browser-hole="true"`).

## Quick Start

Quit Antigravity completely (`Cmd+Q`), then run:

```bash
# Install all 6 dual-mode themes and the in-app switcher (default: iris + starlight)
npx antigravity-themes apply

# List all available themes and header backdrops
npx antigravity-themes themes

# Customize initial default preset and backdrop
npx antigravity-themes apply --preset slate --backdrop starlight
npx antigravity-themes apply --preset mono --backdrop blueprint

# Verify ASAR block SHA-256 integrity and macOS code signature
npx antigravity-themes verify
```

Reopen Antigravity and press **`Cmd+Option+T`** (or click the bottom-left sidebar palette button) anytime to switch themes, Light / Dark / Auto mode, header artwork, and UI density instantly.

### Running From Source

```bash
git clone https://github.com/lygerone/antigravity-themes.git
cd antigravity-themes
node bin/antigravity-themes.mjs apply
node bin/antigravity-themes.mjs verify
```

### Uninstall / Restore

```bash
# Cleanly strip theme patches while keeping other coexisting patches intact
npx antigravity-themes restore

# Or restore the full pre-patch snapshot from ~/.antigravity-themes/backups/<version>/
npx antigravity-themes restore --from-backup
```

### Code Signing and Auto-Update

`apply` and `restore` re-sign `Antigravity.app` with a macOS ad-hoc signature, which replaces Google's official signature. `restore` (including `--from-backup`) only restores `app.asar` and `Info.plist`; it cannot bring the official signature back. As a result:

* The in-app auto-updater checks that a new version matches the current app's signature, so **auto-updates may fail** after patching. If that happens, download the latest version from the official site, reinstall it, and run `npx antigravity-themes apply` again.
* The only way to fully restore the official signature is to reinstall the official app.

### After Upgrading Antigravity

Upgrading replaces `/Applications/Antigravity.app`, so the theme must be re-applied. Your selected theme, Light/Dark mode, backdrop, and density are stored in the app's user-data `localStorage` and remain intact.

A patched app is ad-hoc signed, so the in-app "Restart to update" button usually never appears (the log shows `Code signature ... did not pass validation`). Upgrade manually instead:

1. **Install the official new version.** The updater has usually downloaded it to `~/Library/Caches/com.google.antigravity/pending/Antigravity.zip`; you can also download it from the official site. To confirm it is signed by Google before installing:

   ```bash
   ditto -x -k ~/Library/Caches/com.google.antigravity/pending/Antigravity.zip /tmp/agy-new
   spctl -a -vv /tmp/agy-new/Antigravity.app   # should show Notarized Developer ID / Google LLC
   ```

   Quit Antigravity completely (`Cmd+Q`) and replace `/Applications/Antigravity.app` with the new version.
2. **Reinstall other patches.** If you use other patches (e.g. a localization patch), reinstall them the way they require.
3. **Re-apply the theme.** With Antigravity still quit, run:

   ```bash
   npx antigravity-themes@latest apply
   ```

   The first apply on a new version automatically creates a snapshot in `~/.antigravity-themes/backups/<new-version>/`.

## Testing

```bash
npm test
```

## Disclaimer

This is an unofficial community theming tool and is not affiliated with or endorsed by Google Antigravity.

## License

[MIT](./LICENSE)
