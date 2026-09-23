import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { buildElectron } from './build-electron';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCommand = process.platform === 'win32' ? 'electron.cmd' : 'electron';

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

const vite = spawn(npmCommand, ['run', 'dev:renderer'], {
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
  electron = spawn(electronCommand, ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173'
    },
    shell: process.platform === 'win32'
  });
  electron.on('exit', (code) => stop(code || 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stop(1);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
