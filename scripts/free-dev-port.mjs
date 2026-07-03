/**
 * Free local dev ports before starting (Windows-friendly).
 * Usage: node scripts/free-dev-port.mjs 8787 3001 3002
 */
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const ports = process.argv.slice(2);
if (ports.length === 0) ports.push('8787');

function freePortWin(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[free-dev-port] Stopped PID ${pid} on :${port}`);
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* nothing listening */
  }
}

function freePortUnix(port) {
  try {
    execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: 'ignore', shell: true });
    console.log(`[free-dev-port] Freed :${port}`);
  } catch {
    /* nothing listening */
  }
}

for (const port of ports) {
  if (platform() === 'win32') freePortWin(port);
  else freePortUnix(port);
}
