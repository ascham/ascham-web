// Headless Firefox over Marionette (length-prefixed JSON on TCP). Dev tooling
// only, never shipped. Chrome-context scripts need --remote-allow-system-access.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { portFree, live } from './port.mjs';

const FIREFOX = process.env.FIREFOX_BIN || '/usr/bin/firefox-esr';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `prefs` adds profile preferences, as { name: value }.
// This launch's own browser or none: a leftover browser on the port would
// answer instead, and every check would drive it.
export async function launchFirefox({ port = 2838, prefs = {} } = {}) {
  if (!(await portFree(port))) throw new Error(`BROKEN: port ${port} is taken; a leftover browser?`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ascham-firefox-'));
  fs.writeFileSync(path.join(profile, 'user.js'), [
    `user_pref("marionette.port", ${port});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("app.update.enabled", false);',
    ...Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
  ].join('\n'));
  const proc = spawn(FIREFOX, ['--headless', '--marionette', '--remote-allow-system-access',
    '--no-remote', '--profile', profile], { stdio: 'ignore' });
  let gone = false;
  const exited = new Promise((r) => { proc.on('exit', r); proc.on('error', r); }).then(() => { gone = true; });
  let sock = null;
  const stop = async () => {
    live.delete(stop);
    sock?.destroy();
    if (!gone) { proc.kill(); await exited; }
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {});
  };
  live.add(stop);
  const fail = async (why) => { await stop(); throw new Error(`BROKEN: ${why}`); };
  // Firefox writes this file into its own profile once Marionette holds the
  // port; it writes nothing when the port is taken.
  const active = path.join(profile, 'MarionetteActivePort');
  let own = false;
  for (let i = 0; i < 100 && !own && !gone; i++) {
    try { own = fs.readFileSync(active, 'utf8').trim() === String(port); } catch {}
    if (!own) await sleep(200);
  }
  if (!own) return fail(`firefox (${FIREFOX}) did not start Marionette on port ${port}`);
  sock = await new Promise((res) => {
    const s = net.connect(port, '127.0.0.1', () => res(s));
    s.on('error', () => res(null));
  });
  if (!sock) return fail(`firefox's Marionette on port ${port} refused the connection`);
  sock.setEncoding('utf8');
  let buf = '';
  let id = 0;
  const pending = new Map();
  const hello = [];
  sock.on('data', (d) => {
    buf += d;
    for (;;) {
      const c = buf.indexOf(':');
      if (c < 0) return;
      const n = Number(buf.slice(0, c));
      if (Buffer.byteLength(buf.slice(c + 1)) < n) return;
      // n counts bytes; slice by bytes to stay correct on non-ASCII text.
      const rest = Buffer.from(buf.slice(c + 1));
      const msg = JSON.parse(rest.subarray(0, n).toString());
      buf = rest.subarray(n).toString();
      if (Array.isArray(msg)) { pending.get(msg[1])?.(msg); pending.delete(msg[1]); }
      else hello.shift()?.(msg);
    }
  });
  // Marionette greets first; a server that never does would hang the run.
  const greeted = await Promise.race([new Promise((r) => hello.push(() => r(true))), sleep(10000).then(() => false)]);
  if (!greeted) return fail(`firefox's Marionette on port ${port} sent no greeting in 10 s`);
  const cmd = (name, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m[2] ? reject(new Error(`${name}: ${m[2].message}`)) : resolve(m[3])));
    const s = JSON.stringify([0, i, name, params]);
    sock.write(Buffer.byteLength(s) + ':' + s);
  });
  const session = await cmd('WebDriver:NewSession', { capabilities: {} })
    .catch((e) => fail(`firefox on port ${port}: ${e.message}`));
  const context = (value) => cmd('Marionette:SetContext', { value });
  // Async script: the last argument is the callback.
  const run = async (script, args = []) =>
    (await cmd('WebDriver:ExecuteAsyncScript', { script, args, scriptTimeout: 60000 })).value;
  const navigate = async (url, settle = 1500) => {
    await context('content');
    await cmd('WebDriver:Navigate', { url });
    await sleep(settle);
  };
  const close = async () => {
    try { await cmd('WebDriver:DeleteSession'); } catch {}
    await stop();
  };
  const version = `Firefox/${session.capabilities.browserVersion}`;
  return { cmd, context, run, navigate, close, version };
}
