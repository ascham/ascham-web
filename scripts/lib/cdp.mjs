// Headless Chrome over the DevTools protocol. Dev tooling only, never shipped.
// Node 20 needs `--experimental-websocket` for the global WebSocket.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { portFree, live } from './port.mjs';

const CHROME = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One command on its own connection; rejects after 5 s without an answer.
const ask = (url, method) => new Promise((resolve, reject) => {
  const w = new WebSocket(url);
  const t = setTimeout(() => { w.close(); reject(new Error(`${method}: no answer`)); }, 5000);
  w.onerror = () => { clearTimeout(t); reject(new Error(`${method}: no connection`)); };
  w.onopen = () => w.send(JSON.stringify({ id: 1, method }));
  w.onmessage = (m) => {
    clearTimeout(t); w.close();
    const d = JSON.parse(m.data);
    if (d.error) reject(new Error(`${method}: ${d.error.message}`)); else resolve(d.result);
  };
});

// A throwaway profile, so nothing of the user's own browser is involved.
// This launch's own browser or none: a leftover browser on the port would
// answer instead, and every check would drive it.
export async function launchChrome({ port = 9333, args = [] } = {}) {
  if (!(await portFree(port))) throw new Error(`BROKEN: port ${port} is taken; a leftover browser?`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ascham-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    ...args, 'about:blank'], { stdio: 'ignore' });
  let gone = false;
  const exited = new Promise((r) => { proc.on('exit', r); proc.on('error', r); }).then(() => { gone = true; });
  const stop = async () => {
    live.delete(stop);
    if (!gone) { proc.kill(); await exited; }
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {});
  };
  live.add(stop);
  const fail = async (why) => { await stop(); throw new Error(`BROKEN: ${why}`); };
  let targets, browser;
  for (let i = 0; i < 100 && !targets && !gone; i++) {
    try {
      browser = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    } catch { await sleep(100); }
  }
  if (!targets) return fail(`chrome (${CHROME}) did not start on port ${port}`);
  // The browser target, not a page, knows its own process id.
  const own = await ask(browser, 'SystemInfo.getProcessInfo')
    .then((r) => r.processInfo.find((p) => p.type === 'browser')?.id, () => null);
  if (own !== proc.pid) return fail(`the browser on port ${port} is not the one just started`);
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; })
    .catch(() => fail(`chrome on port ${port} refused its page's connection`));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method) for (const l of listeners) l(d);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  // Evaluate an expression in the page's main world; returns its value.
  const evaluate = async (expression, { gesture = false } = {}) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true,
      returnByValue: true, userGesture: gesture });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const navigate = async (url, settle = 1500) => {
    await send('Page.enable');
    const loaded = new Promise((r) => listeners.push((e) => e.method === 'Page.loadEventFired' && r()));
    await send('Page.navigate', { url });
    await Promise.race([loaded, sleep(30000)]);
    await sleep(settle);
  };
  const close = async () => {
    try { ws.close(); } catch {}
    await stop();
  };
  const version = await send('Browser.getVersion').then((r) => r.product,
    (e) => { try { ws.close(); } catch {} return fail(`chrome on port ${port}: ${e.message}`); });
  return { send, evaluate, navigate, close, on: (f) => listeners.push(f), version };
}
