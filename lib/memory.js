/**
 * Project memory for the DeepSeek browser model.
 *
 * The model itself writes PROJECT_MEMORY.md through the normal DSH tools.
 * This module only creates the skeleton on first use and loads the current
 * text into the browser prompt so long chats keep a stable project brief.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export const MEMORY_FILE = 'PROJECT_MEMORY.md';
export const MAX_MEMORY_CHARS = 16000;

export const MEMORY_TEMPLATE = [
  '# Project Memory',
  '',
  '_Maintained by the DeepSeek browser model. Keep it short and factual._',
  '',
  '## Goal',
  '',
  '## Stack',
  '',
  '## Structure',
  '',
  '## Decisions',
  '',
  '## Current state',
  '',
  '## Next steps',
  '',
  '## Commands',
  '',
].join('\n');

async function resolveCwd(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined;
  let agents;
  let workingDirectory;
  try {
    agents = ctx.get('agents');
    workingDirectory = ctx.get('workingDirectory');
  } catch {
    return undefined;
  }
  if (agents === undefined || workingDirectory === undefined) return undefined;
  const agent = typeof agents.get === 'function' ? agents.get(sessionId) : undefined;
  if (agent === undefined) return undefined;
  try {
    if (typeof workingDirectory.ensure === 'function') return await workingDirectory.ensure(agent);
    if (typeof workingDirectory.get === 'function') return workingDirectory.get(agent);
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Read PROJECT_MEMORY.md from the session workspace. When the file is absent,
 * create the skeleton once so the model has a place to record decisions.
 * Returns '' when the workspace or session is unavailable.
 */
export async function loadProjectMemory(options) {
  const { ctx, sessionId } = options ?? {};
  if (ctx === undefined) return '';
  const cwd = await resolveCwd(ctx, sessionId);
  if (cwd === undefined || cwd === '') return '';
  const file = path.join(cwd, MEMORY_FILE);
  try {
    const text = await fs.readFile(file, 'utf8');
    return text.slice(0, MAX_MEMORY_CHARS);
  } catch (error) {
    if (error?.code !== 'ENOENT') return '';
  }
  try {
    await fs.writeFile(file, MEMORY_TEMPLATE, { encoding: 'utf8', flag: 'wx' });
    return MEMORY_TEMPLATE;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      try {
        return (await fs.readFile(file, 'utf8')).slice(0, MAX_MEMORY_CHARS);
      } catch {
        return '';
      }
    }
    return '';
  }
}
