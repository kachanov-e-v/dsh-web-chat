import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['en', 'ru', 'zh'];

function readJson(name) {
  return JSON.parse(readFileSync(path.join(root, 'locale', `${name}.json`), 'utf8'));
}

function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
  }
  return typeof value;
}

test('plugin metadata locales share one shape and keep meta text', () => {
  const docs = Object.fromEntries(names.map((name) => [name, readJson(name)]));
  for (const name of names) {
    assert.equal(typeof docs[name].meta.title, 'string');
    assert.equal(typeof docs[name].meta.description, 'string');
    assert.ok(docs[name].meta.title.length > 0);
    assert.ok(docs[name].meta.description.length > 0);
    assert.deepEqual(shape(docs[name]), shape(docs.en), `locale ${name} shape`);
  }
});
