// Collects real clipboard text for tests/fixtures/paste/. Dev tooling only,
// never shipped, and the only script here that touches the network.
//
//   node --experimental-websocket scripts/collect-paste.mjs
//   node --experimental-websocket scripts/collect-paste.mjs pdf
//
// With `pdf`, offline: Chrome prints sample.pdf afresh from pdf-source.html,
// only the PDF is collected, and the other entries in index.json are kept.
//
// For each source, each browser selects the same span (headline down to the
// sixth body paragraph: a teacher's drag) and copies it with the browser's own
// copy command. What lands in the fixture is the clipboard's text/plain, read
// back unaltered: Chrome via navigator.clipboard.readText(), Firefox via its
// clipboard service. Fresh throwaway profiles; no banner is clicked.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './lib/cdp.mjs';
import { launchFirefox } from './lib/marionette.mjs';
import { stripInfo, metadataIn } from './lib/pdf-meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/fixtures/paste');
const PORT = 8742;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The local PDF is served over loopback so both viewers open it as a web page.
// `/blank` is where Chrome reads the clipboard back: some sites (the Guardian)
// block clipboard reads by permissions policy, and the clipboard is the
// browser's, not the page's.
const BLANK = `http://127.0.0.1:${PORT}/blank`;
const server = http.createServer((req, res) => {
  if (req.url === '/blank') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>blank</title>');
    return;
  }
  if (req.url !== '/sample.pdf') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/pdf' });
  fs.createReadStream(path.join(OUT, 'sample.pdf')).pipe(res);
}).listen(PORT, '127.0.0.1');

// Runs in the page. Selects the span for `kind` and reports what it chose.
const SELECT = String((kind) => {
  const sel = getSelection();
  sel.removeAllRanges();
  const r = document.createRange();
  const long = (p) => p.textContent.trim().length > 80;
  if (kind === 'article' || kind === 'wiki') {
    const h1 = document.querySelector(kind === 'wiki' ? '#firstHeading' : 'h1');
    const root = document.querySelector(kind === 'wiki' ? '#mw-content-text' : 'main') || document.body;
    const ps = [...root.querySelectorAll('p')].filter(long)
      .filter((p) => h1.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING);
    const last = ps[Math.min(5, ps.length - 1)];
    r.setStartBefore(h1);
    r.setEndAfter(last);
  } else if (kind === 'email') {
    // A plain-text email body: the first ~2,500 characters of the <pre>, ended
    // at a line break.
    const pre = [...document.querySelectorAll('pre')].sort((a, b) => b.textContent.length - a.textContent.length)[0];
    const w = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    let seen = 0, node, at = null;
    while ((node = w.nextNode())) {
      const nl = node.data.indexOf('\n', Math.max(0, 2500 - seen));
      if (seen + node.data.length >= 2500 && nl >= 0) { at = [node, nl + 1]; break; }
      seen += node.data.length;
    }
    r.setStart(pre, 0);
    if (at) r.setEnd(at[0], at[1]); else r.setEndAfter(pre.lastChild);
  } else if (kind === 'pdf') {
    const spans = document.querySelectorAll('.page[data-page-number="1"] .textLayer span');
    r.setStartBefore(spans[0]);
    r.setEndAfter(spans[spans.length - 1]);
  }
  sel.addRange(r);
  // Copy acts on the focused document; a consent iframe can hold focus.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  window.focus();
  return sel.toString();
});

// Before every copy the clipboard is set to this, so a copy that silently did
// nothing is caught instead of saving the previous sample under a new name.
const SENTINEL = 'ascham-collector-sentinel';

// The copy must be of the selection: same opening and closing words.
function checkCopy(text, selected) {
  const words = (t) => t.split(/\s+/).filter(Boolean);
  const a = words(text), b = words(selected);
  if (text === SENTINEL) throw new Error('copy did nothing (clipboard unchanged)');
  if (!a.length || a[0] !== b[0] || a[a.length - 1] !== b[b.length - 1]) {
    throw new Error(`clipboard does not match the selection: ${JSON.stringify(text.slice(0, 60))}`);
  }
}

// The pages, found fresh each run so the fixtures are current articles.
async function discover(chrome) {
  const pick = async (url, pattern, which = 'first') => {
    await chrome.navigate(url, 2500);
    const found = await chrome.evaluate(`[...document.querySelectorAll('a[href]')].map((a) => a.href)
      .filter((h) => ${pattern}.test(h)).sort()`);
    if (!found.length) throw new Error(`no link matching ${pattern} on ${url}`);
    return which === 'last' ? found[found.length - 1] : found[0];
  };
  const first = (url, pattern) => pick(url, pattern);
  return {
    bbc: await first('https://www.bbc.co.uk/news', '/^https:\\/\\/www\\.bbc\\.(co\\.uk|com)\\/news\\/articles\\/[a-z0-9]+$/'),
    guardian: await first('https://www.theguardian.com/uk-news', '/^https:\\/\\/www\\.theguardian\\.com\\/[a-z-]+(\\/[a-z-]+)?\\/\\d{4}\\/[a-z]{3}\\/\\d{2}\\/[a-z0-9-]+$/'),
    wikipedia: 'https://en.wikipedia.org/wiki/Gerrymandering',
    email: await (async () => {
      // The newest month, then its first message.
      const month = await pick('https://lists.debian.org/debian-devel-announce/',
        '/\\/debian-devel-announce\\/\\d{4}\\/(\\d{2}|debian-devel-announce-\\d{6})\\/(threads\\.html)?$/', 'last');
      return first(month, '/\\/msg\\d+\\.html$/');
    })(),
    pdf: `http://127.0.0.1:${PORT}/sample.pdf`
  };
}
const KIND = { bbc: 'article', guardian: 'article', wikipedia: 'wiki', email: 'email', pdf: 'pdf' };

async function chromeClipboard(chrome, write) {
  await chrome.send('Browser.grantPermissions', { origin: new URL(BLANK).origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await chrome.navigate(BLANK, 200);
  await chrome.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return chrome.evaluate(write === undefined ? 'navigator.clipboard.readText()'
    : `navigator.clipboard.writeText(${JSON.stringify(write)})`, { gesture: true });
}

async function chromeCopy(chrome, url, kind) {
  await chromeClipboard(chrome, SENTINEL);
  await chrome.navigate(url, 3000);
  await chrome.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  let selected = null;
  if (kind === 'pdf') {
    // Chrome's viewer is a plugin frame page script cannot select into, so
    // this is the keyboard: select all, copy. Page 1 is all there is.
    for (const [key, code, cmd] of [['a', 'KeyA', 'selectAll'], ['c', 'KeyC', 'copy']]) {
      await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code,
        modifiers: 2, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), commands: [cmd] });
      await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers: 2 });
      await sleep(500);
    }
  } else {
    selected = await chrome.evaluate(`(${SELECT})(${JSON.stringify(kind)})`);
    if (!await chrome.evaluate(`document.execCommand('copy')`, { gesture: true })) {
      throw new Error('copy refused');
    }
  }
  const text = await chromeClipboard(chrome);
  if (selected === null) { if (text === SENTINEL) throw new Error('copy did nothing (clipboard unchanged)'); }
  else checkCopy(text, selected);
  return { text };
}

async function firefoxCopy(ff, url, kind) {
  await ff.navigate(url, kind === 'pdf' ? 5000 : 3000);
  await ff.context('chrome');
  await ff.run(`const done = arguments[arguments.length - 1];
    Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper)
      .copyString(arguments[0]);
    done();`, [SENTINEL]);
  await ff.context('content');
  const selected = await ff.run(`const done = arguments[arguments.length - 1];
    done((${SELECT})(arguments[0]));`, [kind]);
  await ff.context('chrome');
  const text = await ff.run(`const done = arguments[arguments.length - 1];
    const w = Services.wm.getMostRecentWindow('navigator:browser');
    w.gBrowser.selectedBrowser.focus();
    w.goDoCommand('cmd_copy');
    setTimeout(() => {
      const t = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);
      t.init(null);
      t.addDataFlavor('text/plain');
      Services.clipboard.getData(t, Ci.nsIClipboard.kGlobalClipboard, w.browsingContext.currentWindowContext);
      const o = {};
      t.getTransferData('text/plain', o);
      done(o.value.QueryInterface(Ci.nsISupportsString).data);
    }, 500);`);
  checkCopy(text, selected);
  return { text };
}

const ONLY_PDF = process.argv[2] === 'pdf';
const before = ONLY_PDF ? JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')) : [];
// Only the PDF's captures are replaced; its source files' entries stay.
const index = before.filter((e) => !(e.source === 'pdf' && e.browser));
// The PDF's rights come from its source page, so a re-capture keeps them.
const pdfRights = before.find((e) => e.source === 'pdf' && e.rights);
const chrome = await launchChrome();
let ff;
try {
  if (ONLY_PDF) {
    await chrome.navigate(`file://${path.join(OUT, 'pdf-source.html')}`, 1000);
    const { data } = await chrome.send('Page.printToPDF', { preferCSSPageSize: true, displayHeaderFooter: false });
    const pdf = stripInfo(Buffer.from(data, 'base64'));
    const left = metadataIn(pdf);
    if (left.length) throw new Error(`sample.pdf still carries metadata: ${left.join(', ')}`);
    fs.writeFileSync(path.join(OUT, 'sample.pdf'), pdf);
    console.log('printed sample.pdf, metadata stripped');
  }
  const pages = ONLY_PDF ? { pdf: `http://127.0.0.1:${PORT}/sample.pdf` } : await discover(chrome);
  console.log(pages);
  ff = await launchFirefox();
  for (const [name, url] of Object.entries(pages)) {
    for (const [browser, run, version] of [['chrome', chromeCopy, chrome.version],
      ['firefox', firefoxCopy, ff.version]]) {
      const b = browser === 'chrome' ? chrome : ff;
      let got;
      try { got = await run(b, url, KIND[name]); }
      catch (e) { got = { skipped: String(e.message || e) }; }
      const file = `${name}.${browser}.txt`;
      const entry = { file, source: name, url, browser: version, captured: new Date().toISOString().slice(0, 10) };
      if (name === 'pdf' && pdfRights) Object.assign(entry, { rights: pdfRights.rights, licence: pdfRights.licence });
      if (got.skipped) {
        entry.skipped = got.skipped;
        console.log(`skip ${file}: ${got.skipped}`);
      } else {
        fs.writeFileSync(path.join(OUT, file), got.text);
        console.log(`wrote ${file} (${got.text.length} chars)`);
      }
      index.push(entry);
    }
  }
} finally {
  await chrome.close();
  if (ff) await ff.close();
  server.close();
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
await sleep(0);
