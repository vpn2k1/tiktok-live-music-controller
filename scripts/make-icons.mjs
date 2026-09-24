// Renders build/icon.svg into the app icons electron-builder uses:
//   build/icon.png  (1024², Linux + fallback)
//   build/icon.icns (macOS, needs `iconutil`, i.e. run on a Mac)
//   build/icon.ico  (Windows, 16–256 px)
// Run with `npm run icons` (Electron renders the SVG, so it looks the same as in the app).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, nativeImage } from 'electron';

const buildDir = path.join(process.cwd(), 'build');
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');

/** macOS icons keep Apple's margin; Windows/Linux icons crop it so the plate fills the tile. */
const MAC_VIEWBOX = '0 0 1024 1024';
const TIGHT_VIEWBOX = '86 86 864 864';

async function render(win, viewBox, size) {
  const source = svg.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`).replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
  const html = `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${source}</body></html>`;
  win.setContentSize(size, size);
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  return image.getSize().width === size ? image : image.resize({ width: size, height: size, quality: 'best' });
}

/** ICO file with PNG-compressed entries (supported since Windows Vista). */
function writeIco(file, pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  fs.writeFileSync(file, Buffer.concat([header, ...pngs.map((png) => png.data)]));
}

app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.setZoomFactor(1);

  const png = await render(win, TIGHT_VIEWBOX, 1024);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png.toPNG());

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoImages = [];
  for (const size of icoSizes) icoImages.push({ size, data: (await render(win, TIGHT_VIEWBOX, size)).toPNG() });
  writeIco(path.join(buildDir, 'icon.ico'), icoImages);

  if (process.platform === 'darwin') {
    const iconset = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-')) + '.iconset';
    fs.mkdirSync(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      fs.writeFileSync(path.join(iconset, `icon_${size}x${size}.png`), (await render(win, MAC_VIEWBOX, size)).toPNG());
      fs.writeFileSync(path.join(iconset, `icon_${size}x${size}@2x.png`), (await render(win, MAC_VIEWBOX, size * 2)).toPNG());
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')]);
    fs.rmSync(iconset, { recursive: true, force: true });
  } else {
    console.log('Skipped icon.icns (needs macOS iconutil); the existing file is kept.');
  }

  console.log('Icons written to', buildDir);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
