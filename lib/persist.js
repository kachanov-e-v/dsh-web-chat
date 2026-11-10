/**
 * Small durable state for the per-chat enablement.
 *
 * Only Session ids are stored, never prompts, answers, tokens, or cookies.
 * The file lives under the DSH home next to the browser profile.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function stateFile(home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')) {
  // Legacy storage directory name, kept so an existing enablement and browser
  // login survive the dsh-web-chat rename.
  return path.join(home, 'dsh-chat-model', 'sessions.json');
}

export async function loadSessions(file = stateFile()) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sessions)) return [];
    return [...new Set(parsed.sessions.filter((id) => typeof id === 'string' && id !== ''))];
  } catch {
    return [];
  }
}

export async function saveSessions(sessions, file = stateFile()) {
  const ids = sessions instanceof Map
    ? [...sessions.keys()].filter((id) => typeof id === 'string' && id !== '')
    : [];
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ sessions: [...new Set(ids)] }, null, 2), 'utf8');
  await fs.rename(temp, file);
}
