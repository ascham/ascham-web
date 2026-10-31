// A strict RFC 4180 reader, for tests only. CRLF between records, a final
// CRLF allowed; a field is either bare (no comma, quote, CR or LF) or wholly
// quoted with "" for a quote. Anything else throws, with the offset.
//
// Anki's directive lines (#separator:…) are records like any other here;
// the caller decides what they mean.
export function parseCsv(text, sep = ',') {
  const records = [];
  let i = 0;
  const n = text.length;
  const fail = (why) => { throw new Error(`RFC 4180: ${why} at offset ${i}`); };
  if (n === 0) return records;
  for (;;) {
    const record = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) fail('unterminated quoted field');
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          field += text[i++];
        }
        if (i < n && text[i] !== sep && text[i] !== '\r') fail('text after a closing quote');
      } else {
        while (i < n && text[i] !== sep && text[i] !== '\r') {
          if (text[i] === '"' || text[i] === '\n') fail('quote or bare LF in an unquoted field');
          field += text[i++];
        }
      }
      record.push(field);
      if (text[i] === sep) { i++; continue; }
      break;
    }
    records.push(record);
    if (i >= n) fail('missing final CRLF');
    if (text[i] !== '\r' || text[i + 1] !== '\n') fail('record not ended by CRLF');
    i += 2;
    if (i === n) return records;
  }
}
