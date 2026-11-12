import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function findPython3(run = spawnSync, platform = process.platform) {
  const candidates = platform === 'win32'
    ? [['python', []], ['py', ['-3']], ['python3', []]]
    : [['python3', []], ['python', []]];
  for (const [command, prefix] of candidates) {
    const result = run(command, [...prefix, '-c', 'import sys; assert sys.version_info.major == 3'],
      { stdio: 'ignore', timeout: 3000, windowsHide: true });
    if (!result.error && result.status === 0) return { command, prefix };
  }
  throw new Error('Python 3 is required: install python3, python, or the Windows py launcher.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { command, prefix } = findPython3();
  const child = spawn(command, [...prefix, '-m', 'http.server', '8765', '--bind', '127.0.0.1'],
    { stdio: 'inherit', windowsHide: true });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
