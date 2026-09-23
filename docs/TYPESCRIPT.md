# TypeScript / TSX structure

The application source no longer uses `.js` or `.jsx` files.

- React renderer: `.tsx`
- Shared types: `.ts`
- Electron main/preload: `.ts`
- Vite config: `.ts`
- Development/build scripts: `.ts`

Electron cannot execute TypeScript source directly in a portable way, so `npm run dev` and `npm run build:electron` use esbuild to generate:

- `dist-electron/main.ts`
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
src/shared/types.ts
src/global.d.ts
electron/main.ts
electron/preload.ts
scripts/dev.ts
scripts/build-electron.ts
vite.config.ts
```
