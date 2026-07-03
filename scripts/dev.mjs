/**
 * Start local dev: worker first (wait for health), then web.
 * Avoids racing on :8787 and makes worker status obvious in the terminal.
 */
import { spawn, execSync } from 'node:child_process';

const isWin = process.platform === 'win32';

function runShell(command) {
  return spawn(command, [], { stdio: 'inherit', shell: true });
}

console.log('\n[dev] Freeing ports 8787, 3002…');
execSync('node scripts/free-dev-port.mjs 8787 3002', { stdio: 'inherit' });

console.log('[dev] Starting worker (wrangler on :8787)…\n');
const worker = runShell('npm run dev --workspace=@stream-realm/worker');

let rest;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  worker.kill();
  rest?.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

worker.on('exit', (code) => {
  if (shuttingDown) return;
  console.error(`\n[dev] Worker exited (${code ?? 1}). Stopping web.`);
  shutdown(code ?? 1);
});

try {
  execSync('npx wait-on http-get://127.0.0.1:8787/api/health -t 120000', { stdio: 'inherit' });
} catch {
  console.error('\n[dev] Worker health check timed out after 120s.');
  console.error('[dev] Run `npm run dev:worker` alone to see the wrangler error.');
  shutdown(1);
}

console.log('\n[dev] ✓ Worker ready on http://127.0.0.1:8787');
console.log('[dev] Starting web (:3002)…\n');

rest = runShell('npm run dev --workspace=web');

rest.on('exit', (code) => shutdown(code ?? 0));
