import assert from 'node:assert/strict';
import test from 'node:test';
import { findPython3 } from '../scripts/serve.mjs';

test('Unix accepts a python3-only environment', () => {
  assert.equal(findPython3(command => ({ status: command === 'python3' ? 0 : 1 }), 'linux').command, 'python3');
});
test('Windows falls back to the Python launcher', () => {
  const selected = findPython3(command => ({ status: command === 'py' ? 0 : 1 }), 'win32');
  assert.deepEqual(selected, { command: 'py', prefix: ['-3'] });
});
test('failed probes and Python 2 cannot masquerade as Python 3', () => {
  assert.throws(() => findPython3(() => ({ status: 1 }), 'linux'), /Python 3 is required/);
  assert.throws(() => findPython3(() => ({ error: new Error('missing'), status: null }), 'win32'), /Python 3 is required/);
});
