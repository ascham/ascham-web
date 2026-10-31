// PDF metadata for the paste fixtures: Chrome's printToPDF writes a document
// information dictionary (title, producer, creator, dates with a timezone).
// stripInfo() blanks it in place, keeping its length so the cross-reference
// offsets stay valid; metadataIn() lists any metadata left.
const KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Metadata'];

function infoObject(buf) {
  const s = buf.toString('latin1');
  const trailer = s.lastIndexOf('trailer');
  const ref = trailer < 0 ? null : s.slice(trailer).match(/\/Info\s+(\d+)\s+(\d+)\s+R/);
  if (!ref) return null;
  const at = s.search(new RegExp(`(^|[\\r\\n])${ref[1]}\\s+${ref[2]}\\s+obj\\b`));
  const open = s.indexOf('<<', at);
  const close = s.indexOf('endobj', open);
  const end = s.lastIndexOf('>>', close);
  if (at < 0 || open < 0 || end < open) throw new Error('pdf-meta: the Info object is not a plain dictionary');
  return { from: open + 2, to: end };
}

export function stripInfo(buf) {
  const out = Buffer.from(buf);
  const info = infoObject(out);
  if (info) out.fill(0x20, info.from, info.to);
  return out;
}

export function metadataIn(buf) {
  const s = buf.toString('latin1');
  const left = KEYS.filter((k) => new RegExp(`/${k}\\b`).test(s));
  const info = infoObject(buf);
  if (info && s.slice(info.from, info.to).trim()) left.push('Info dictionary not empty');
  return left;
}
