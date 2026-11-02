import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server/local.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.once('error', error => { console.error(error.message); stop(1); });
  child.once('exit', code => stop(code ?? 0));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
