// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The files a teacher can save: the Anki CSV and the project.
// Pure: each function returns { name, type, text } and download.js writes it.
// Nothing here touches the DOM, so the harness builds exactly the bytes the
// page offers.

import * as Csv from '../core/csv-core.js';
import * as Project from './project.js';

// The CSV: csv-core.js unchanged, fed only the ticked cards.
//
// TAGS. csv-core tags a deck `<SLUG> <slug of source.title>` (SLUG from
// src/core/brand.js) and falls back to `<SLUG> deck` when the title slugs to nothing. The web app has no URL,
// so the title field is the deck's title, or the source field when the title
// is empty; both empty gives csv-core's own floor, `<SLUG> deck`. The
// filename follows the same title, with csv-core's `deck` floor.
//
// PRO, as the extension's popup built it: `pro` is { paid, settings }, from pro.js. Paid,
// the deck is written as markup (the bold target word), in the settings' card
// style and deck tag, and a card the teacher set to cloze or Basic in the
// review table (`styles[i]` true or false) overrules the deck. Anything else
// is the free Basic deck: csv-core ands every one of those with `html`, so
// nothing here can put a Pro string into a free deck.
function csvFile({ cards, keep, title, source, styles = [] }, when = Date.now(), pro = {}) {
  const named = { title: (title || '').trim() || (source || '').trim() };
  const paid = pro.paid === true;
  const settings = paid && pro.settings ? pro.settings : {};
  const ticked = [];
  cards.forEach((card, i) => {
    if (keep[i] !== true) return;
    const asked = paid ? styles[i] : undefined;
    ticked.push(asked === true || asked === false ? { ...card, cloze: asked } : card);
  });
  return {
    name: Csv.filename(named, when, 'csv'),
    type: 'text/csv;charset=utf-8',
    text: Csv.build(ticked, named, paid ? { html: true, cloze: settings.cloze === true, tag: settings.tag || '' } : {})
  };
}

// The project: the text that made the deck, its selection and line-break
// choice, the title and source, the words the teacher unticked, and the
// worksheet's questions and options. Named by
// csv-core's convention, `<SLUG>_<title>_<date>`, with .json for .csv,
// because that convention is how a teacher finds anything the product wrote.
function projectFile({ cards, keep, title, source, text, lineBreaks, selection, questions, worksheet }, when = Date.now()) {
  const named = { title: (title || '').trim() || (source || '').trim() };
  return {
    name: Csv.filename(named, when, 'csv').replace(/\.csv$/, '.json'),
    type: 'application/json',
    text: Project.serialise({
      title: title || '',
      source: source || '',
      text,
      lineBreaks,
      selection,
      unticked: [...new Set(cards.filter((_, i) => keep[i] !== true).map((c) => c.word))],
      questions,
      worksheet
    })
  };
}

export { csvFile, projectFile };
