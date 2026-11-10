/* Fold-rate by bet size and hand class, three-handed. */
const path = require('path');
const B = require(path.join(__dirname, '..', 'www', 'bots.js'));
const card = (r, s) => (r << 2) | s;
const board = [card(12, 0), card(5, 1), card(0, 2)]; // Ks 7h 2d
const hands = [
  ['top pair', [card(12, 2), card(6, 1)]],
  ['middle pair', [card(5, 2), card(10, 1)]],
  ['flush draw', [card(11, 1), card(8, 1)]],
  ['overcards', [card(11, 0), card(9, 0)]],
  ['air', [card(9, 3), card(4, 3)]]
];
const sizes = [0.1, 0.25, 0.5, 1, 2];
const N = 320;
const rows = [];
let worst = 0;
for (const [name, hole] of hands) {
  const row = [name];
  for (const f of sizes) {
    let folds = 0;
    for (let i = 0; i < N; i++) {
      const bot = B.makeBot(i, 0.55, Math.random, 'shark');
      const a = B.decide(bot, {
        hole, board, pot: 100, toCall: f * 100, cur: f * 100, minRaise: 50,
        myBet: 0, myChips: 2000, nOpp: 2, bb: 10, sb: 5, street: 1, late: false,
        nPlayers: 3, heroProfile: { maniac: 0, callHappy: 0.5, foldsALot: 0.3 },
        rng: Math.random, reads: { confident: false }
      });
      if (a.type === 'fold') folds++;
    }
    const pct = Math.round((folds / N) * 100);
    row.push(pct + '%');
    if (f <= 0.5 && (name === 'top pair' || name === 'middle pair' || name === 'flush draw')) {
      worst = Math.max(worst, pct);
    }
  }
  rows.push(row);
}
const head = ['hand', '10%', '25%', '50%', '100%', '200%'];
const w = [12, 5, 5, 5, 5, 5];
const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('');
console.log(line(head));
rows.forEach((r) => console.log(line(r)));
console.log(worst <= 45 ? 'PASS: no routine hand over-folds to half-pot or smaller bets' : 'FAIL: routine hands still folding too often (worst ' + worst + '%)');
process.exit(worst <= 45 ? 0 : 1);
