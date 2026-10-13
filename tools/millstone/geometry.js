// Furrow layout for the Webb's Mill style stone, in units of the stone radius (centre 0,0, y down).
(function (root) {
  const G = {
    N: 8,         // harps
    rEye: 0.22,   // eye radius (kept small, like the earlier marks)
    a: 0.19,      // master furrow offset (the draft)
    s: 0.15,      // journeyman spacing
    w: 0.03,      // furrow width
    J: 3,         // journeymen per harp
    reach: 1.06,  // furrows run past the rim and are trimmed by it
  };
  const rot = ([x, y], deg) => {
    const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    return [x * c - y * s, x * s + y * c];
  };
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
  const mul = (p, k) => [p[0] * k, p[1] * k];
  function intersect(p, d, q, e) {
    const det = -d[0] * e[1] + e[0] * d[1];
    const qp = sub(q, p);
    const t = (-qp[0] * e[1] + e[0] * qp[1]) / det;
    return add(p, mul(d, t));
  }
  function furrows(g) {
    g = Object.assign({}, G, g || {});
    const out = [];
    const step = 360 / g.N;
    for (let k = 0; k < g.N; k++) {
      const d = rot([0, -1], k * step);
      const n = rot([-1, 0], k * step);
      const dPrev = rot(d, -step);
      const nPrev = rot(n, -step);
      const mBase = mul(n, g.a);
      out.push({ harp: k, j: 0, A: mBase, B: add(mBase, mul(d, Math.sqrt(g.reach * g.reach - g.a * g.a))), d, n });
      for (let j = 1; j <= g.J; j++) {
        const off = g.a + j * g.s;
        if (off >= 0.97) break;
        const base = mul(n, off);
        const inner = intersect(base, d, mul(nPrev, g.a), dPrev);
        if (Math.hypot(inner[0], inner[1]) > 0.95) continue;
        out.push({ harp: k, j, A: inner, B: add(base, mul(d, Math.sqrt(g.reach * g.reach - off * off))), d, n });
      }
    }
    return out;
  }
  const api = { G, furrows, rot };
  root.MillstoneGeometry = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
