// Re-measures the "Keep line breaks" default on the paste fixtures. Dev
// tooling only, never shipped.
//
//   node scripts/measure-breaks.mjs [--show]
//
// Every single line break in a fixture is classed once, from the raw text:
//   WRAP   the break falls inside a sentence (the line goes on mid-sentence)
//   BLOCK  the break ends a block (headline, byline, caption, paragraph)
// Then each fixture runs through the page's own pipeline (analyse, whole text
// selected) in both modes, and a card's sentence counts as damaged when
//   keep: it starts or ends at a WRAP break (a cut-off fragment)
//   join: it runs across a BLOCK break whose block did not end a sentence
//         (two blocks glued into one "sentence")
// The classing is a heuristic; --show prints every break so it can be read.
// A web block that opens in lower case ("navigation box") is classed WRAP.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const show = process.argv.includes('--show');
const { analyse } = await import(path.join(repo, 'src/ui/pipeline.js'));
const Paste = await import(path.join(repo, 'src/core/paste.js'));
const dir = path.join(repo, 'tests/fixtures/paste');

const TERMINAL = /[.!?:]["'’”)\]]*$/;
const CARRIES_ON = /([,;–—(]|\w-|\b(the|a|an|of|to|in|on|at|by|for|from|with|and|or|but|that|which|is|was|are|were|be|its|his|her|their|this|as|than|into|upon|about)\b)$/i;

function breaks(raw) {
  // single line breaks only: a blank line is a boundary in both modes
  const out = [];
  const re = /[^\S\n]*\r?\n[^\S\n]*/g;
  let m;
  while ((m = re.exec(raw))) {
    const at = m.index, end = at + m[0].length;
    if (raw[end] === '\n' || raw[end] === '\r' || end >= raw.length) continue;
    const prevStart = raw.lastIndexOf('\n', at - 1) + 1;
    const before = raw.slice(prevStart, at).trimEnd();
    if (!before) continue;
    const next = raw.slice(end, raw.indexOf('\n', end) < 0 ? raw.length : raw.indexOf('\n', end));
    const wrap = !TERMINAL.test(before) && (/^[a-z]/.test(next) || CARRIES_ON.test(before));
    out.push({ at, end, kind: wrap ? 'WRAP' : 'BLOCK', ended: TERMINAL.test(before), before, next });
  }
  return out;
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
const total = { keep: 0, join: 0, known: 0, cards: { keep: 0, join: 0 } };
// The one misclassification the header names: a web block opening in lower case.
const KNOWN_MISS = (b) => b.kind === 'WRAP' && /^navigation box/.test(b.next);
console.log('fixture                 breaks  wrap block | cards keep/join | damaged keep  join');
for (const f of files) {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const bs = breaks(raw);
  const row = { keep: 0, join: 0, cards: {} };
  for (const mode of ['keep', 'join']) {
    const keepLineBreaks = mode === 'keep';
    const norm = Paste.normalise(raw, { keepLineBreaks });
    const r = analyse({ raw, keepLineBreaks });
    const cards = r.cards || [];
    row.cards[mode] = cards.length;
    const pos = bs.map((b) => ({ ...b, n: norm.map[b.at] }));
    for (const c of cards) {
      const { start, end } = c.sentence;
      let bad = false;
      if (mode === 'keep') {
        // a WRAP break became '\n' right at this sentence's start or end
        const at = pos.filter((b) => b.kind === 'WRAP' && (b.n === end || b.n + 1 === start));
        bad = at.length > 0;
        if (bad && at.every(KNOWN_MISS)) total.known++;
      } else {
        bad = pos.some((b) => b.kind === 'BLOCK' && !b.ended && b.n > start && b.n < end);
      }
      if (bad) {
        row[mode]++;
        if (show) console.log(`  ${mode} damaged [${f}] ${c.word}: ${JSON.stringify(c.sentence.text)}`);
      }
    }
  }
  if (show) for (const b of bs) console.log(`    ${b.kind.padEnd(5)} ${JSON.stringify(b.before.slice(-30))} | ${JSON.stringify(b.next.slice(0, 30))}`);
  const w = bs.filter((b) => b.kind === 'WRAP').length;
  console.log(`${f.padEnd(24)}${String(bs.length).padStart(6)}${String(w).padStart(6)}${String(bs.length - w).padStart(6)} | ${String(row.cards.keep).padStart(5)}/${String(row.cards.join).padEnd(5)}    | ${String(row.keep).padStart(12)}${String(row.join).padStart(6)}`);
  total.keep += row.keep; total.join += row.join;
  total.cards.keep += row.cards.keep; total.cards.join += row.cards.join;
}
console.log(`TOTAL cards ${total.cards.keep}/${total.cards.join}; damaged: keep ${total.keep} raw / ${total.keep - total.known} adjusted (${total.known} from the known Wikisource misclassification: "navigation box" classed WRAP), join ${total.join}`);
