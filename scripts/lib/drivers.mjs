// One small interface over headless Chrome (DevTools protocol) and headless
// Firefox (Marionette), so scripts/browser-test.mjs runs the same checks in
// both. Dev tooling only, never shipped.
//
//   $(expr)              evaluate an expression in the page; awaits promises
//   paste(text)          put text on the real clipboard and paste it into #paste
//   tab()                press Tab
//   escape()             press Escape
//   viewport(w, h)       resize the page's viewport
//   chooseFile(css, p)   give a file input a file, as the file picker would
//   printMedia(on)       render with print styles (null if unsupported)
//   pdf()                the page printed to PDF, as a Buffer
//   requests()           every URL the page asked for
//   leaves()             times the page asked before being left (null if unseen)
//   problems()           dialogs, CSP violations, errors and console output
//   shot(file)           a PNG of the page
//   close()
import fs from 'node:fs';
import { launchChrome } from './cdp.mjs';
import { launchFirefox } from './marionette.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Installed into the page once it has loaded: records CSP violations, every
// object URL made and revoked, and calls to print(). Page-world, so it sees
// what the page's own modules do.
const INSTRUMENT = `(() => {
  const w = window;
  w.__violations = [];
  w.addEventListener('securitypolicyviolation', (e) => w.__violations.push(e.violatedDirective + ' ' + e.blockedURI));
  w.__urls = { made: [], revoked: [] };
  const make = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (b) => { const u = make(b); w.__urls.made.push(u); return u; };
  URL.revokeObjectURL = (u) => { w.__urls.revoked.push(u); revoke(u); };
  w.__printed = 0;
  w.print = () => { w.__printed++; };
  return true;
})()`;

export async function chromeDriver({ port, downloads, origin }) {
  const c = await launchChrome({ port });
  const requests = [];
  const problems = [];
  let leaves = 0;
  c.on(async (e) => {
    if (e.method === 'Network.requestWillBeSent') requests.push(e.params.request.url);
    // The page asking before it is left with unsaved work: counted, and
    // answered "leave", so open() goes ahead. Any other dialog is a problem.
    if (e.method === 'Page.javascriptDialogOpening' && e.params.type === 'beforeunload') {
      leaves++;
      await c.send('Page.handleJavaScriptDialog', { accept: true });
    } else if (e.method === 'Page.javascriptDialogOpening') {
      problems.push(`dialog: ${e.params.message}`);
      await c.send('Page.handleJavaScriptDialog', { accept: false });
    }
    if (e.method === 'Log.entryAdded') problems.push(`${e.params.entry.level} ${e.params.entry.source}: ${e.params.entry.text}`);
    if (e.method === 'Runtime.exceptionThrown') problems.push(`exception: ${e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text}`);
    if (e.method === 'Runtime.consoleAPICalled') problems.push(`console.${e.params.type}: ${e.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  });
  const viewport = (width, height) => c.send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: width < 600 ? 2 : 1, mobile: width < 600 });
  // A setup that fails still closes the browser it started.
  try {
    for (const d of ['Network', 'Log', 'Runtime', 'Page', 'DOM']) await c.send(`${d}.enable`);
    await c.send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    // Before any page code runs, so a violation during load is seen too.
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source:
      'window.__early = []; addEventListener("securitypolicyviolation", (e) => window.__early.push(e.violatedDirective + " " + e.blockedURI));' });
    await viewport(1280, 900);
  } catch (e) { await c.close(); throw e; }

  const $ = (expr) => c.evaluate(expr);
  const key = async (k, code, vk, modifiers = 0, commands) => {
    await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(commands ? { commands } : {}) });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
  };
  return {
    name: 'chrome',
    version: c.version,
    $,
    async open(url) {
      await c.navigate(url, 800);
      await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await $(INSTRUMENT);
    },
    async paste(text) {
      await $(`navigator.clipboard.writeText(${JSON.stringify(text)})`);
      await $(`(() => { const t = document.getElementById('paste'); t.value = ''; t.focus(); })()`);
      await key('v', 'KeyV', 86, 2, ['paste']);
      await sleep(100);
    },
    tab: () => key('Tab', 'Tab', 9),
    escape: () => key('Escape', 'Escape', 27),
    viewport,
    async chooseFile(selector, file) {
      const { root } = await c.send('DOM.getDocument');
      const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      await c.send('DOM.setFileInputFiles', { nodeId, files: [file] });
    },
    async printMedia(on) {
      await c.send('Emulation.setEmulatedMedia', { media: on ? 'print' : '' });
      return true;
    },
    async pdf() {
      const { data } = await c.send('Page.printToPDF', { printBackground: false });
      return Buffer.from(data, 'base64');
    },
    requests: () => requests,
    leaves: () => leaves,
    async problems() {
      const early = await $(`window.__early || []`);
      const late = await $(`window.__violations || []`);
      return [...problems, ...[...early, ...late].map((v) => `CSP violation: ${v}`)];
    },
    async shot(file) {
      const { data } = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    },
    close: () => c.close()
  };
}

export async function firefoxDriver({ port, downloads, origin }) {
  const f = await launchFirefox({ port, prefs: {
    'browser.download.folderList': 2,
    'browser.download.dir': downloads,
    'browser.download.useDownloadDir': true,
    'browser.download.always_ask_before_handling_new_types': false,
    'browser.download.alwaysOpenPanel': false,
    'browser.download.panel.shown': true,
    'browser.helperApps.neverAsk.saveToDisk': 'text/csv,application/json',
    'browser.download.start_downloads_in_tmp_dir': false,
    // Quiet the browser's own background traffic.
    'app.update.auto': false,
    'media.gmp-manager.updateEnabled': false,
    'media.gmp-gmpopenh264.enabled': false,
    'media.gmp-widevinecdm.enabled': false,
    'extensions.update.enabled': false,
    'browser.safebrowsing.update.enabled': false,
    'network.captive-portal-service.enabled': false,
    'network.connectivity-service.enabled': false
  } });
  // Script in a context; the last argument is the callback.
  const inChrome = async (body, args = []) => {
    await f.context('chrome');
    try { return await f.run(`const done = arguments[arguments.length - 1]; ${body}`, args); }
    finally { await f.context('content'); }
  };
  // Every request the browser makes, and every console message about the
  // page: recorded in the browser's own chrome, which the page cannot touch.
  // A setup that fails still closes the browser it started.
  await inChrome(`
    window.__brRequests = [];
    window.__brConsole = [];
    // Only what a page asked for: the browser's own traffic (updates,
    // plugins) carries the system principal and is not the page's doing.
    Services.obs.addObserver({ observe(s) {
      try {
        const ch = s.QueryInterface(Ci.nsIChannel);
        if (ch.loadInfo.triggeringPrincipal.isSystemPrincipal) return;
        window.__brRequests.push(ch.URI.spec);
      } catch (e) {}
    } }, 'http-on-modify-request');
    Services.console.registerListener({ observe(m) {
      try {
        const e = m.QueryInterface(Ci.nsIScriptError);
        if (/^(about|chrome|resource|moz-extension):/.test(e.sourceName)) return;
        if (e.isFromChromeContext) return;
        window.__brConsole.push(e.category + ': ' + e.errorMessage + ' (' + e.sourceName + ')');
      } catch (x) {}
    } });
    done(true);`).catch(async (e) => { await f.close(); throw e; });

  const $ = async (expr) => {
    const r = await f.run(`const done = arguments[arguments.length - 1];
      Promise.resolve().then(() => (${expr})).then((v) => done({ v: v === undefined ? null : v }), (e) => done({ e: String(e) }));`);
    if (r && r.e) throw new Error(r.e);
    return r ? r.v : null;
  };
  const keys = (value) => f.cmd('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'kb',
    actions: [{ type: 'keyDown', value }, { type: 'keyUp', value }] }] });
  // Firefox will not make a window narrower than about 450px, so a phone
  // width is reached by zooming: at a zoom of inner/width the page lays out
  // in `width` CSS pixels, as it would on the phone.
  const viewport = async (width, height) => {
    await inChrome(`gBrowser.selectedBrowser.fullZoom = 1; done(true);`);
    await f.cmd('WebDriver:SetWindowRect', { width, height });
    const inner = await $(`innerWidth`);
    if (inner > width) await inChrome(`gBrowser.selectedBrowser.fullZoom = arguments[0]; done(true);`, [inner / width]);
  };
  return {
    name: 'firefox',
    version: f.version,
    $,
    async open(url) {
      await f.navigate(url, 800);
      await $(INSTRUMENT);
    },
    async paste(text) {
      await inChrome(`Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(arguments[0]); done(true);`, [text]);
      await $(`(() => { const t = document.getElementById('paste'); t.value = ''; t.focus(); return true; })()`);
      await inChrome(`gBrowser.selectedBrowser.focus(); goDoCommand('cmd_paste'); setTimeout(() => done(true), 100);`);
    },
    tab: () => keys(''),
    escape: () => keys('\uE00C'),
    viewport,
    async chooseFile(selector, file) {
      const el = await f.cmd('WebDriver:FindElement', { using: 'css selector', value: selector });
      const id = Object.values(el.value || el)[0];
      await f.cmd('WebDriver:ElementSendKeys', { id, text: file });
    },
    // Firefox's own print simulation, as its devtools offer it.
    async printMedia(on) {
      try {
        await inChrome(`gBrowser.selectedBrowser.browsingContext.mediumOverride = arguments[0]; done(true);`, [on ? 'print' : '']);
        return true;
      } catch (e) { return null; }
    },
    async pdf() {
      const r = await f.cmd('WebDriver:Print', { background: false, shrinkToFit: true });
      return Buffer.from(r.value || r, 'base64');
    },
    requests: () => inChrome(`done(window.__brRequests)`),
    // Driven by Marionette, Firefox leaves a page without its leaving
    // dialog, so it can't show whether the page would ask.
    leaves: () => null,
    async problems() {
      const out = [];
      try { out.push(`dialog: ${(await f.cmd('WebDriver:GetAlertText')).value}`); } catch (e) { /* no dialog: good */ }
      out.push(...(await inChrome(`done(window.__brConsole)`)));
      out.push(...((await $(`window.__violations || []`)) || []).map((v) => `CSP violation: ${v}`));
      return out;
    },
    async shot(file) {
      const r = await f.cmd('WebDriver:TakeScreenshot', { full: true });
      fs.writeFileSync(file, Buffer.from(r.value || r, 'base64'));
    },
    close: () => f.close()
  };
}
