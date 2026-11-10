import fs from 'node:fs';

const port = process.argv[2];
const expression = fs.readFileSync(process.argv[3], 'utf8');

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('chat.deepseek.com'));
if (!page) throw new Error('page not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
socket.addEventListener('message', (event) => {
  const payload = JSON.parse(event.data);
  const entry = pending.get(payload.id);
  if (!entry) return;
  pending.delete(payload.id);
  if (payload.error) entry.reject(new Error(payload.error.message));
  else entry.resolve(payload.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const result = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
});
fs.writeFileSync(process.argv[4], JSON.stringify(result.result?.value ?? result, null, 2), 'utf8');
socket.close();
