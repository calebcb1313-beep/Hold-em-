/* courts.js — illustrated court cards. Pure SVG, scales with the card.
   Filled silhouettes first, line work second: it has to read at 34px and
   still look deliberate at 150px. */
(function (root) {
  'use strict';

  const INK = '#2f2216';
  const PAPER = '#f0dcb8';
  const DARK = '#3a2a1e';

  function frame(suit, sc) {
    return '<rect x="2.5" y="2.5" width="55" height="87" rx="2.4" fill="none" stroke="' + INK + '" stroke-opacity=".42"/>' +
      '<rect x="6" y="6" width="48" height="80" rx="1.4" fill="#f9efd8" fill-opacity=".55" stroke="' + INK + '" stroke-opacity=".18"/>' +
      '<path d="M9 86V47c0-13 9-22 21-22s21 9 21 22v39" fill="#e6cda2" fill-opacity=".3" stroke="' + INK + '" stroke-opacity=".22"/>' +
      '<path d="M9 24c4-6 8-9 12-10M51 24c-4-6-8-9-12-10" fill="none" stroke="' + INK + '" stroke-opacity=".15"/>' +
      '<text x="30" y="14" text-anchor="middle" font-size="7.5" fill="' + sc + '">' + suit + '</text>' +
      '<text x="30" y="85" text-anchor="middle" font-size="7.5" fill="' + sc + '">' + suit + '</text>';
  }

  function face() {
    return '<ellipse cx="30" cy="31" rx="10.5" ry="11.5" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="1.4"/>' +
      '<path d="M25.6 30.4c1.2 1.1 2.6 1.1 3.8 0M30.6 30.4c1.2 1.1 2.6 1.1 3.8 0" fill="none" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="M30 32.5v5l-2 1.6" fill="none" stroke="' + INK + '" stroke-width="1" stroke-linecap="round"/>' +
      '<path d="M27.5 41.5c1.7 1.2 3.3 1.2 5 0" fill="none" stroke="' + INK + '" stroke-width="1.1"/>';
  }

  function bust(fill, trim) {
    return '<path d="M10 88c1.5-16 8-25 20-25s18.5 9 20 25z" fill="' + fill + '" stroke="' + INK + '" stroke-width="1.4"/>' +
      '<path d="M23 50l7 7 7-7" fill="none" stroke="' + INK + '" stroke-width="1.2"/>' +
      (trim || '') +
      '<path d="M17 66c3 3 6 5 9 6M43 66c-3 3-6 5-9 6" fill="none" stroke="' + INK + '" stroke-width="1" opacity=".35"/>';
  }

  function king(sc) {
    return bust('#6b4a2e',
      '<path d="M13 77c5-4 11-6 17-6s12 2 17 6" stroke="#f0e3c6" stroke-width="3.2" fill="none"/>' +
      '<path d="M30 57v27" stroke="#e8d3ab" stroke-width="1" opacity=".3"/>') +
      '<path d="M18.5 30c-1.5 8 0 14 3 18M41.5 30c1.5 8 0 14-3 18" fill="none" stroke="' + DARK + '" stroke-width="2.4"/>' +
      '<path d="M21 36c0 9 4 15 9 17 5-2 9-8 9-17-3 2-6 3-9 3s-6-1-9-3z" fill="' + DARK + '" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M25 40c3-1 7-1 10 0" fill="none" stroke="#efe0c4" stroke-width="1.4"/>' +
      face() +
      '<path d="M17 22l4-10 4 6 5-10 5 10 4-6 4 10z" fill="#c9a15c" stroke="' + INK + '" stroke-width="1.3"/>' +
      '<circle cx="21" cy="20" r="1.2" fill="#7a2f2a"/><circle cx="30" cy="16" r="1.2" fill="#2f5e4a"/><circle cx="39" cy="20" r="1.2" fill="#7a2f2a"/>' +
      '<path d="M10 20v62" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M6 26h8M10 82l-3 5M10 82l3 5" stroke="' + INK + '" stroke-width="1.6" fill="none"/>' +
      '<circle cx="16" cy="70" r="2.6" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="1"/>' +
      '<path d="M46 58c2 4 4 8 4 13" fill="none" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M50 24v46M48 28h4" stroke="' + INK + '" stroke-width="1.4"/>';
  }

  function queen(sc) {
    return '<path d="M19 25c-4 9-4 21 0 31 2-5 2-11 3-16M41 25c4 9 4 21 0 31-2-5-2-11-3-16" fill="' + DARK + '" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M20 26c3-6 17-7 20 0" fill="' + DARK + '" stroke="' + INK + '" stroke-width="1"/>' +
      bust('#7a2f3a',
        '<path d="M21 62c4 5 6 6 9 6s5-1 9-6" fill="none" stroke="#f0e3c6" stroke-width="2.4"/>' +
        '<circle cx="26" cy="60" r="1" fill="#e8c98d"/><circle cx="30" cy="62" r="1" fill="#e8c98d"/><circle cx="34" cy="60" r="1" fill="#e8c98d"/>') +
      face() +
      '<path d="M21 22l3-7 3 5 3-8 3 8 3-5 3 7z" fill="#c9a15c" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<circle cx="30" cy="14" r="1.1" fill="#7a2f2a"/>' +
      '<path d="M22 44c2-2 5-2 8 0" fill="none" stroke="#a33440" stroke-width="1.6"/>' +
      '<path d="M45 52c3-5 8-5 9 0 1 4-4 7-7 4" fill="none" stroke="' + sc + '" stroke-width="1.5"/>' +
      '<circle cx="47" cy="50" r="2.4" fill="' + sc + '" fill-opacity=".75"/>' +
      '<path d="M45 56v12" stroke="' + INK + '" stroke-width="1.1"/>';
  }

  function jack(sc) {
    return bust('#3f5a45',
      '<path d="M20 57c5-4 15-4 20 0" fill="none" stroke="' + sc + '" stroke-width="3"/>' +
      '<path d="M30 57v25" stroke="#e8d3ab" stroke-width="1" opacity=".25"/>' +
      '<circle cx="30" cy="66" r="1.1" fill="#e8c98d"/><circle cx="30" cy="73" r="1.1" fill="#e8c98d"/>') +
      '<path d="M20 24c1-6 19-7 21 0l-2 3H21z" fill="' + DARK + '" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M17 27h27" stroke="' + INK + '" stroke-width="2.2"/>' +
      '<path d="M42 24c3-6 7-9 11-9-3 4-4 9-3 13" fill="none" stroke="' + INK + '" stroke-width="1.3"/>' +
      face() +
      '<path d="M22 47c5-3 11-3 16 0" fill="none" stroke="' + INK + '" stroke-width="1.3"/>' +
      '<path d="M48 18L36 84" stroke="' + INK + '" stroke-width="1.7"/>' +
      '<path d="M42 30l7-3M46 24l4 4" stroke="' + INK + '" stroke-width="1.4"/>' +
      '<circle cx="38" cy="70" r="2.3" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="1"/>';
  }

  function art(r, suit) {
    const s = ['\u2660', '\u2665', '\u2666', '\u2663'].indexOf(suit);
    const sc = (s === 1 || s === 2) ? '#a6352a' : '#20262a';
    const fig = r === 11 ? king(sc) : r === 10 ? queen(sc) : jack(sc);
    return '<div class="pips court"><svg class="court-art" viewBox="0 0 60 92" aria-hidden="true">' +
      frame(suit, sc) + fig + '</svg></div>';
  }

  root.Courts = { art: art };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Courts;
})(typeof self !== 'undefined' ? self : this);
