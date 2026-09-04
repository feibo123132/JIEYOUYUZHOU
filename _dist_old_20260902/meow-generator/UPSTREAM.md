# Meow Generator upstream record

- Repository: https://github.com/ringhyacinth/Meow-Generator
- Pinned commit: `e34483fa7c7fa105618d073444c47adffa69b070`
- Imported: 2026-08-18
- License: PolyForm Noncommercial License 1.0.0
- Required Notice: Copyright 2026 Simon_阿文 (Simon Lee) and Ring Hyacinth (海辛).

This copy is included for the confirmed noncommercial use of the host project. Commercial use is not granted by the upstream license; see `COMMERCIAL-LICENSE.md` and contact the upstream authors for separate written permission.

## Rebuild

From `vendor/meow-generator/`:

```powershell
npm ci
npm run test:share
npm run test:fish-pick
npm run test:poke
npm run test:motion
$env:VITE_PUBLIC_BASE = './'
npm run build
```

Copy the generated `dist/` contents to `public/meow-generator/`, then copy `LICENSE` and this `UPSTREAM.md` file into the same public directory.
