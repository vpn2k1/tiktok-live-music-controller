# TypeScript / TSX structure

The application source no longer uses `.js` or `.jsx` files.

- React renderer: `.tsx`
- Shared types: `.ts`
- Electron main/preload: `.ts`
- Vite config: `.ts`
- Development/build scripts: `.ts`

Electron cannot execute TypeScript source directly in a portable way, so `npm run dev` and `npm run build:electron` use esbuild to generate:

- `dist-electron/main.mjs`
- `dist-electron/preload.cjs`

Those files are build output only. Do not edit them by hand.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Main source files

```text
src/App.tsx
src/main.tsx
src/components/Panel.tsx
src/components/Toggle.tsx
src/components/OverlayPreview.tsx
src/components/GameParts.tsx
src/components/OverlayPanel.tsx
src/components/FeaturesPanel.tsx
src/game/engine.ts
src/game/types.ts
src/game/registry.ts
src/game/useLiveGames.ts
src/game/features.ts
src/game/words.ts
src/game/english.ts
src/game/content/english.ts
src/game/games/*.ts
src/hooks/useNow.ts
src/hooks/useWelcomeAlerts.ts
src/overlay/main.tsx
src/overlay/Overlay.tsx
src/shared/types.ts
src/shared/overlay.ts
src/global.d.ts
electron/main.ts
electron/overlay-server.ts
electron/preload.ts
scripts/dev.ts
scripts/build-electron.ts
vite.config.ts
```
