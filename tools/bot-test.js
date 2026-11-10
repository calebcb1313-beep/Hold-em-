/* Headless bot sanity checks: preflop ranges, all-in calling, legal actions. */
const Core = require('../www/poker-core.js');
const Bots = require('../www/bots.js');

const rnd = Math.random;
const R = (n) => Math.floor(rnd() * n);
const deck = () => Core.shuffle(Core.makeDeck());
const boardOf = (n) => deck().slice(0, n);

function bot(arch) {
  const b = Bots.makeBot(0, 0.55, Math.random, arch || null);
  b.mood = Bots.newMood(b);
  return b;
}

function ctx(hole, board, opts) {
  return Object.assign({
    hole, board, pot: 150, toCall: 0, cur: 0, minRaise: 50, myBet: 0, myChips: 5000,
    nOpp: 4, bb: 50, sb: 25, street: board.length === 0 ? 0 : board.length === 3 ? 1 : board.length === 4 ? 2 : 3,
    late: false, nPlayers: 6, heroProfile: {}, rng: rnd
  }, opts || {});
}

let illegal = 0, total = 0;
function check(b, c, a) {
  total++;
  if (a.type === 'raise') {
    const maxTo = c.myChips + c.myBet;
    if (!(a.to > c.cur && a.to <= maxTo)) {
      illegal++;
      if (illegal < 6) console.log('ILLEGAL', b.arch, a, c.cur, maxTo);
    }
  }
  return a;
}

// 1. Preflop: unopened pot (should raise/limp by preference).
console.log('--- preflop, unopened (6-max, first in) ---');
for (const arch of Bots.ARCH.map((a) => a.id)) {
  let fold = 0, raise = 0, call = 0;
  for (let i = 0; i < 800; i++) {
    const d = deck();
    const b = bot(arch);
    const c = ctx([d[0], d[1]], [], { cur: 50, toCall: 25, myBet: 0, late: true });
    const a = check(b, c, Bots.decide(b, c));
    if (a.type === 'fold') fold++; else if (a.type === 'raise') raise++; else call++;
  }
  console.log(arch.padEnd(9), 'fold', (fold / 8).toFixed(0).padStart(3) + '%',
    'call', (call / 8).toFixed(0).padStart(3) + '%', 'raise', (raise / 8).toFixed(0).padStart(3) + '%');
}

// 2. Facing a 50bb open shove: how often do they defend?
console.log('\n--- facing a 50bb preflop shove (4 opponents behind) ---');
for (const arch of Bots.ARCH.map((a) => a.id)) {
  let fold = 0, call = 0;
  for (let i = 0; i < 800; i++) {
    const d = deck();
    const b = bot(arch);
    const c = ctx([d[0], d[1]], [], {
      pot: 5200, toCall: 5000, cur: 5000, myChips: 5000, myBet: 0, minRaise: 5000, nOpp: 1
    });
    const a = check(b, c, Bots.decide(b, c));
    if (a.type === 'fold') fold++; else call++;
  }
  console.log(arch.padEnd(9), 'fold', (fold / 8).toFixed(0).padStart(3) + '%', 'call', (call / 8).toFixed(0).padStart(3) + '%');
}

// 3. Facing a 50bb shove from a known maniac (hero shoves every hand).
console.log('\n--- same shove, but the shover is a known maniac ---');
for (const arch of Bots.ARCH.map((a) => a.id)) {
  let fold = 0, call = 0;
  for (let i = 0; i < 800; i++) {
    const d = deck();
    const b = bot(arch);
    const c = ctx([d[0], d[1]], [], {
      pot: 5200, toCall: 5000, cur: 5000, myChips: 5000, myBet: 0, minRaise: 5000, nOpp: 1,
      heroProfile: { maniac: 1, foldsALot: 0.2 }
    });
    const a = check(b, c, Bots.decide(b, c));
    if (a.type === 'fold') fold++; else call++;
  }
  console.log(arch.padEnd(9), 'fold', (fold / 8).toFixed(0).padStart(3) + '%', 'call', (call / 8).toFixed(0).padStart(3) + '%');
}

// 4. Postflop: pot-sized bet with various made hands.
console.log('\n--- postflop: facing a pot-size bet (800 samples each) ---');
const spots = [
  ['air', ['As', 'Kd'], '2h 7c 9d'],
  ['top pair', ['Ah', 'Qd'], 'Qc 7c 2s'],
  ['overpair', ['Kh', 'Kd'], '9c 5c 2s'],
  ['set', ['8h', '8d'], '8c 5c 2s'],
  ['flush draw', ['Jh', '9h'], 'Ah 5h 2c'],
  ['full house', ['5h', '5d'], '5c Ks Kd']
];
const card = (s) => '23456789TJQKA'.indexOf(s[0]) * 4 + 'shdc'.indexOf(s[1]);
for (const [name, hole, b] of spots) {
  const holeC = hole.map(card), boardC = b.split(' ').map(card);
  let fold = 0, call = 0, raise = 0;
  for (let i = 0; i < 800; i++) {
    const bt = bot('pro');
    const c = ctx(holeC, boardC, {
      pot: 400, toCall: 400, cur: 400, myBet: 0, myChips: 4000, minRaise: 400, nOpp: 2
    });
    const a = check(bt, c, Bots.decide(bt, c));
    if (a.type === 'fold') fold++; else if (a.type === 'raise') raise++; else call++;
  }
  console.log(name.padEnd(11), 'fold', (fold / 8).toFixed(0).padStart(3) + '%',
    'call', (call / 8).toFixed(0).padStart(3) + '%', 'raise', (raise / 8).toFixed(0).padStart(3) + '%');
}

// 5. All-in on the river: made hands must not fold to a single opponent shove.
console.log('\n--- river, facing all-in shove, strong hands ---');
for (const [name, hole, b] of [['top pair', ['Ah', 'Qd'], 'Qc 7c 2s 3d 8h'], ['two pair', ['Ah', 'Qd'], 'Qc 7c Ad 3d 8h']]) {
  const holeC = hole.map(card), boardC = b.split(' ').map(card);
  let call = 0;
  for (let i = 0; i < 300; i++) {
    const bt = bot('pro');
    const c = ctx(holeC, boardC, { pot: 6000, toCall: 3000, cur: 3000, myChips: 3000, minRaise: 3000, nOpp: 1 });
    const a = check(bt, c, Bots.decide(bt, c));
    if (a.type !== 'fold') call++;
  }
  console.log(name.padEnd(10), 'calls', (call / 3).toFixed(0).padStart(3) + '%');
}

// 6. Roster variety.
const roster = Bots.makeRoster(5, 0.6);
console.log('\nroster:', roster.map((b) => b.name + ' [' + b.arch + ']').join(' | '));
const names = new Set();
for (let i = 0; i < 2000; i++) names.add(Bots.genName(rnd));
console.log('unique names from 2000 draws:', names.size);

console.log('\nchecked actions:', total, 'illegal:', illegal);
if (illegal) process.exitCode = 1;
