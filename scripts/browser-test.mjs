// The built page in headless Chrome and headless Firefox, under its real CSP
// and headers. Dev tooling only, never shipped.
//
//   bash scripts/build.sh && node --experimental-websocket scripts/browser-test.mjs [chrome|firefox|all] [evidence-dir]
//
// Serves dist/ on loopback with scripts/serve.mjs --dist and, in each browser,
// pastes through the real clipboard and holds the page to: markup in a paste
// renders as text; no dialog, no CSP violation, no request off the origin;
// nothing of the passage in any browser store; the selection is what is read;
// the set-aside door, the untick control, truncation and the wrap hint work;
// every control is reachable by Tab; the Anki CSV that lands in the downloads
// folder is strict RFC 4180, keeps its BOM and formula guard, holds only the
// ticked cards and keeps promise 4; the print rendering and the PDF hold only
// the ticked cards; the worksheet PDF matches the harness's own worksheet.js
// build, keeps its key on a page of its own, and shows no unticked word, no
// empty question section and no answer un-blanked before the key; a saved
// project (version 2) opens back to the same deck; opening over unsaved text
// asks in the page first; leaving with unsaved work asks, and only then;
// "Start again" asks first and clears the page but not the settings or key;
// hostile project files are refused or rendered
// inert; and every object URL is revoked. Pro: without a key every Pro
// control is disabled with its line, and printing the worksheet refuses with
// its button forced on; a forged or earlier-major key is refused, a valid one
// unlocks Pro, the settings save, the CSV becomes the Pro deck, the marker
// test still holds with both stores in use, and "Remove key" goes back to
// free. The site served is dist/ with one edit, the test-only public key
// (tests/fixtures/licence/) in place of licence-core.js's ISSUER, so no key
// that unlocks the product is used. The PDFs, downloads and screenshots go to evidence-dir (default: a
// fresh temporary directory, of which the newest EVIDENCE_KEPT are kept), never into git.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeDriver, firefoxDriver } from './lib/drivers.mjs';
import { live } from './lib/port.mjs';
import { parseCsv } from '../tests/lib/rfc4180.mjs';
import * as S from '../src/ui/strings.js';
import * as Project from '../src/ui/project.js';
import * as Sheet from '../src/ui/worksheet.js';
import { SAMPLE_ITEMS } from '../src/ui/pro.js';
import { analyse } from '../src/ui/pipeline.js';
import { normalise } from '../src/core/paste.js';
import { REVOKE_AFTER_MS } from '../src/ui/download.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8761;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const WHICH = process.argv[2] || 'all';
// Default evidence folders kept, this run's included: recent runs stay to look
// into, and they never pile up. A folder named on the command line is never
// removed.
const EVIDENCE_KEPT = 5;
const evidence = () => {
  const old = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('ascham-evidence-'))
    .map((f) => path.join(os.tmpdir(), f))
    .map((p) => ({ p, at: fs.statSync(p).mtimeMs })).sort((a, b) => b.at - a.at);
  for (const { p } of old.slice(EVIDENCE_KEPT - 1)) fs.rmSync(p, { recursive: true, force: true });
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ascham-evidence-'));
};
const EVIDENCE = path.resolve(process.argv[3] || evidence());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LICENCE_FIX = path.join(ROOT, 'tests/fixtures/licence');
const LICENCE_KEYS = JSON.parse(fs.readFileSync(path.join(LICENCE_FIX, 'keys.json'), 'utf8'));
const TEST_ISSUER = JSON.parse(fs.readFileSync(path.join(LICENCE_FIX, 'TEST-ONLY-issuer.json'), 'utf8')).public;

if (!['chrome', 'firefox', 'all'].includes(WHICH)) {
  console.log('usage: browser-test.mjs [chrome|firefox|all] [evidence-dir]');
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, 'dist/app/index.html'))) {
  console.log('BROKEN: dist/ is not built; run scripts/build.sh');
  process.exit(2);
}

// Stopped from outside (Ctrl+C, `timeout`, a closed terminal): stop the server
// and the browsers and remove their folders first, so nothing is left to
// answer the next run's ports.
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(2), 15000);
  await Promise.all([...live].map((stop) => stop().catch(() => {})));
  console.log(`BROKEN: stopped by ${sig}`);
  process.exit(2);
});
// A folder this run made, removed when the run stops however it stops.
const scratch = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const stop = async () => { live.delete(stop); fs.rmSync(dir, { recursive: true, force: true }); };
  live.add(stop);
  return { dir, stop };
};

let failed = 0;
let prefix = '';
function check(name, pass, detail) {
  if (pass) console.log(`ok    ${prefix}${name}`);
  else { failed++; console.log(`FAIL  ${prefix}${name}${detail === undefined ? '' : `\n      ${String(detail).slice(0, 600)}`}`); }
}

// Waits for a file to appear in `dir` and stop growing; returns its path.
async function landed(dir, pattern, ms = 10000) {
  for (let t = 0; t < ms; t += 100) {
    const hit = fs.readdirSync(dir).find((f) => pattern.test(f) && !/\.(part|crdownload|tmp)$/.test(f));
    if (hit) {
      const p = path.join(dir, hit);
      const size = fs.statSync(p).size;
      await sleep(150);
      if (size > 0 && fs.statSync(p).size === size) return p;
    }
    await sleep(100);
  }
  return null;
}
const clear = (dir) => { for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true }); };
const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
// A word or phrase standing alone, in any case, across any run of spaces or
// line breaks: the worksheet's own idea of a whole word (worksheet.js).
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (w) => new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${w.split(/\s+/).map(escapeRe).join('\\s+')}(?![\\p{L}\\p{M}\\p{N}])`, 'iu');
// The text between two headings of a printed sheet (or to the end).
const between = (text, from, to) => {
  const a = text.indexOf(from);
  if (a < 0) return '';
  const b = to === undefined ? -1 : text.indexOf(to, a + from.length);
  return text.slice(a, b < 0 ? undefined : b);
};

// ---- the run, once per browser ------------------------------------------------

async function run(make, port) {
  const { dir: downloads, stop: dropDownloads } = scratch('ascham-dl-');
  let b;
  try { b = await make({ port, downloads, origin: ORIGIN }); }
  catch (e) {
    await dropDownloads();
    throw e.message.startsWith('BROKEN:') ? e : new Error(`BROKEN: the browser did not start: ${e.message}`);
  }
  let dropFiles = async () => {};
  const out = path.join(EVIDENCE, b.name);
  fs.mkdirSync(out, { recursive: true });
  prefix = `${b.name}  `;
  console.log(`# ${b.version}`);
  const $ = b.$;
  const id = (x) => `document.getElementById(${JSON.stringify(x)})`;
  const press = async () => { await $(`${id('read')}.click()`); await sleep(300); };
  const faces = () => $(`[...document.querySelectorAll('#cards th.face label')].map((l) => l.textContent)`);
  try {
    await b.open(`${ORIGIN}/app/`);
    check('the page loaded its modules and its wording', await $(`${id('read')}.textContent === ${JSON.stringify(S.PAGE.read)} && document.title`) === S.PAGE.appName);
    // Whether the page holds a leaving event: its answer to a synthetic one,
    // the same in both browsers.
    const leaving = () => $(`(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()`);
    check('an empty page does not ask before it is left', !(await leaving()));
    await b.shot(path.join(out, '1-empty-desktop.png'));

    // ---- free: every Pro control shown, disabled, with its line ---------------
    const proState = () => $(`({
      state: ${id('licence-state')}.textContent,
      printSheet: ${id('print-sheet')}.getAttribute('aria-disabled') === 'true' && !${id('print-sheet')}.disabled,
      bold: /bold/i.test(${id('settings')}.textContent),
      lines: [...document.querySelectorAll('.pro-line')].filter((p) => !p.hidden).map((p) => p.textContent),
      upgrade: ${id('upgrade')}.hidden ? '' : ${id('upgrade')}.textContent,
      fields: [...document.querySelectorAll('#settings input, #terms, #settings-save')].map((f) => f.disabled),
      key: !${id('key')}.disabled
    })`);
    await sleep(300);
    const free = await proState();
    check('free: the licence state says so in plain words', free.state === S.LICENCE.missing, free.state);
    check('free: every Pro control is disabled, each with its "Part of Pro." line', free.printSheet && free.fields.length >= 7 && free.fields.every(Boolean) &&
      free.lines.length === 5 && free.lines.every((l) => l === S.PAGE.proLine) && free.key, JSON.stringify(free));
    check('free: the Basic card style does not say the word is bold', !free.bold && await $(`${id('style-basic-why')}.textContent`) === S.basicWhy(false));
    check('free: the upgrade line is shown, once', free.upgrade === S.PAGE.upgrade && await $(`document.body.textContent.split(${JSON.stringify(S.PAGE.upgrade)}).length`) === 2);

    // ---- hostile paste ----------------------------------------------------
    const MARKER = 'Zorblaxian';
    const HOSTILE = [
      `The ${MARKER} ombudsman <img src=x onerror=alert(1)> investigated the allegations thoroughly.`,
      `Critics called the <script>alert(2)</script> gerrymandering scrupulous yet opaque.`,
      `An <svg onload=alert(3)> extradition hearing followed the <iframe src="javascript:alert(4)"></iframe> sabotage.`,
      `The <a href="https://evil.example/?q=">tribunal</a> rejected the "><b>affidavit</b> as inadmissible.`,
      `Prosecutors cited {{constructor.constructor('alert(5)')()}} and &lt;entities&gt; in the indictment.`
    ].join('\n\n');
    await b.paste(HOSTILE);
    check('the paste landed in the box exactly', await $(`${id('paste')}.value`) === HOSTILE);
    const EVIL_TITLE = '<img src=y onerror=alert(6)> Hostile title';
    await $(`${id('title')}.value = ${JSON.stringify(EVIL_TITLE)}`);
    await press();
    const rows = await $(`document.querySelectorAll('#cards tbody tr').length`);
    check('the hostile paste produced cards', rows > 0, rows);
    const sentences = await $(`[...document.querySelectorAll('#cards td.sentence')].map((td) => td.textContent).join('\\n')`);
    check('markup in a sentence is shown as text', sentences.includes('<img src=x onerror=alert(1)>') && sentences.includes('<script>alert(2)</script>'), sentences);
    check('the title is shown as text', await $(`${id('deck-title')}.textContent`) === EVIL_TITLE);
    const injected = () => $(`[...document.querySelectorAll('img, iframe, svg, object, embed, a, b, form, script')]
      .filter((e) => !(e.tagName === 'SCRIPT' && e.getAttribute('src') === '../src/ui/main.js')).map((e) => e.outerHTML)`);
    check('no element came from the paste', (await injected()).length === 0, JSON.stringify(await injected()));
    const handlers = () => $(`[...document.querySelectorAll('*')].every((e) => ![...e.attributes].some((a) => /^on/i.test(a.name)))`);
    check('no event-handler attribute anywhere in the document', await handlers());
    await b.shot(path.join(out, '2-hostile-desktop.png'));

    // ---- selection ----------------------------------------------------------
    const TWO = 'The ombudsman investigated the allegations thoroughly.\r\n\r\nCritics called the gerrymandering scrupulous yet opaque.';
    await b.paste(TWO);
    await $(`(() => { const t = ${id('paste')}; const s = t.value.indexOf('Critics'); t.setSelectionRange(s, t.value.length); })()`);
    await press();
    const picked = await faces();
    check('only the selected paragraph gives cards', picked.includes('gerrymandering') && !picked.includes('ombudsman'), picked.join(' '));
    await $(`${id('paste')}.setSelectionRange(0, 0)`);
    await press();
    const all = await faces();
    check('with no selection the whole text is read', all.includes('gerrymandering') && all.includes('ombudsman'), all.join(' '));

    // ---- review controls ------------------------------------------------------
    const tally0 = await $(`${id('tally')}.textContent`);
    await $(`document.querySelector('#cards tbody input').click()`);
    const tally1 = await $(`${id('tally')}.textContent`);
    check('unticking a card updates the tally', tally0 !== tally1 && tally1 === S.tally(all.length - 1, all.length), `${tally0} -> ${tally1}`);
    check('an unticked row is marked', await $(`document.querySelector('#cards tbody tr').className`) === 'off');
    await b.paste('Dr. Aldana, who chairs the U.S. Senate panel, argued that gerrymandering had become entrenched, e.g. in Smithfield, and the well-being of voters was at stake.');
    await press();
    check('the set-aside note is shown', /^Set aside: /.test(await $(`${id('note')}.textContent`)), await $(`${id('note')}.textContent`));
    check('the door is shown', await $(`!${id('door')}.hidden && ${id('door')}.textContent`) === S.DOOR_OPEN);
    await $(`${id('door')}.click()`);
    const view = await $(`({ headings: [...document.querySelectorAll('#declined h3')].map((h) => h.textContent), tally: ${id('tally')}.textContent, table: ${id('cards')}.hidden, door: ${id('door')}.textContent, actions: ${id('actions')}.hidden })`);
    check('the set-aside view lists its headings and hides the deck\'s actions', view.headings.length > 0 && view.table && view.actions && view.door === S.DOOR_SHUT && /set aside$/.test(view.tally), JSON.stringify(view));
    await b.shot(path.join(out, '3-set-aside-desktop.png'));
    await $(`${id('door')}.click()`);
    check('and the door leads back', await $(`!${id('cards')}.hidden && ${id('door')}.textContent`) === S.DOOR_OPEN);

    // ---- states -----------------------------------------------------------------
    await b.paste('');
    await press();
    check('empty paste says so', await $(`${id('status')}.textContent`) === S.MESSAGES.NO_TEXT);
    await b.paste('The dog and the cat.');
    await press();
    check('no-card passage says so', /became a card/.test(await $(`${id('status')}.textContent`)));
    await $(`(() => { const t = ${id('paste')}; t.value = 'The ombudsman investigated. '.repeat(4800); t.dispatchEvent(new Event('input')); t.setSelectionRange(0, 0); })()`);
    await press();
    check('a long paste is cut and the teacher told', await $(`${id('notice')}.textContent`) === S.truncatedLine(120000));
    await b.paste('It has been a while since the committee first\nannounced its review, and the councillors were\nreminded that the consultation would close\nsoon and that submissions were welcome.');
    check('hard-wrapped text shows the hint', await $(`!${id('hint')}.hidden && ${id('hint')}.textContent`) === S.WRAPPED_HINT);
    await $(`${id('keep-breaks')}.click()`);
    check('and unticking "Keep line breaks" hides it', await $(`${id('hint')}.hidden`));
    await $(`${id('keep-breaks')}.click()`);

    // ---- the Anki CSV --------------------------------------------------------------
    const EXPORT = 'Ombudsman report\n\n-20% growth, said the "ombudsman", was =SUM(A1) scrupulous.\n' +
      '+Critics called the gerrymandering opaque; the café owners called it entrenched.\n' +
      `@everyone: the ${MARKER} extradition, they said, was "scrupulously" argued, with sabotage alleged.`;
    await b.paste(EXPORT);
    await $(`${id('title')}.value = 'Year 9: Nord Stream', ${id('source-field')}.value = 'BBC News, 10 October 2026'`);
    await press();
    const deck = await faces();
    await $(`document.querySelector('#keep-1').click()`);
    const unticked = deck[1];
    const ticked = deck.filter((_, i) => i !== 1);
    clear(downloads);
    await $(`${id('export-csv')}.click()`);
    const csvPath = await landed(downloads, /\.csv$/);
    check('the CSV lands in the downloads folder under csv-core\'s name', csvPath && /^ascham_year-9-nord-stream_\d{4}-\d\d-\d\d\.csv$/.test(path.basename(csvPath)), csvPath);
    if (csvPath) {
      fs.copyFileSync(csvPath, path.join(out, 'export.csv'));
      const bytes = fs.readFileSync(csvPath);
      check('the CSV starts with the UTF-8 byte order mark', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
      const text = bytes.toString('utf8').slice(1);
      let records = null;
      try { records = parseCsv(text); } catch (e) { check('the CSV parses as strict RFC 4180', false, e.message); }
      if (records) {
        check('the CSV parses as strict RFC 4180', true);
        const rows = records.filter((r) => !r[0].startsWith('#'));
        const tags = records.find((r) => r[0].startsWith('#tags:'));
        check('the CSV holds the ticked cards only, in order', JSON.stringify(rows.map((r) => r[0])) === JSON.stringify(ticked) && !rows.some((r) => r[0] === unticked), `${rows.map((r) => r[0])} vs ${ticked}`);
        check('the CSV is tagged from the title', tags && tags[0] === '#tags:ascham Year-9-Nord-Stream', JSON.stringify(tags));
        const source = normalise(EXPORT).text;
        const bad = rows.filter(([face, back]) => {
          const sentence = /^'[=+\-@\t\r]/.test(back) ? back.slice(1) : back;
          return !source.includes(sentence) || !sentence.toLowerCase().includes(face.toLowerCase());
        });
        check('promise 4: every sentence is verbatim in the source and holds its face', rows.length > 0 && bad.length === 0, JSON.stringify(bad));
        const backs = rows.map((r) => r[1]);
        check('the formula guard survives the download', backs.some((x) => x.startsWith("'-20%")) && backs.some((x) => x.startsWith("'@everyone")) && !backs.some((x) => /^[=+\-@]/.test(x)), backs.join(' | '));
        check('accents survive', text.includes('café'));
      }
    }

    // ---- print ------------------------------------------------------------------------
    await $(`${id('print-list')}.click()`);
    check('"Print vocabulary list" calls print() with the list', await $(`window.__printed`) === 1 && await $(`document.body.dataset.print`) === 'list');
    const emulated = await b.printMedia(true);
    if (emulated) {
      await sleep(200);
      const printed = await $(`document.body.innerText`);
      const shows = (w) => new RegExp(`(^|\\s)${w}(\\s|$)`, 'm').test(printed);
      check('print rendering: title, source, and every ticked word', printed.includes('Year 9: Nord Stream') && printed.includes('BBC News, 10 October 2026') && ticked.every(shows), printed);
      check('print rendering: the unticked word is absent', !shows(unticked), unticked);
      check('print rendering: no interface controls and no worksheet', ![S.PAGE.read, S.PAGE.exportCsv, S.PAGE.saveProject, S.PAGE.pasteLabel, S.PAGE.all, S.PAGE.printSheet, S.SHEET.wordBank].some((t) => printed.includes(t)), printed);
      await b.shot(path.join(out, '5-print-media.png'));
      await b.printMedia(false);
    } else {
      check('print rendering (media emulation unavailable in this browser)', true);
    }
    const pdf = await b.pdf();
    const pdfPath = path.join(out, 'printout.pdf');
    fs.writeFileSync(pdfPath, pdf);
    const words = pdfText(pdfPath);
    const inPdf = (w) => new RegExp(`(^|\\s)${w}(\\s|$)`, 'm').test(words);
    check('the PDF holds the title and every ticked word', words.includes('Year 9: Nord Stream') && ticked.every(inPdf), words.slice(0, 400));
    check('the PDF leaves out the unticked word and the controls', !inPdf(unticked) && !words.includes(S.PAGE.read) && !words.includes(S.PAGE.exportCsv), unticked);

    // ---- the project file ---------------------------------------------------------------
    clear(downloads);
    const selection = await $(`[${id('paste')}.selectionStart, ${id('paste')}.selectionEnd]`);
    // A question carrying the marker, and one option changed: version 2 keeps both.
    const ASKED = `What do you know about the ${MARKER} case?`;
    await $(`(() => { const q = document.querySelector('input[data-q="before"]'); q.value = ${JSON.stringify(ASKED)}; q.dispatchEvent(new Event('input', { bubbles: true })); ${id('opt-full-text')}.click(); })()`);
    await $(`${id('save')}.click()`);
    const projPath = await landed(downloads, /\.json$/);
    check('the project lands in the downloads folder', projPath && /^ascham_year-9-nord-stream_\d{4}-\d\d-\d\d\.json$/.test(path.basename(projPath)), projPath);
    let saved = null;
    if (projPath) {
      fs.copyFileSync(projPath, path.join(out, 'project.json'));
      const parsed = Project.parse(fs.readFileSync(projPath, 'utf8'));
      saved = parsed.ok ? parsed.project : null;
      check('the project file opens and holds the paste and choices, no cards', saved && saved.text === await $(`${id('paste')}.value`) &&
        saved.title === 'Year 9: Nord Stream' && saved.source === 'BBC News, 10 October 2026' && saved.lineBreaks === true &&
        saved.selection.from === selection[0] && saved.selection.to === selection[1] &&
        JSON.stringify(saved.unticked) === JSON.stringify([unticked]) && !/"cards"/.test(fs.readFileSync(projPath, 'utf8')), JSON.stringify(parsed));
      check('the project is version 2 and keeps the questions and worksheet options', /"version": 2,/.test(fs.readFileSync(projPath, 'utf8')) && saved &&
        JSON.stringify(saved.questions) === JSON.stringify({ before: [ASKED], while: [], after: [] }) &&
        saved.worksheet.fullText === true && saved.worksheet.answerKey === true, JSON.stringify(saved));
    }
    await sleep(REVOKE_AFTER_MS + 500);
    const urls = await $(`window.__urls`);
    check('every object URL was revoked', urls.made.length === 2 && urls.made.every((u) => urls.revoked.includes(u) && u.startsWith(`blob:${ORIGIN}/`)), JSON.stringify(urls));

    // Open it in a fresh page: the same deck, the same ticks.
    if (projPath) {
      await b.open(`${ORIGIN}/app/`);
      await b.chooseFile('#open', projPath);
      await sleep(800);
      const back = await faces();
      const ticks = await $(`[...document.querySelectorAll('#cards tbody input')].map((i) => i.checked)`);
      check('opening the project rebuilds the same deck', JSON.stringify(back) === JSON.stringify(deck), `${back} vs ${deck}`);
      check('with the same word unticked', JSON.stringify(ticks) === JSON.stringify(deck.map((_, i) => i !== 1)), JSON.stringify(ticks));
      check('and the same text, title and source', await $(`${id('paste')}.value === ${JSON.stringify(saved && saved.text)} && ${id('title')}.value === 'Year 9: Nord Stream' && ${id('source-field')}.value === 'BBC News, 10 October 2026'`));
      check('and the same question and worksheet options, the questions shown', await $(`document.querySelector('input[data-q="before"]').value === ${JSON.stringify(ASKED)} && ${id('questions')}.open && ${id('opt-full-text')}.checked && ${id('opt-answer-key')}.checked`));
    }

    // ---- the worksheet ----------------------------------------------------------------
    // The news paste (tests/fixtures/paste), two good cards unticked, one
    // question in one section. The page's sheet must be the one worksheet.js
    // builds here from the same deck, and its PDF must hold to the rules.
    await b.open(`${ORIGIN}/app/`);
    await b.paste(fs.readFileSync(path.join(ROOT, 'tests/fixtures/paste/nasa.chrome.txt'), 'utf8'));
    const SHEET_TITLE = 'Year 9 reading';
    const WHILE = 'Why will Dragonfly fly between sites on Titan?';
    await $(`${id('title')}.value = ${JSON.stringify(SHEET_TITLE)}`);
    await press();
    const box = await $(`${id('paste')}.value`);
    const news = analyse({ raw: box, start: 0, end: 0, keepLineBreaks: true });
    const newsDeck = await faces();
    check('the harness reads the page\'s deck', news.state === 'cards' && JSON.stringify(news.cards.map((c) => c.word)) === JSON.stringify(newsDeck), newsDeck.join(' '));
    // Unticked: the first card (so card 1 is the first ticked, for the Pro
    // deck below), and the first card whose sentence is still an item through
    // another ticked gap, so the word shows there unblanked however long the
    // text's paragraphs are. Chosen on worksheet.js's own sheet, which the
    // page must then match.
    const build = (keep, options) => Sheet.build({ cards: news.cards, keep, text: box, lineBreaks: true,
      title: SHEET_TITLE, source: '', questions: { before: [], while: [WHILE], after: [] }, options });
    const keepAllBut = (off) => newsDeck.map((_, i) => !off.includes(i));
    const plain = (it) => it.parts.filter((x) => typeof x === 'string').join(' ');
    const second = newsDeck.findIndex((w, j) => {
      if (j < 2) return false;
      const s = build(keepAllBut([0, j]), { fullText: false, answerKey: true });
      return s.repeats && s.items.some((it) => it.parts.filter((x) => typeof x !== 'string').length > 1) &&
        s.items.some((it) => wholeWord(w).test(plain(it)));
    });
    check('the deck has a card to untick whose sentence stays an item', second > 0, newsDeck.join(' '));
    const offAt = [0, second];
    for (const i of offAt) await $(`document.querySelector('#keep-${i}').click()`);
    await $(`(() => { const q = document.querySelector('input[data-q="while"]'); q.value = ${JSON.stringify(WHILE)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const offWords = offAt.map((i) => newsDeck[i]);
    const model = (options) => build(keepAllBut(offAt), options);
    const want = model({ fullText: false, answerKey: true });
    const itemText = (it) => `${S.itemNumber(it.number)} ${it.parts.map((x) => (typeof x === 'string' ? x : (x.label === String(it.number) ? '' : x.label))).join('')}`;
    const onPage = () => $(`({
      items: [...document.querySelectorAll('#sheet .item')].map((p) => p.textContent),
      bank: [...document.querySelectorAll('#sheet .bank li')].map((li) => li.textContent),
      key: [...document.querySelectorAll('#sheet .key li')].map((li) => li.textContent),
      paragraphs: document.querySelectorAll('#sheet .full-text p').length,
      asked: [...document.querySelectorAll('#sheet .asked h2')].map((h) => h.textContent),
      deckOnly: ${id('deck-only')}.hidden ? '' : ${id('deck-only')}.textContent,
      keys: document.querySelectorAll('.sheet .key').length,
      sample: [...document.querySelectorAll('#sheet .sample')].map((p) => p.textContent).join('')
    })`);
    // The free sheet (PROMISES.md § What is free): pro.js's sample, at most
    // SAMPLE_ITEMS items, no full text, questions or answer key anywhere on
    // the page, and the line saying what Pro adds.
    const isSample = (p) => p.items.length > 0 && p.items.length <= SAMPLE_ITEMS && p.keys === 0 && p.key.length === 0 &&
      p.asked.length === 0 && p.paragraphs === 0 && p.sample === S.SHEET.sample && p.deckOnly === '';

    // Free, with the full text and the key asked for and a question set:
    // still the sample, and the very one pro.js builds without a key.
    await $(`${id('opt-full-text')}.click()`);
    await sleep(300);
    const freeSheet = await onPage();
    const sampleOf = Sheet.build({ cards: news.cards, keep: keepAllBut(offAt), text: box, lineBreaks: true, title: SHEET_TITLE, source: '',
      options: { fullText: false, answerKey: false }, limit: SAMPLE_ITEMS });
    check('free: the sheet is the sample: at most 3 items, no full text, questions or answer key, and the sample line', isSample(freeSheet) &&
      want.items.length > SAMPLE_ITEMS, JSON.stringify(freeSheet));
    check('free: the sample is the one pro.js builds', JSON.stringify(freeSheet.items) === JSON.stringify(sampleOf.items.map(itemText)) &&
      JSON.stringify(freeSheet.bank) === JSON.stringify(sampleOf.bank), JSON.stringify(freeSheet));
    await $(`${id('opt-full-text')}.click()`);
    await sleep(300);

    // Free: the button is only aria-disabled, so a click reaches the action, which refuses.
    await $(`${id('print-sheet')}.click()`);
    await sleep(300);
    check('free: printing the worksheet refuses where it runs', await $(`window.__printed`) === 0 && await $(`${id('status')}.textContent`) === S.MESSAGES.PRO_ONLY);

    // ---- the licence key, then the Pro settings ---------------------------------------
    const enter = async (key) => {
      await $(`(() => { ${id('settings')}.open = true; ${id('key')}.value = ${JSON.stringify(key)}; ${id('key-save')}.click(); })()`);
      await sleep(400);
    };
    // keyHelp says checking a key needs no internet connection once the page
    // is open: from the first key pasted to the last verdict, nothing is asked for.
    const beforeKeys = (await b.requests()).length;
    await enter(LICENCE_KEYS.forged);
    check('a forged key is refused, said plainly, not kept, Pro still off', await $(`${id('licence-state')}.textContent`) === S.LICENCE.signature &&
      await $(`localStorage.getItem('ascham.licence')`) === null && (await proState()).printSheet);
    await enter(LICENCE_KEYS.ceilingZero);
    check('a genuine key for an earlier major is refused, said plainly', await $(`${id('licence-state')}.textContent`) === S.ceilingSaid({ max: 0 }, 1) && (await proState()).printSheet);
    await enter(LICENCE_KEYS.malformed);
    check('a malformed key is refused, said plainly', await $(`${id('licence-state')}.textContent`) === S.LICENCE.shape && (await proState()).printSheet);
    await enter(LICENCE_KEYS.valid1);
    const unlocked = await proState();
    check('a valid key unlocks Pro: said plainly, the controls on, no Pro lines, no upgrade line', unlocked.state === S.unlockedSaid({ buyer: '' }, 1) && !unlocked.printSheet && unlocked.bold &&
      unlocked.fields.every((f) => !f) && unlocked.lines.length === 0 && unlocked.upgrade === '', JSON.stringify(unlocked));
    const whileChecking = (await b.requests()).slice(beforeKeys);
    check('no request while four keys are checked', whileChecking.length === 0, whileChecking.join(' '));

    // With the key, the whole sheet on screen.
    await sleep(300);
    const page = await onPage();
    check('the page\'s worksheet is the one worksheet.js builds', want.items.length > 1 &&
      JSON.stringify(page.items) === JSON.stringify(want.items.map(itemText)) &&
      JSON.stringify(page.bank) === JSON.stringify(want.bank) &&
      JSON.stringify(page.key) === JSON.stringify(want.key.map((k) => `${k.label} ${k.answer}`)) &&
      page.paragraphs === 0 && page.sample === '' && page.deckOnly === (want.deckOnly ? S.deckOnlyLine(want.deckOnlyWhy, Sheet.MAX_ITEMS, Sheet.MAX_GAPS) : ''), JSON.stringify(page));
    check('unticked words are never blanked, never in the bank or the key',
      offWords.every((w) => !want.items.some((it) => it.parts.some((x) => typeof x !== 'string' && x.answer.toLowerCase() === w.toLowerCase())) &&
        !page.bank.some((x) => x.toLowerCase() === w.toLowerCase()) && !page.key.some((x) => wholeWord(w).test(x))), offWords.join(' '));
    check('and an unticked word still reads in its sentence', page.items.some((x) => wholeWord(offWords[1]).test(x)), offWords.join(' '));
    check('only the section with a question is on the sheet', JSON.stringify(page.asked) === JSON.stringify([S.PAGE.while]), JSON.stringify(page.asked));
    check('and the key is kept, under the licence key only', await $(`localStorage.getItem('ascham.licence')`) === LICENCE_KEYS.valid1);
    check('and the key field is empty once the key is saved', await $(`${id('key')}.value`) === '');
    await $(`(() => { document.querySelector('input[name="card-style"][data-v="cloze"]').click(); ${id('deck-tag')}.value = 'Year 9 autumn'; ${id('settings-save')}.click(); })()`);
    await sleep(300);
    check('the Pro settings save', await $(`${id('settings-said')}.textContent`) === S.MESSAGES.SETTINGS_SAVED &&
      JSON.parse(await $(`localStorage.getItem('ascham.settings')`)).tag === 'Year 9 autumn');
    await b.shot(path.join(out, '7-settings-pro-desktop.png'));
    await $(`${id('settings')}.open = false`);

    await $(`${id('print-sheet')}.click()`);
    check('"Print worksheet" calls print() with the sheet', await $(`window.__printed`) === 1 && await $(`document.body.dataset.print`) === 'sheet');
    const sheetPdf = async (name) => {
      const file = path.join(out, name);
      fs.writeFileSync(file, await b.pdf());
      return pdfText(file).split('\f');
    };
    let pages = await sheetPdf('worksheet.pdf');
    let keyAt = pages.findIndex((x) => x.includes(S.SHEET.answerKey));
    let firstLine = keyAt < 0 ? '' : pages[keyAt].split('\n').find((l) => l.trim()).trim();
    const keyPage = `page ${keyAt}: ${firstLine}`;
    const keyOwnPage = keyAt > 0 && firstLine === S.SHEET.answerKey;
    let front = pages.slice(0, keyAt < 0 ? undefined : keyAt).join('\n');
    let gaps = between(front, S.SHEET.gapFill, S.PAGE.while);
    const numbers = [...gaps.matchAll(/^\s*(\d+)\.\s/gm)].map((m) => Number(m[1]));
    check('the PDF numbers its items 1 to n, as worksheet.js does', JSON.stringify(numbers) === JSON.stringify(want.items.map((it) => it.number)), `${numbers} vs ${want.items.length}`);
    const several = want.items.flatMap((it) => it.parts.filter((x) => typeof x !== 'string' && x.label !== String(it.number)).map((x) => x.label));
    const shown = [...gaps.matchAll(/(?<![\w])(\d+[a-d])(?![\w])/g)].map((m) => m[1]);
    check('and labels the gaps of a shared sentence 3a, 3b, in order', several.length > 0 && JSON.stringify(shown) === JSON.stringify(several), `${shown} vs ${several}`);
    const keyText = keyAt < 0 ? '' : pages.slice(keyAt).join('\n');
    check('the key holds every gap\'s answer, by label', want.key.every((k) => new RegExp(`(^|\\s)${k.label}\\s+${escapeRe(k.answer)}(\\s|$)`, 'm').test(keyText)), keyText.slice(0, 600));
    check('no unticked word in the PDF\'s bank or key', offWords.every((w) => !wholeWord(w).test(between(front, S.SHEET.wordBank, S.SHEET.gapFill)) && !wholeWord(w).test(keyText)), offWords.join(' '));
    check('the PDF holds the one question and not the empty sections', front.includes(WHILE) && front.includes(S.PAGE.while) && !front.includes(S.PAGE.before) && !front.includes(S.PAGE.after));
    check('an answer used twice: the PDF says some words are used more than once', want.repeats === true && front.includes(S.SHEET.repeats));
    const outsideBank = front.replace(between(front, S.SHEET.wordBank, S.SHEET.gapFill), '');
    let leaks = want.bank.filter((a) => wholeWord(a).test(outsideBank));
    check('no answer is un-blanked before the key (full text off)', leaks.length === 0, leaks.join(' '));

    // The key's page break, whatever the text's length: a sheet of one item
    // fits page 1, so its key starts page 2 only if the break is there.
    const lone = newsDeck.findIndex((_, i) => i > 0 && build(newsDeck.map((_, k) => k === i), { fullText: false, answerKey: true }).items.length === 1);
    await $(`${id('none')}.click()`);
    if (lone > 0) await $(`document.querySelector('#keep-${lone}').click()`);
    await $(`${id('print-sheet')}.click()`);
    const short = await sheetPdf('worksheet-one-item.pdf');
    const shortAt = short.findIndex((x) => x.includes(S.SHEET.answerKey));
    const shortFirst = shortAt < 0 ? '' : short[shortAt].split('\n').find((l) => l.trim()).trim();
    check('the answer key starts a page of its own', keyOwnPage && lone > 0 && shortAt === 1 && shortFirst === S.SHEET.answerKey && short[0].includes(S.SHEET.gapFill),
      `${keyPage}; one item (card ${lone}): page ${shortAt}: ${shortFirst}`);
    await $(`${id('all')}.click()`);
    for (const i of offAt) await $(`document.querySelector('#keep-${i}').click()`);

    // Full text on: the answers may show in the text, the bank and the key,
    // and nowhere else.
    await $(`${id('opt-full-text')}.click()`);
    const withText = model({ fullText: true, answerKey: true });
    check('"Include the full text" puts the text on the sheet', (await onPage()).paragraphs === withText.paragraphs.length && withText.paragraphs.length > 0);
    // Nothing reads as a heading at a page's foot: each heading-like line of
    // the text shares a .keep with the next, as does each heading but the
    // key's with what follows it, and print.css never splits a .keep.
    const pairs = Sheet.keptPairs(withText.paragraphs);
    const kept = await $(`(() => {
      const sheet = document.querySelector('#sheet');
      const rule = [...document.styleSheets].filter((s) => /print\\.css$/.test(s.href || ''))
        .flatMap((s) => [...s.cssRules]).find((r) => r.selectorText === '.sheet .keep');
      return {
        text: [...sheet.querySelectorAll('.full-text .keep')].map((k) => [...k.children].map((c) => c.tagName + ':' + c.textContent)),
        heads: [...sheet.querySelectorAll('h2')].filter((h) => !h.closest('.key, .full-text'))
          .map((h) => h.parentElement.classList.contains('keep') && h.parentElement.firstElementChild === h && h.nextElementSibling !== null),
        item: sheet.querySelector('.gap-fill .keep .item') === sheet.querySelector('.gap-fill .item'),
        avoid: rule ? rule.style.breakInside : null
      };
    })()`);
    check('print: each heading-like line of the text is kept with the next line, never split', pairs.length > 0 && kept.avoid === 'avoid' &&
      JSON.stringify(kept.text) === JSON.stringify(pairs.map((i) => [`P:${withText.paragraphs[i]}`, `P:${withText.paragraphs[i + 1]}`])), JSON.stringify(kept));
    check('print: each section heading is kept with what follows it, the gap fill\'s with its first item', kept.heads.length >= 3 && kept.heads.every(Boolean) && kept.item, JSON.stringify(kept));
    await $(`${id('print-sheet')}.click()`);
    pages = await sheetPdf('worksheet-full-text.pdf');
    // A guard, not a proof: it bites only where a page break falls at one.
    const headings = new Set([...pairs.map((i) => withText.paragraphs[i].trim()), S.SHEET.wordBank, S.SHEET.gapFill, S.PAGE.while]);
    const feet = pages.slice(0, -1).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) || '');
    check('print: no page of the PDF ends with a heading or a heading-like line', feet.every((f) => !headings.has(f)), JSON.stringify(feet));
    keyAt = pages.findIndex((x) => x.includes(S.SHEET.answerKey));
    front = pages.slice(0, keyAt < 0 ? undefined : keyAt).join('\n');
    // The text has no heading: it starts after the header's Date line, and
    // its first words are the first line's.
    const textAt = front.indexOf(S.SHEET.date) + S.SHEET.date.length;
    const opening = new RegExp(withText.paragraphs[0].trim().split(/\s+/).slice(0, 3).map(escapeRe).join('\\s+'));
    const regions = {
      header: front.slice(0, textAt),
      gaps: between(front, S.SHEET.gapFill, S.PAGE.while),
      questions: between(front, S.PAGE.while)
    };
    leaks = Object.entries(regions).flatMap(([where, t]) => want.bank.filter((a) => wholeWord(a).test(t)).map((a) => `${where}: ${a}`));
    check('with the full text, answers show only in the text, the bank and the key', keyAt > 0 && leaks.length === 0 && regions.gaps.length > 0 &&
      want.bank.every((a) => wholeWord(a).test(front.slice(textAt, front.indexOf(S.SHEET.wordBank)))), leaks.join(' | '));
    check('the full text comes between the header and the word bank', front.includes(S.SHEET.date) && front.indexOf(SHEET_TITLE) < textAt &&
      opening.test(front.slice(textAt, front.indexOf(S.SHEET.wordBank))), opening.source);
    await $(`${id('opt-full-text')}.click()`);

    // "Include answer key" off: no key on the page or the paper.
    await $(`${id('opt-answer-key')}.click()`);
    pages = await sheetPdf('worksheet-no-key.pdf');
    check('unticking "Include answer key" leaves the key out', await $(`!document.querySelector('#sheet .key')`) && !pages.join('\n').includes(S.SHEET.answerKey));
    await $(`${id('opt-answer-key')}.click()`);

    // ---- the Pro deck ---------------------------------------------------------------------
    // The settings say cloze and "Year 9 autumn"; the first ticked card is set
    // to plain with its own control (deck -> gap -> plain).
    await $(`(() => { const s = document.querySelector('#style-1'); s.click(); s.click(); })()`);
    // Not cleared: the project file the next section opens is in there, and no CSV is.
    await $(`${id('export-csv')}.click()`);
    const proCsv = await landed(downloads, /\.csv$/);
    if (proCsv) {
      fs.copyFileSync(proCsv, path.join(out, 'export-pro.csv'));
      const recs = parseCsv(fs.readFileSync(proCsv, 'utf8').slice(1));
      const rows = recs.filter((r) => !r[0].startsWith('#'));
      const kept = newsDeck.filter((_, i) => !offAt.includes(i));
      check('Pro: the CSV is a cloze deck with the bold word, the own tag, and the one card set to plain', recs.some((r) => r[0] === '#html:true') &&
        recs.some((r) => r[0] === '#tags:ascham Year-9-autumn') && rows.length === kept.length && rows[0][0] === 'Basic' && /<b>/.test(rows[0].join(' ')) &&
        rows.slice(1).every((r) => r[0] === 'Cloze' && r.join(' ').includes('{{c1::')), JSON.stringify(recs.slice(0, 8)));
    } else {
      check('Pro: the CSV lands', false);
    }

    // ---- opening a project over unsaved text --------------------------------------------------
    // The box holds the news paste, never saved: opening asks in the page,
    // with "Keep my text" focused; Escape and "Keep my text" keep it.
    if (projPath) {
      const asked = () => $(`({ open: ${id('confirm')}.open, focus: document.activeElement.id, text: ${id('confirm-text')}.textContent, kept: ${id('paste')}.value === ${JSON.stringify(box)} && ${id('title')}.value === ${JSON.stringify(SHEET_TITLE)} })`);
      await b.chooseFile('#open', projPath);
      await sleep(600);
      const first = await asked();
      check('opening over unsaved text asks in the page, "Keep my text" focused', first.open && first.focus === 'confirm-no' && first.text === S.PAGE.confirmReplace && first.kept, JSON.stringify(first));
      await b.shot(path.join(out, '6-confirm-desktop.png'));
      await b.escape();
      await sleep(200);
      const esc = await asked();
      check('Escape keeps the text', !esc.open && esc.kept, JSON.stringify(esc));
      await b.chooseFile('#open', projPath);
      await sleep(600);
      await $(`${id('confirm-no')}.click()`);
      const no = await asked();
      check('"Keep my text" keeps it', !no.open && no.kept, JSON.stringify(no));
      await b.chooseFile('#open', projPath);
      await sleep(600);
      await $(`${id('confirm-yes')}.click()`);
      await sleep(400);
      check('"Replace my text" opens the project', !(await asked()).open && await $(`${id('paste')}.value === ${JSON.stringify(saved && saved.text)}`) && JSON.stringify(await faces()) === JSON.stringify(deck));
      await b.chooseFile('#open', projPath);
      await sleep(600);
      check('text just opened from a file is not asked about again', !(await $(`${id('confirm')}.open`)) && JSON.stringify(await faces()) === JSON.stringify(deck));
      await $(`(() => { const t = ${id('paste')}; t.value += ' Edited.'; t.dispatchEvent(new Event('input')); })()`);
      await b.chooseFile('#open', projPath);
      await sleep(600);
      check('but an edit to it is', await $(`${id('confirm')}.open`));
      await $(`${id('confirm-no')}.click()`);
    }

    // ---- leaving with unsaved work, and "Start again" ----------------------------------------
    // The edited text above is unsaved: leaving asks. Opening the project,
    // then saving, leave nothing unsaved; an untick is unsaved work again.
    if (projPath) {
      check('leaving with unsaved text asks first', await leaving());
      await b.chooseFile('#open', projPath);
      await sleep(600);
      await $(`${id('confirm-yes')}.click()`);
      await sleep(600);
      check('a project just opened does not ask', !(await leaving()));
      await $(`document.querySelector('#cards tbody input').click()`);
      check('an untick after it does', await leaving());
      clear(downloads);
      await $(`${id('save')}.click()`);
      check('and once saved it does not', !(await leaving()));
      await landed(downloads, /\.json$/);
    }
    const stored = () => $(`({ settings: localStorage.getItem('ascham.settings'), licence: localStorage.getItem('ascham.licence'), state: ${id('licence-state')}.textContent })`);
    const onReset = () => $(`({
      open: ${id('reset-confirm')}.open, focus: document.activeElement.id, text: ${id('reset-confirm-text')}.textContent,
      fields: [${id('paste')}, ${id('title')}, ${id('source-field')}, ...document.querySelectorAll('input[data-q]')].map((f) => f.value).join(''),
      results: ${id('results')}.hidden, worksheet: ${id('worksheet')}.hidden,
      boxes: [${id('keep-breaks')}.checked, ${id('opt-full-text')}.checked, ${id('opt-answer-key')}.checked]
    })`);
    await b.paste(box);
    await $(`(() => { ${id('title')}.value = ${JSON.stringify(SHEET_TITLE)}; ${id('keep-breaks')}.click(); ${id('opt-full-text')}.checked = true; const q = document.querySelector('input[data-q="after"]'); q.value = 'Why?'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await press();
    const storedBefore = await stored();
    const work = JSON.stringify(await onReset());
    const same = async () => { const p = await onReset(); delete p.open; delete p.focus; const w = JSON.parse(work); delete w.open; delete w.focus; return JSON.stringify(p) === JSON.stringify(w); };
    await $(`${id('reset')}.click()`);
    const resetAsked = await onReset();
    check('"Start again" over unsaved work asks first, "Keep my work" focused', resetAsked.open && resetAsked.focus === 'reset-no' && resetAsked.text === S.PAGE.confirmReset && await same(), JSON.stringify(resetAsked));
    await b.shot(path.join(out, '7-start-again-desktop.png'));
    await b.escape();
    await sleep(200);
    check('Escape keeps the work', !(await onReset()).open && await same(), JSON.stringify(await onReset()));
    await $(`${id('reset')}.click()`);
    await $(`${id('reset-no')}.click()`);
    check('"Keep my work" keeps it', !(await onReset()).open && await same(), JSON.stringify(await onReset()));
    await $(`${id('reset')}.click()`);
    await $(`${id('reset-yes')}.click()`);
    await sleep(300);
    const cleared = await onReset();
    check('"Clear the page" empties the page and puts its choices back', !cleared.open && cleared.fields === '' && cleared.results && cleared.worksheet &&
      JSON.stringify(cleared.boxes) === JSON.stringify([true, false, true]), JSON.stringify(cleared));
    check('and keeps the settings and the licence key', JSON.stringify(await stored()) === JSON.stringify(storedBefore) && storedBefore.licence !== null, JSON.stringify(storedBefore));
    check('and a cleared page does not ask before it is left', !(await leaving()));
    // In Chrome, the browser's own dialog: a reload over unsaved text asks.
    await b.paste('The ombudsman investigated the allegations thoroughly.');
    const asked0 = b.leaves();
    await b.open(`${ORIGIN}/app/`);
    if (asked0 !== null) check('a reload over unsaved text shows the browser\'s own dialog', b.leaves() === asked0 + 1, `${asked0} -> ${b.leaves()}`);

    // ---- hostile project files ------------------------------------------------------------
    const { dir: files, stop: dropped } = scratch('ascham-hostile-');
    dropFiles = dropped;
    const good = JSON.parse(Project.serialise({ title: 't', source: 's', text: 'The ombudsman investigated thoroughly.', lineBreaks: true, selection: { from: 0, to: 0 }, unticked: [] }));
    const { questions: _q, worksheet: _w, ...v1 } = { ...good, version: 1 };
    const EVIL = '<img src=z onerror=alert(7)><script>alert(8)</script>';
    const asking = (before) => ({ ...good, questions: { ...good.questions, before } });
    const hostile = {
      'html.json': [JSON.stringify({ ...good, title: EVIL, source: EVIL, text: `The ombudsman ${EVIL} investigated the scrupulous allegations.`, questions: { before: [EVIL], while: [], after: [] } }), null],
      'v1.json': [JSON.stringify(v1), 'opens'],
      'v1-with-questions.json': [JSON.stringify({ ...v1, questions: good.questions }), S.MESSAGES.DAMAGED],
      'six-questions.json': [JSON.stringify(asking(Array(6).fill('Why?'))), S.MESSAGES.DAMAGED],
      'long-question.json': [JSON.stringify(asking(['x'.repeat(Sheet.MAX_QUESTION + 1)])), S.MESSAGES.DAMAGED],
      'empty-question.json': [JSON.stringify(asking([''])), S.MESSAGES.DAMAGED],
      'question-type.json': [JSON.stringify(asking([{ toString: 'x' }])), S.MESSAGES.DAMAGED],
      'extra-section.json': [JSON.stringify({ ...good, questions: { ...good.questions, during: [] } }), S.MESSAGES.DAMAGED],
      'option-type.json': [JSON.stringify({ ...good, worksheet: { fullText: 'yes', answerKey: true } }), S.MESSAGES.DAMAGED],
      'extra-key.json': [JSON.stringify({ ...good, cards: [{ word: 'forged' }] }), S.MESSAGES.DAMAGED],
      'wrong-type.json': [JSON.stringify({ ...good, lineBreaks: 'yes' }), S.MESSAGES.DAMAGED],
      'offsets.json': [JSON.stringify({ ...good, selection: { from: 0, to: 9999 } }), S.MESSAGES.DAMAGED],
      'not-json.json': ['<html><body onload=alert(9)>', S.MESSAGES.NOT_PROJECT],
      'newer.json': [JSON.stringify({ ...good, version: 3 }), S.MESSAGES.NEWER],
      'huge.json': [' '.repeat(Project.MAX_FILE_BYTES + 1), S.MESSAGES.TOO_BIG]
    };
    for (const [name, [contents, message]] of Object.entries(hostile)) {
      const p = path.join(files, name);
      fs.writeFileSync(p, contents);
      await b.open(`${ORIGIN}/app/`);
      await b.chooseFile('#open', p);
      await sleep(600);
      const status = await $(`${id('status')}.textContent`);
      if (message === 'opens') {
        check('a version 1 project opens, with no questions and the default options', await $(`document.querySelectorAll('#cards tbody tr').length > 0 && !${id('opt-full-text')}.checked && ${id('opt-answer-key')}.checked && !${id('questions')}.open && [...document.querySelectorAll('input[data-q]')].every((q) => q.value === '')`), status);
      } else if (message) {
        check(`a hostile project is refused: ${name}`, status === message && await $(`${id('results')}.hidden && ${id('paste')}.value === ''`), status);
      } else {
        const shown = await $(`({ title: ${id('title')}.value, text: ${id('paste')}.value, deck: ${id('deck-title')}.textContent, sentence: (document.querySelector('#cards td.sentence') || {}).textContent,
          question: document.querySelector('input[data-q="before"]').value, asked: (document.querySelector('#sheet .asked li') || {}).textContent, sheet: (document.querySelector('#sheet h1') || {}).textContent })`);
        check('a project carrying markup opens as plain text, its question too', shown.title === EVIL && shown.deck === EVIL && shown.sentence && shown.sentence.includes(EVIL) &&
          shown.question === EVIL && shown.asked === EVIL && shown.sheet === EVIL && (await injected()).length === 0 && await handlers(), JSON.stringify(shown));
      }
    }
    await dropFiles();

    // ---- storage, after everything above --------------------------------------------------
    const stores = await $(`(async () => ({
      local: Object.entries(localStorage),
      session: sessionStorage.length,
      cookie: document.cookie,
      idb: indexedDB.databases ? (await indexedDB.databases()).length : 0,
      caches: (await caches.keys()).length
    }))()`);
    check('no browser store holds the passage', !JSON.stringify(stores).includes(MARKER) &&
      stores.session === 0 && stores.cookie === '' && stores.idb === 0 && stores.caches === 0, JSON.stringify(stores));
    check('and that holds with the licence key and the Pro settings saved', JSON.stringify(stores.local.map(([k]) => k).sort()) === JSON.stringify(['ascham.licence', 'ascham.settings']), JSON.stringify(stores.local));

    // ---- keyboard ---------------------------------------------------------------------------
    await b.open(`${ORIGIN}/app/`);
    await b.paste('The ombudsman investigated the allegations thoroughly. Critics called the gerrymandering scrupulous.');
    await press();
    // From the first control onward, once: Tab past the last one leaves the
    // page for the browser's own controls, which is not the page's doing.
    // The questions sit in a closed <details>, so only its summary is a stop.
    await $(`${id('paste')}.focus()`);
    const cycle = ['paste:-'];
    let ring = 'not reached';
    let openRing = 'not reached';
    for (let i = 0; i < 40; i++) {
      await b.tab();
      const [at, outline, label] = await $(`[document.activeElement.id || document.activeElement.tagName, getComputedStyle(document.activeElement).outlineStyle, getComputedStyle(document.querySelector('label[for="open"]')).outlineStyle]`);
      cycle.push(`${at}:${outline}`);
      if (at === 'read') ring = outline;
      if (at === 'open') openRing = label;
    }
    const order = cycle.map((c) => c.split(':')[0]);
    const tabs = ['paste', 'title', 'source-field', 'keep-breaks', 'read', 'all', 'none', 'door', 'keep-0', 'style-0', 'export-csv', 'print-list', 'print-sheet',
      'opt-full-text', 'opt-answer-key', 'SUMMARY', 'save', 'open', 'reset', 'settings-summary'];
    check('every control is reachable by Tab, in order', tabs.every((x, i) => order.indexOf(x) >= 0 && (i === 0 || order.indexOf(x) > order.indexOf(tabs[i - 1]))), order.join(' '));
    check('focus is visible on a control reached by Tab', ring !== 'none' && ring !== 'not reached', cycle.join(' '));
    check('and on "Open a saved project", drawn on its label', openRing !== 'none' && openRing !== 'not reached', `${openRing}; ${cycle.join(' ')}`);

    // ---- Remove key ------------------------------------------------------------------------------
    // Before: the whole sheet of the news paste, key and all. After: the
    // sample again, nothing of the whole sheet left on the page.
    await $(`${id('paste')}.value = ${JSON.stringify(box)}`);
    await press();
    await sleep(300);
    const keyed = await onPage();
    await $(`(() => { ${id('settings')}.open = true; ${id('key-remove')}.click(); })()`);
    await sleep(400);
    const unkeyed = await onPage();
    check('"Remove key": the whole sheet on screen goes back to the sample', keyed.keys === 1 && keyed.items.length > SAMPLE_ITEMS && keyed.sample === '' &&
      isSample(unkeyed), `${JSON.stringify(keyed)} -> ${JSON.stringify(unkeyed)}`);
    const removed = await proState();
    check('"Remove key": the free version again, said plainly, Pro controls off with their lines, the key gone', removed.state === S.LICENCE.missing &&
      removed.printSheet && removed.lines.length === 5 && removed.upgrade === S.PAGE.upgrade && await $(`localStorage.getItem('ascham.licence')`) === null &&
      await $(`document.querySelectorAll('#cards button.style').length`) === 0, JSON.stringify(removed));
    // Free, by keyboard: Print worksheet is still a Tab stop, and says why it is off.
    await $(`${id('print-list')}.focus()`);
    await b.tab();
    check('free: Print worksheet is reached by Tab, and its "Part of Pro." line is its description', await $(`(() => {
      const a = document.activeElement;
      return a.id === 'print-sheet' && a.getAttribute('aria-disabled') === 'true' &&
        document.getElementById(a.getAttribute('aria-describedby')).textContent;
    })()`) === S.PAGE.proLine);
    await b.shot(path.join(out, '8-settings-free-desktop.png'));
    check('the paste box describes itself by both help lines, the paste tip second', await $(`${id('paste')}.getAttribute('aria-describedby').split(' ').map((x) => document.getElementById(x).textContent)`)
      .then((t) => JSON.stringify(t) === JSON.stringify([S.PAGE.pasteHelp, S.PAGE.pasteTip])));

    // ---- phone width -------------------------------------------------------------------------
    await b.viewport(375, 800);
    await sleep(300);
    const width = await $(`[document.documentElement.clientWidth, document.documentElement.scrollWidth]`);
    check('no horizontal scroll at 375px', width[0] <= 400 && width[1] <= width[0], JSON.stringify(width));
    await b.shot(path.join(out, '4-phone.png'));

    // ---- the origin, the console ----------------------------------------------------------------
    const asked = await b.requests();
    const off = asked.filter((u) => !u.startsWith(`${ORIGIN}/`) && !u.startsWith(`blob:${ORIGIN}/`) && !u.startsWith('data:'));
    check('every request stayed on the origin', off.length === 0, off.join(' '));
    // On the origin is not enough: a request to our own host must not carry
    // the text either (PROMISES.md promise 1, check.sh N4).
    const carried = asked.filter((u) => u.toLowerCase().includes(MARKER.toLowerCase()));
    check('no request carries the passage', asked.length > 0 && carried.length === 0, carried.join(' '));
    // Nor the licence key (promise 5), saved above, so most of the session runs
    // with it held. Its signature is base64url, which no URL escaping changes.
    const signed = asked.filter((u) => u.includes(LICENCE_KEYS.valid1.split('.')[2]));
    check('no request carries the licence key', asked.length > 0 && signed.length === 0, signed.join(' '));
    const noisy = (await b.problems()).filter((l) => !/frame-ancestors.*(ignored when delivered via a <meta> element|not supported when delivered via meta)/i.test(l));
    check('no dialog, no CSP violation, a quiet console (bar the meta frame-ancestors note)', noisy.length === 0, noisy.join(' | '));
  } catch (e) {
    check('the run finished', false, e.stack);
  } finally {
    await b.close();
    await dropDownloads();
    await dropFiles();
  }
}

// dist/, copied, with the test-only public key in place of ISSUER: the one
// edit, made exactly once or the run stops.
const { dir: SITE, stop: dropSite } = scratch('ascham-site-');
fs.cpSync(path.join(ROOT, 'dist'), SITE, { recursive: true });
const LC = path.join(SITE, 'src/core/licence-core.js');
const lc = fs.readFileSync(LC, 'utf8');
const issuerAt = lc.match(/^const ISSUER = [^;]*;/gm) || [];
if (issuerAt.length !== 1) {
  await dropSite();
  console.log(`BROKEN: licence-core.js has ${issuerAt.length} ISSUER declarations; want 1`);
  process.exit(2);
}
fs.writeFileSync(LC, lc.replace(issuerAt[0], `const ISSUER = ${JSON.stringify(TEST_ISSUER)};`));
const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs'), String(PORT), `--root=${SITE}`], { stdio: ['ignore', 'pipe', 'pipe'] });
const stopServer = async () => {
  live.delete(stopServer);
  if (server.exitCode === null && server.signalCode === null) { server.kill(); await new Promise((r) => server.once('exit', r)); }
};
live.add(stopServer);
// This run's own server or none: a leftover server on the port would answer
// with whatever site it was started on, and every check would test that.
let said = '';
const up = await new Promise((resolve) => {
  server.stdout.on('data', (d) => { said += d; if (said.includes(`:${PORT}/`)) resolve(true); });
  server.stderr.on('data', (d) => { said += d; });
  server.on('exit', () => resolve(false));
  setTimeout(() => resolve(false), 5000);
});
if (!up) {
  await stopServer();
  await dropSite();
  console.log(`BROKEN: the test server did not start on port ${PORT}\n${said.split('\n').find((l) => /EADDRINUSE|Error/.test(l)) || ''}`);
  process.exit(2);
}
let broken = '';
try {
  if (WHICH !== 'firefox') await run(chromeDriver, 9361);
  if (WHICH !== 'chrome') await run(firefoxDriver, 2861);
} catch (e) {
  if (!e.message.startsWith('BROKEN:')) throw e;
  broken = e.message;
} finally {
  await stopServer();
  await dropSite();
}
// Stopped from outside: the handler reports and exits, not this.
if (stopping) await new Promise(() => {});
prefix = '';
if (broken) { console.log(broken); process.exit(2); }
console.log(`# evidence: ${EVIDENCE}`);
console.log(failed ? `browser: FAIL (${failed} failing)` : `browser: PASS (${WHICH === 'all' ? 'Chrome and Firefox' : WHICH})`);
process.exit(failed ? 1 : 0);
