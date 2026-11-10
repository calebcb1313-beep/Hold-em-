/* poker-core.js — cards, hand evaluation, equity, draws. No DOM.
   Card = rank*4 + suit. rank 0..12 (2..A), suit 0..3 (spades, hearts, diamonds, clubs). */
(function (root) {
  'use strict';

  const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];
  const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
  const RANK_CH = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SING = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const PLUR = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

  const makeDeck = () => { const d = []; for (let i = 0; i < 52; i++) d.push(i); return d; };

  function shuffle(a, rng) {
    rng = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function straightHigh(mask) {
    for (let h = 12; h >= 4; h--) {
      const m = 0x1F << (h - 4);
      if ((mask & m) === m) return h;
    }
    if ((mask & 0x100F) === 0x100F) return 3; // A-2-3-4-5
    return -1;
  }

  const mk = (cat, ks) => {
    let s = cat * 371293;
    const w = [28561, 2197, 169, 13, 1];
    for (let i = 0; i < ks.length; i++) s += ks[i] * w[i];
    return s;
  };

  // Works for 5, 6 or 7 cards. Higher score = better hand.
  function evaluate(cs) {
    const rc = new Array(13).fill(0), sc = [0, 0, 0, 0], sm = [0, 0, 0, 0];
    let mask = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], r = c >> 2, s = c & 3;
      rc[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
    if (fs >= 0) {
      const sh = straightHigh(sm[fs]);
      if (sh >= 0) return mk(8, [sh]);
    }
    let quads = -1; const trips = [], pairs = [];
    for (let r = 12; r >= 0; r--) {
      if (rc[r] === 4) quads = r;
      else if (rc[r] === 3) trips.push(r);
      else if (rc[r] === 2) pairs.push(r);
    }
    const top = (n, ex) => {
      const out = [];
      for (let r = 12; r >= 0 && out.length < n; r--) if (rc[r] > 0 && ex.indexOf(r) < 0) out.push(r);
      return out;
    };
    if (quads >= 0) return mk(7, [quads].concat(top(1, [quads])));
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const p = Math.max(trips.length > 1 ? trips[1] : -1, pairs.length ? pairs[0] : -1);
      return mk(6, [trips[0], p]);
    }
    if (fs >= 0) {
      const ks = [];
      for (let r = 12; r >= 0 && ks.length < 5; r--) if (sm[fs] & (1 << r)) ks.push(r);
      return mk(5, ks);
    }
    const sh = straightHigh(mask);
    if (sh >= 0) return mk(4, [sh]);
    if (trips.length) return mk(3, [trips[0]].concat(top(2, [trips[0]])));
    if (pairs.length >= 2) return mk(2, [pairs[0], pairs[1]].concat(top(1, [pairs[0], pairs[1]])));
    if (pairs.length === 1) return mk(1, [pairs[0]].concat(top(3, [pairs[0]])));
    return mk(0, top(5, []));
  }

  function bestFive(cs) {
    if (cs.length <= 5) return cs.slice();
    const target = evaluate(cs);
    const n = cs.length;
    if (n === 7) {
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const rest = cs.filter((_, i) => i !== a && i !== b);
        if (evaluate(rest) === target) return rest;
      }
    } else if (n === 6) {
      for (let a = 0; a < n; a++) {
        const rest = cs.filter((_, i) => i !== a);
        if (evaluate(rest) === target) return rest;
      }
    }
    return cs.slice(0, 5);
  }

  const category = (s) => Math.floor(s / 371293);
  const digit = (s, i) => Math.floor(s / [28561, 2197, 169, 13, 1][i]) % 13;

  function handName(s) {
    const c = category(s), k0 = digit(s, 0), k1 = digit(s, 1);
    switch (c) {
      case 8: return k0 === 12 ? 'Royal flush' : 'Straight flush, ' + SING[k0] + ' high';
      case 7: return 'Four of a kind, ' + PLUR[k0];
      case 6: return 'Full house, ' + PLUR[k0] + ' full of ' + PLUR[k1];
      case 5: return 'Flush, ' + SING[k0] + ' high';
      case 4: return 'Straight, ' + SING[k0] + ' high';
      case 3: return 'Three of a kind, ' + PLUR[k0];
      case 2: return 'Two pair, ' + PLUR[k0] + ' and ' + PLUR[k1];
      case 1: return 'Pair of ' + PLUR[k0];
      default: return SING[k0] + ' high';
    }
  }

  // Short label for banners / history.
  function shortName(s) {
    const c = category(s);
    return ['high card', 'a pair', 'two pair', 'three of a kind', 'a straight', 'a flush', 'a full house', 'four of a kind', 'a straight flush'][c];
  }

  function preflopName(h) {
    const a = h[0] >> 2, b = h[1] >> 2;
    if (a === b) return 'Pair of ' + PLUR[a];
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return SING[hi] + '-' + SING[lo] + ((h[0] & 3) === (h[1] & 3) ? ', suited' : ', offsuit');
  }

  // Approximate 0..1 hand strength for the two hole cards (Chen-style, normalised).
  function preflopStrength(h) {
    const r1 = h[0] >> 2, r2 = h[1] >> 2;
    const suited = (h[0] & 3) === (h[1] & 3);
    const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    const pts = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10]; // 2..A
    let s = pts[hi];
    const gap = hi - lo;
    if (gap === 0) {
      s = Math.max(5, pts[hi] * 2);
    } else {
      s -= [0, 1, 2, 4, 5][Math.min(gap, 4)];
      if (gap === 1) s += 1;
      else if (gap === 2 && hi < 11) s += 0.5;
    }
    if (suited && gap !== 0) s += 2;
    return Math.max(0, Math.min(1, (s + 2) / 21));
  }

  // Board + hole draw information used by the bots.
  function texture(board, hole) {
    const cards = (board || []).concat(hole || []);
    const rc = new Array(13).fill(0), sc = [0, 0, 0, 0];
    let mask = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]; rc[c >> 2]++; sc[c & 3]++; mask |= 1 << (c >> 2);
    }
    let paired = false, trips = false;
    for (let r = 0; r < 13; r++) { if (rc[r] >= 3) trips = true; else if (rc[r] === 2) paired = true; }
    let maxSuit = 0;
    for (let s = 0; s < 4; s++) maxSuit = Math.max(maxSuit, sc[s]);
    const flushDraw = board.length >= 3 && maxSuit === 4;
    let straightOuts = 0;
    for (let r = 0; r < 13; r++) {
      if (!(mask & (1 << r)) && straightHigh(mask | (1 << r)) >= 0) straightOuts++;
    }
    const broadway = cards.reduce((n, c) => n + ((c >> 2) >= 8 ? 1 : 0), 0);
    return {
      paired: paired || trips,
      trips: trips,
      flushDraw: flushDraw,
      madeFlush: board.length >= 3 && maxSuit >= 5,
      straightOuts: straightOuts,
      wet: flushDraw || straightOuts >= 2,
      broadway: broadway
    };
  }

  // Monte-Carlo equity vs nOpp random hands. Ties split.
  function equity(hole, board, nOpp, sims, rng) {
    if (!nOpp || nOpp < 1) return 1;
    rng = rng || Math.random;
    const used = new Uint8Array(52);
    for (let i = 0; i < hole.length; i++) used[hole[i]] = 1;
    for (let i = 0; i < board.length; i++) used[board[i]] = 1;
    const deck = [];
    for (let i = 0; i < 52; i++) if (!used[i]) deck.push(i);
    const need = nOpp * 2 + (5 - board.length);
    let score = 0;
    for (let s = 0; s < sims; s++) {
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(rng() * (deck.length - i));
        const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
      const full = board.slice();
      let k = nOpp * 2;
      while (full.length < 5) full.push(deck[k++]);
      const mine = evaluate(hole.concat(full));
      let best = -1, ties = 0;
      for (let o = 0; o < nOpp; o++) {
        const sc = evaluate([deck[o * 2], deck[o * 2 + 1]].concat(full));
        if (sc > best) { best = sc; ties = 1; } else if (sc === best) ties++;
      }
      if (mine > best) score += 1;
      else if (mine === best) score += 1 / (ties + 1);
    }
    return score / sims;
  }

  // How many of the remaining cards improve the hand to a made 5-card hand.
  function improvementOuts(hole, board) {
    const used = new Uint8Array(52);
    hole.concat(board).forEach((c) => { used[c] = 1; });
    const base = evaluate(hole.concat(board));
    const baseCat = category(base);
    let outs = 0;
    for (let c = 0; c < 52; c++) {
      if (used[c]) continue;
      const sc = evaluate(hole.concat(board, [c]));
      if (category(sc) > baseCat || (category(sc) === baseCat && sc > base)) outs++;
    }
    return outs;
  }

  const api = {
    SUITS, SUIT_NAMES, RANK_CH, SING, PLUR,
    makeDeck, shuffle, evaluate, bestFive, handName, shortName, preflopName,
    category, digit, preflopStrength, texture, equity, improvementOuts
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerCore = api;
})(typeof self !== 'undefined' ? self : this);
