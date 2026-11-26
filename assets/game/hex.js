/**
 * Geometria esagonale flat-top per il frontend (client-side).
 * Specifica conforme a hexgrid.py: coordinate assiali/cube, odd-q offset.
 */

export const HEX_RADIUS_M = 15.0; // raggio centro-vertice
const SQRT3 = Math.sqrt(3.0);

export function hexToPixel(q, r, radius = 24.0) {
  const x = radius * 1.5 * q;
  const y = radius * (SQRT3 / 2.0 * q + SQRT3 * r);
  return { x, y };
}

export function pixelToHex(x, y, radius = 24.0) {
  const fq = (2.0 / 3.0 * x) / radius;
  const fr = (-1.0 / 3.0 * x + SQRT3 / 3.0 * y) / radius;
  return hexRound(fq, fr);
}

export function hexRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  let s = Math.round(fs);

  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);

  if (dq > dr && dq > ds) {
    q = -r - s;
  } else if (dr > ds) {
    r = -q - s;
  }
  return { q, r };
}

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.floor((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2);
}

export function hexKey(q, r) {
  return `${q},${r}`;
}

export function parseHexKey(key) {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function toOffset(q, r) {
  const col = q;
  const row = r + Math.floor((q - (q & 1)) / 2);
  return { col, row };
}

export function fromOffset(col, row) {
  const q = col;
  const r = row - Math.floor((col - (col & 1)) / 2);
  return { q, r };
}
