// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The review table and the set-aside view, rebuilt from the
// extension's popup. The wording is in strings.js; this file decides what
// is shown and builds it.
//
// Everything a teacher pasted reaches the document through textContent and
// createElement, never markup (check.sh X1). Nothing here runs at import, so
// the harness can load it without a DOM.

import * as Words from '../core/wordlist.js';
import * as S from './strings.js';
import { keptPairs } from './worksheet.js';

// As in the extension's popup: the words behind each heading, band 2 first.
function wordsFor(declined, key) {
  if (!declined) return [];
  if (key === 'common') return [...declined.band2, ...declined.band1];
  return declined[key] || [];
}

// As in the extension's popup: zero means no door — a control that opens an empty room is worse
// than no control.
function declinedTotal(declined, withheld) {
  return S.GROUPS.reduce((n, g) => n + wordsFor(declined, g.key).length, 0)
    + (withheld || 0);
}

// ---- DOM -------------------------------------------------------------------

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

// The level chip, `~B2`, with the extension popup's explanation on hover and, for band 4,
// the word the popup put beside it.
function levelCell(tag, card) {
  const cell = el(tag, undefined, 'level');
  const chip = el('span', S.level(Words.LEVELS[card.band]), 'chip');
  chip.classList.add(`b${card.band}`);
  chip.title = S.LEVEL_TITLE;
  cell.append(chip);
  if (card.band === 4) cell.append(el('span', S.ACADEMIC, 'kind'));
  return cell;
}

const sentenceOf = (card) => (card.sentence ? card.sentence.text : S.NO_SENTENCE);

// As in the extension's popup: the per-card style control cycles deck → gap → plain → deck.
// A Map, because `undefined` is a real state here.
const NEXT_STYLE = new Map([[undefined, true], [true, false], [false, undefined]]);

function paintStyle(button, asked) {
  const [face, why] = S.STYLE_FACES.get(asked);
  button.textContent = face;
  button.title = why;
  button.className = 'style';
  button.classList.toggle('asked', asked !== undefined);
  button.setAttribute('aria-label', S.styleName(face));
}

// One row per card: the untick control, the card face, the ~level chip, the
// sentence. `keep` is the array the caller owns; `onChange` repaints the tally.
// `styles`, given only with Pro, is the per-card style the caller owns, and
// draws the popup's control beside each word; without it no control is drawn.
function renderRows(tbody, cards, keep, onChange, styles) {
  tbody.textContent = '';
  cards.forEach((card, i) => {
    const tr = el('tr');
    if (!keep[i]) tr.className = 'off';

    const tick = el('td', undefined, 'keep');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = keep[i];
    box.id = `keep-${i}`;
    box.setAttribute('aria-label', S.keepWord(card.word));
    box.addEventListener('change', () => {
      keep[i] = box.checked;
      tr.className = box.checked ? '' : 'off';
      onChange();
    });
    tick.append(box);

    const face = el('th', undefined, 'face');
    face.scope = 'row';
    const label = el('label', card.word);
    label.htmlFor = box.id;
    face.append(label);
    if (styles) {
      const style = el('button');
      style.type = 'button';
      style.id = `style-${i}`;
      paintStyle(style, styles[i]);
      style.addEventListener('click', () => {
        styles[i] = NEXT_STYLE.get(styles[i]);
        paintStyle(style, styles[i]);
      });
      face.append(style);
    }

    tr.append(tick, face, levelCell('td', card), el('td', sentenceOf(card), 'sentence'));
    tbody.append(tr);
  });
}

function renderDeclined(region, declined, withheld) {
  region.textContent = '';
  for (const group of S.GROUPS) {
    const words = wordsFor(declined, group.key);
    if (!words.length) continue;
    region.append(el('h3', group.heading), el('p', S.wordList(words)));
  }
  if (withheld > 0) region.append(el('p', S.withheldLine(withheld), 'withheld'));
}

// The printed list: the title and source, then the ticked cards only, as
// word, ~level and sentence. Kept in step with the deck rather than built at
// print time, so Ctrl+P and the button print the same thing.
function renderPrintout(region, { cards, keep, title, source }) {
  region.textContent = '';
  const kept = cards.filter((_, i) => keep[i]);
  region.hidden = kept.length === 0;
  if (!kept.length) return;
  region.append(el('h1', title || S.PRINT_UNTITLED));
  if (source) region.append(el('p', source, 'source'));
  const table = el('table');
  const head = el('tr');
  for (const key of ['colWord', 'colLevel', 'colSentence']) {
    const th = el('th', S.PAGE[key]);
    th.scope = 'col';
    head.append(th);
  }
  table.append(el('thead'), el('tbody'));
  table.tHead.append(head);
  for (const card of kept) {
    const tr = el('tr');
    const face = el('th', card.word, 'face');
    face.scope = 'row';
    tr.append(face, levelCell('td', card), el('td', sentenceOf(card), 'sentence'));
    table.tBodies[0].append(tr);
  }
  region.append(table, el('p', S.LEVEL_TITLE, 'legend'));
}

// The worksheet, from worksheet.js's model: the same element is the preview
// on screen and the sheet print.css prints. Every gap is one empty box of one
// width, holding only its label when its item has several, so its size says
// nothing about the word. Teacher text arrives by textContent like the rest.
// A heading-like line of the text and the line after it, and each heading
// and the first thing under it, share a .keep, which print.css keeps on one
// page.
const together = (...nodes) => {
  const k = el('div', undefined, 'keep');
  k.append(...nodes);
  return k;
};
function renderSheet(region, model) {
  region.textContent = '';
  if (!model || !model.items.length) return;
  const head = el('header', undefined, 'sheet-head');
  head.append(el('h1', model.title || S.SHEET.untitled));
  if (model.source) head.append(el('p', model.source, 'source'));
  const who = el('p', undefined, 'who');
  for (const label of [S.SHEET.name, S.SHEET.date]) {
    const field = el('span', undefined, 'fill');
    field.append(el('span', label), el('span', undefined, 'line'));
    who.append(field);
  }
  head.append(who);
  region.append(head);

  if (model.paragraphs) {
    const text = el('section', undefined, 'full-text');
    const lines = model.paragraphs;
    const pairs = new Set(keptPairs(lines));
    for (let i = 0; i < lines.length; i++) {
      if (pairs.has(i)) text.append(together(el('p', lines[i]), el('p', lines[++i])));
      else text.append(el('p', lines[i]));
    }
    region.append(text);
  }

  const bank = el('section', undefined, 'bank');
  const words = el('ul');
  for (const w of model.bank) words.append(el('li', w));
  bank.append(together(el('h2', S.SHEET.wordBank), words));
  region.append(bank);

  const fill = el('section', undefined, 'gap-fill');
  const top = together(el('h2', S.SHEET.gapFill), el('p', S.SHEET.gapFillHow, 'how'));
  if (model.repeats) top.append(el('p', S.SHEET.repeats, 'how'));
  fill.append(top);
  for (const item of model.items) {
    const p = el('p', undefined, 'item');
    p.append(el('span', S.itemNumber(item.number), 'n'), ' ');
    for (const part of item.parts) {
      if (typeof part === 'string') {
        p.append(part);
        continue;
      }
      const several = part.label !== String(item.number);
      const gap = el('span', several ? part.label : undefined, 'gap');
      gap.setAttribute('role', 'img');
      gap.setAttribute('aria-label', S.gapName(part.label));
      p.append(gap);
    }
    (item === model.items[0] ? top : fill).append(p);
  }
  region.append(fill);

  for (const section of ['before', 'while', 'after']) {
    const list = model.questions[section];
    if (!list.length) continue;
    const box = el('section', undefined, 'asked');
    const ol = el('ol');
    for (const q of list) ol.append(el('li', q));
    box.append(together(el('h2', S.PAGE[section]), ol));
    region.append(box);
  }

  if (model.key) {
    const key = el('section', undefined, 'key');
    key.append(el('h2', S.SHEET.answerKey));
    const ol = el('ul');
    for (const k of model.key) {
      const li = el('li');
      li.append(el('span', k.label, 'n'), ' ', el('span', k.answer, 'answer'));
      ol.append(li);
    }
    key.append(ol);
    region.append(key);
  }

  if (model.sample) region.append(el('p', S.SHEET.sample, 'sample'));
}

export { wordsFor, declinedTotal, renderRows, renderDeclined, renderPrintout, renderSheet };
