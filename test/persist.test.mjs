import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadSessions, saveSessions, stateFile } from '../lib/persist.js';

test('per-chat enablement is persisted as session ids only', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dcm-persist-'));
  const file = path.join(dir, 'sessions.json');
  try {
    await saveSessions(new Map([['session-1', true], ['session-2', true]]), file);
    assert.deepEqual(await loadSessions(file), ['session-1', 'session-2']);
    const raw = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(raw, { sessions: ['session-1', 'session-2'] });

    await saveSessions(new Map([['session-2', true]]), file);
    assert.deepEqual(await loadSessions(file), ['session-2']);

    await writeFile(file, '{not json', 'utf8');
    assert.deepEqual(await loadSessions(file), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the state file lives under the DSH home next to the browser profile', () => {
  const file = stateFile('C:/dsh-home');
  assert.ok(file.endsWith(path.join('dsh-chat-model', 'sessions.json'))
    || file.endsWith('dsh-chat-model\\sessions.json')
    || file.endsWith('dsh-chat-model/sessions.json'));
});
