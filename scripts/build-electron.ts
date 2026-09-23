import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

export async function buildElectron(): Promise<void> {
  await Promise.all([
    build({
      entryPoints: [path.join(root, 'electron/main.ts')],
      outfile: path.join(root, 'dist-electron/main.mjs'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      sourcemap: true,
      external: ['electron', 'tiktok-live-connector']
    }),
    build({
      entryPoints: [path.join(root, 'electron/preload.ts')],
      outfile: path.join(root, 'dist-electron/preload.cjs'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      sourcemap: true,
      external: ['electron']
    })
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildElectron();
}
