// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The product's name, and the only place it is written in src/ or public/
// (check.sh B1). Renaming the product changes NAME and SLUG; everything
// else, the page's wording and <title>, file names, the deck tag, the storage
// keys and the project format, is built from them.
//
// SLUG is lower case letters, digits and hyphens (tests/strings.test.js), so
// it is safe as a file name, an Anki tag and a storage key. Changing it also
// changes the project format and the storage keys, so project files,
// settings and a key saved under the old one are not recognised.

const NAME = 'Ascham';
const SLUG = 'ascham';

export { NAME, SLUG };
