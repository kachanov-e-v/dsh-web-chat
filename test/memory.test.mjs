import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  loadProjectMemory,
  MEMORY_FILE,
  MEMORY_TEMPLATE,
} from '../lib/memory.js';

function createCtx(dir) {
  const agent = { id: 'session-1' };
  return {
    get(name) {
      if (name === 'agents') {
        return { get: (id) => (id === agent.id ? agent : undefined) };
      }
      if (name === 'workingDirectory') {
        return { ensure: async () => dir };
      }
      return undefined;
    },
  };
}

test('project memory is created once, read back, and ignores a missing session', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dcm-memory-'));
  try {
    const ctx = createCtx(dir);
    const first = await loadProjectMemory({ ctx, sessionId: 'session-1' });
    assert.equal(first, MEMORY_TEMPLATE);
    const file = path.join(dir, MEMORY_FILE);
    assert.equal(await readFile(file, 'utf8'), MEMORY_TEMPLATE);

    await writeFile(file, '# Updated memory', 'utf8');
    const updated = await loadProjectMemory({ ctx, sessionId: 'session-1' });
    assert.equal(updated, '# Updated memory');

    assert.equal(await loadProjectMemory({ ctx, sessionId: 'missing' }), '');
    assert.equal(await loadProjectMemory({ ctx: undefined, sessionId: 'session-1' }), '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
