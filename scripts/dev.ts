import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { buildElectron } from './build-electron';

// Run Vite and Electron directly (no npm.cmd / electron.cmd): Node refuses to
// spawn .cmd files without a shell on Windows, and this works the same on macOS.
const require = createRequire(import.meta.url);
/** In Node, the `electron` package exports the path of the Electron binary. */
const electronPath = require('electron') as string;
const viteBin = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');

function waitForPort(port: number, host = '127.0.0.1', timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Vite did not start on ${host}:${port}`));
        } else {
          setTimeout(attempt, 150);
        }
      });
    };
    attempt();
  });
}

await buildElectron();

const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5173'], {
  stdio: 'inherit',
  env: process.env
});

let electron: ChildProcess | null = null;
let stopping = false;

function stop(code = 0): void {
  if (stopping) return;
  stopping = true;
  electron?.kill('SIGTERM');
  vite.kill('SIGTERM');
  setTimeout(() => process.exit(code), 100);
}

vite.on('exit', (code) => {
  if (!stopping) stop(code || 0);
});

try {
  await waitForPort(5173);
  electron = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173'
    }
  });
  electron.on('exit', (code) => stop(code || 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stop(1);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
