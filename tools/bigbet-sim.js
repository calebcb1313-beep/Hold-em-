/* How do seats react to a big bet? Measures mass-folding. */
const path = require('path');
const B = require(path.join(__dirname, '..', 'www', 'bots.js'));
const C = require(path.join(__dirname, '..', 'www', 'poker-core.js'));
const card = (r, s) => (r << 2) | s;
const ARCHES = ['shark', 'nit', 'rock', 'station', 'maniac', 'lag', 'bully', 'bluffer', 'honest', 'trapper'];
const N = 500;
function deal() {
  const deck = []; for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) deck.push(card(r, s));
  C.shuffle(deck);
  return { hole: [deck.pop(), deck.pop()], board: [deck.pop(), deck.pop(), deck.pop()] };
}
function spot(bot, kind) {
  const d = deal();
  if (kind === 'pre') return B.decide(bot, {
    hole: d.hole, board: [], pot: 500, cur: 400, toCall: 400, myBet: 0, myChips: 5000,
    nOpp: 4, bb: 50, sb: 25, street: 0, late: false, nPlayers: 5,
    heroProfile: { maniac: 0, callHappy: 0.4, foldsALot: 0.35 }, rng: Math.random,
    reads: { confident: false }
  });
  return B.decide(bot, {
    hole: d.hole, board: d.board, pot: 300, cur: 400, toCall: 400, myBet: 0, myChips: 5000,
    nOpp: 2, bb: 50, sb: 25, street: 2, late: false, nPlayers: 4,
    heroProfile: { maniac: 0, callHappy: 0.4, foldsALot: 0.35 }, rng: Math.random,
    reads: { confident: false }
  });
}
for (const kind of ['pre', 'post']) {
  console.log('--- facing 400 ' + (kind === 'pre' ? 'pre-flop (bb 50)' : 'on the flop, pot 300'));
  let allFold = 0;
  for (const arch of ARCHES) {
    const bot = B.makeBot(1, 0.55, Math.random, arch);
    let f = 0, c = 0, r = 0;
    for (let i = 0; i < N; i++) {
      const a = spot(bot, kind);
      if (a.type === 'fold') f++; else if (a.type === 'raise') r++; else c++;
    }
    console.log(arch.padEnd(9), 'fold', String(Math.round(f / N * 100)).padStart(3) + '%',
      'call', String(Math.round(c / N * 100)).padStart(3) + '%',
      'raise', String(Math.round(r / N * 100)).padStart(3) + '%');
  }
  for (let i = 0; i < 400; i++) {
    let folds = 0;
    for (let k = 0; k < 4; k++) {
      const a = spot(B.makeBot(k, 0.55, Math.random), kind);
      if (a.type === 'fold') folds++;
    }
    if (folds === 4) allFold++;
  }
  console.log('everyone folds: ' + Math.round(allFold / 400 * 100) + '%');
}
