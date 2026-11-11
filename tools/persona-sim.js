/* Measures whether the personalities actually play differently.
   Samples pre-flop and post-flop spots for every archetype. */
const path = require('path');
const B = require(path.join(__dirname, '..', 'www', 'bots.js'));

const card = (r, s) => (r << 2) | s;
function pick(pool) { return pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; }
function deal() {
  const deck = [];
  for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) deck.push(card(r, s));
  const hole = [pick(deck), pick(deck)];
  const board = [pick(deck), pick(deck), pick(deck), pick(deck), pick(deck)];
  return { hole, board };
}
const baseCtx = {
  myChips: 900, nOpp: 2, bb: 10, sb: 5, late: false, nPlayers: 4,
  heroProfile: { maniac: 0, callHappy: 0.4, foldsALot: 0.35 },
  rng: Math.random, reads: { confident: false }
};

const ARCHES = ['shark', 'nit', 'rock', 'station', 'maniac', 'lag', 'bully', 'bluffer', 'honest', 'trapper'];
const N = 600;
const rows = [];
for (const arch of ARCHES) {
  const bot = B.makeBot(1, 0.55, Math.random, arch);
  let vpip = 0, pfr = 0, face = 0, folds = 0, checks = 0, bets = 0, sizeSum = 0, raises = 0;
  for (let i = 0; i < N; i++) {
    const { hole, board } = deal();
    const pre = B.decide(bot, Object.assign({}, baseCtx, {
      hole, board: [], pot: 15, toCall: 10, cur: 10, minRaise: 10, myBet: 0, street: 0
    }));
    if (pre.type !== 'fold') vpip++;
    if (pre.type === 'raise') pfr++;

    const post = B.decide(bot, Object.assign({}, baseCtx, {
      hole, board: board.slice(0, 3), pot: 100, toCall: 50, cur: 50, minRaise: 50, myBet: 0, street: 2
    }));
    face++;
    if (post.type === 'fold') folds++;
    if (post.type === 'raise') { raises++; sizeSum += (post.to - 50) / 100; }

    const checked = B.decide(bot, Object.assign({}, baseCtx, {
      hole, board: board.slice(0, 3), pot: 100, toCall: 0, cur: 0, minRaise: 10, myBet: 0, street: 2
    }));
    checks++;
    if (checked.type === 'raise') bets++;
  }
  rows.push({
    arch,
    vpip: vpip / N,
    pfr: pfr / N,
    fold: folds / face,
    bet: bets / checks,
    size: raises ? sizeSum / raises : 0
  });
}

const pct = (x) => (Math.round(x * 100) + '%').padStart(4);
console.log('arch       vpip  pfr  fold  bet  size');
rows.forEach((r) => console.log(r.arch.padEnd(9), pct(r.vpip), pct(r.pfr), pct(r.fold), pct(r.bet), r.size.toFixed(1)));

const by = Object.fromEntries(rows.map((r) => [r.arch, r]));
const checks = [
  ['station calls more than rock', by.station.fold < by.rock.fold - 0.2],
  ['maniac plays more hands than nit', by.maniac.vpip > by.nit.vpip + 0.2],
  ['maniac bets more than honest', by.maniac.bet > by.honest.bet + 0.2],
  ['bluffer bets more than rock', by.bluffer.bet > by.rock.bet + 0.15],
  ['rock folds more than station', by.rock.fold > by.station.fold + 0.2],
  ['maniac sizes bigger than rock', by.maniac.size > by.rock.size * 1.3]
];
let ok = true;
checks.forEach(([label, pass]) => { console.log((pass ? 'PASS ' : 'FAIL ') + label); if (!pass) ok = false; });
console.log(ok ? 'PASS: personalities are measurably different' : 'FAIL: personalities still overlap');
process.exit(ok ? 0 : 1);
