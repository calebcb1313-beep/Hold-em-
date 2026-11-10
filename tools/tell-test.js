/* RDR2-style behaviour checks: honest players never bluff, bluffers do, and
   tells must carry real information while staying personal to each opponent. */
const path = require('path');
const B = require(path.join(__dirname, '..', 'www', 'bots.js'));
const card = (r, s) => (r << 2) | s;
const board = [card(12, 0), card(5, 1), card(2, 2)];
const strongHole = [card(12, 1), card(12, 2)]; // top set
const airHole = [card(9, 3), card(4, 3)];
const ctx = (hole, toCall) => ({
  hole, board, pot: 100, toCall, cur: toCall, minRaise: 50, myBet: 0, myChips: 2000,
  nOpp: 1, bb: 10, sb: 5, street: 2, late: false, nPlayers: 2,
  heroProfile: { maniac: 0, callHappy: 0.4, foldsALot: 0.35 }, rng: Math.random,
  reads: { confident: false }
});
const N = 500;
function run(arch, hole, toCall) {
  let raises = 0, strongTell = 0, tell = 0;
  const bot = B.makeBot(1, 0.6, Math.random, arch);
  const tells = bot.tells.strong;
  for (let i = 0; i < N; i++) {
    const a = B.decide(bot, ctx(hole, toCall));
    if (a.type === 'raise') raises++;
    if (bot.tell) {
      tell++;
      if (bot.tell === tells) strongTell++;
    }
  }
  return { raise: raises / N, tell: tell / N, strongTell: strongTell / N, personal: bot.tells.strong === tells };
}
const honestStrong = run('honest', strongHole, 40);
const honestAir = run('honest', airHole, 0);
const bluffAir = run('bluffer', airHole, 0);
const sharkStrong = run('shark', strongHole, 40);
const sharkAir = run('shark', airHole, 40);
console.log('honest  strong hand raise %:', Math.round(honestStrong.raise * 100));
console.log('honest  air bet %:          ', Math.round(honestAir.raise * 100));
console.log('bluffer air bet %:          ', Math.round(bluffAir.raise * 100));
console.log('shark   strong-tell % strong:', Math.round(sharkStrong.strongTell * 100));
console.log('shark   strong-tell % air:   ', Math.round(sharkAir.strongTell * 100));
console.log('shark   tell rate %:         ', Math.round(sharkStrong.tell * 100));
const ok = honestAir.raise < 0.03 && bluffAir.raise > honestAir.raise + 0.15 &&
  sharkStrong.strongTell > sharkAir.strongTell * 2 && sharkStrong.personal;
console.log(ok ? 'PASS: personalities and tells behave' : 'FAIL: personality/tell check');
process.exit(ok ? 0 : 1);
