// (v105) the collection's cars: the simplifying is done here, off the page's own thread (see lod.js, lod-core.js)
import { simplifyParts } from './lod-core.js?b=db59b25b3c';
self.onmessage = async (e) => {
  const { id, parts, target } = e.data;
  try {
    const out = await simplifyParts(parts, target);
    self.postMessage({ id, parts: out }, out.flatMap((p) => [p.pos.buffer, p.nor.buffer, p.col.buffer, p.idx.buffer]));
  } catch (err) { self.postMessage({ id, error: String(err) }); }
};
