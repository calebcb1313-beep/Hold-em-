/* Rules tests for engine.js and poker-core.js. Run: node tools/engine-test.js */
const assert = require('assert');
const path = require('path');
const Core = require(path.join(__dirname, '..', 'www', 'poker-core.js'));
const E = require(path.join(__dirname, '..', 'www', 'engine.js'));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (err) { console.error('FAIL ' + name); console.error(err && err.stack || err); process.exitCode = 1; }
}
const card = (s) => {
  const rank = '23456789TJQKA'.indexOf(s[0]);
  const suit = 'shdc'.indexOf(s[1]);
  return (rank << 2) | suit;
};
const hand = (s) => s.split(' ').map(card);
const cat = (s) => Core.category(Core.evaluate(hand(s)));

/* ---------------- hand evaluation ---------------- */
test('hand categories rank correctly', () => {
  const order = [
    'As Ks Qs Js Ts', '9h 8h 7h 6h 5h', '8s 8h 8d 8c Kd', 'Qs Qh Qd 4c 4s',
    'Ad Jd 8d 5d 3d', '9s 8h 7d 6c 5h', '7s 7h 7d Kc 2h', 'Js Jh 4d 4c Ah',
    'Ts Th Ad 6c 3h', 'As Jh 8d 5c 3h'
  ].map((h) => Core.evaluate(hand(h)));
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] > order[i], 'hand order at ' + i);
});

test('wheel straight is five-high and not a flush', () => {
  const s = Core.evaluate(hand('As 2h 3d 4c 5s'));
  assert.strictEqual(Core.category(s), 4);
  assert.strictEqual(Core.handName(s), 'Straight, Five high');
});

test('kickers decide otherwise equal hands', () => {
  const ak = Core.evaluate(hand('As Ah Kd 8c 3h'));
  const aq = Core.evaluate(hand('Ad Ac Qd 8s 3c'));
  assert.ok(ak > aq, 'pair of aces with king kicker must win');
  const twoPairK = Core.evaluate(hand('9s 9h 4d 4c Kd'));
  const twoPairQ = Core.evaluate(hand('9d 9c 4h 4s Qh'));
  assert.ok(twoPairK > twoPairQ);
});

test('identical boards split (tie scores equal)', () => {
  const board = hand('As Ks Qs Js Ts');
  const a = Core.evaluate(hand('2h 3d').concat(board));
  const b = Core.evaluate(hand('4c 5h').concat(board));
  assert.strictEqual(a, b);
});

/* ---------------- side pots and odd chips ---------------- */
const mk = (seat, total, folded) => ({ seat, total, folded: !!folded, name: 'S' + seat });
test('side pots with uneven all-ins pay each level correctly', () => {
  // Seat 0 all-in 100, seat 1 all-in 300, seat 2 covers 500.
  const players = [mk(0, 100), mk(1, 300), mk(2, 500)];
  const scores = { 0: 10, 1: 30, 2: 20 }; // seat 1 strongest, then 2, then 0
  const wins = E.awardPots(players, scores, 0);
  assert.strictEqual(wins.get(1), 700); // 300 main + 400 side (seats 1,2)
  assert.strictEqual(wins.get(2), 200); // uncalled top level returned
  assert.strictEqual(wins.get(0) || 0, 0);
  assert.strictEqual(Array.from(wins.values()).reduce((a, b) => a + b, 0), 900);
});

test('folded chips stay in the pot but cannot win', () => {
  const players = [mk(0, 100), mk(1, 100, true), mk(2, 200)];
  const scores = { 0: 5, 2: 9 };
  const wins = E.awardPots(players, scores, 0);
  assert.strictEqual(wins.get(2), 400);
  assert.strictEqual(wins.get(1) || 0, 0);
});

test('split pot odd chip goes clockwise from the button', () => {
  // Three players put in 33 each; seat 2 folded; 0 and 1 tie for 99.
  const players = [mk(0, 33), mk(1, 33), mk(2, 33, true)];
  const wins = E.awardPots(players, { 0: 7, 1: 7 }, 0);
  assert.strictEqual(wins.get(0), 49);
  assert.strictEqual(wins.get(1), 50); // first seat left of button
});

test('three-way split of an odd pot is exact where possible', () => {
  const players = [mk(0, 34), mk(1, 34), mk(2, 34)];
  const wins = E.awardPots(players, { 0: 3, 1: 3, 2: 3 }, 0);
  const total = Array.from(wins.values()).reduce((a, b) => a + b, 0);
  assert.strictEqual(total, 102);
  assert.deepStrictEqual(Array.from(wins.values()).sort(), [34, 34, 34]);
});

/* ---------------- betting legality ---------------- */
function table(stacks, opts) {
  return new E.Table(Object.assign({
    sb: 5, bb: 10, button: 0, seed: 42,
    players: stacks.map((s, i) => ({ id: 'p' + i, name: 'P' + i, stack: s }))
  }, opts || {}));
}

test('pre-flop minimum raise is one big blind and grows with the last raise', () => {
  const t = table([1000, 1000, 1000]);
  t.startHand();
  assert.strictEqual(t.acting, 0);
  let legal = t.legalActions(0);
  assert.strictEqual(legal.raise.min, 20);
  t.act(0, { type: 'raise', to: 30 });
  legal = t.legalActions(1);
  assert.strictEqual(legal.raise.min, 50); // 30 + last raise of 20
  assert.throws(() => t.act(1, { type: 'raise', to: 40 }), /below minimum/);
});

test('illegal check and out-of-turn actions are rejected', () => {
  const t = table([1000, 1000, 1000]);
  t.startHand();
  assert.strictEqual(t.legalActions(0).check, false);
  assert.throws(() => t.act(0, { type: 'check' }), /not legal/);
  assert.throws(() => t.act(1, { type: 'call' }), /not to act/);
});

test('heads-up: button posts small blind, acts first pre-flop and last post-flop', () => {
  const t = table([1000, 1000], { button: 0 });
  t.startHand();
  assert.strictEqual(t.sbSeat, 0);
  assert.strictEqual(t.bbSeat, 1);
  assert.strictEqual(t.acting, 0);
  t.act(0, { type: 'call' });
  assert.strictEqual(t.acting, 1);
  t.act(1, { type: 'check' });
  assert.strictEqual(t.street, 'flop');
  assert.strictEqual(t.acting, 1); // big blind first after the flop
});

test('short all-in does not reopen raising for players who already acted', () => {
  // Seat 0 raises, seat 1 shoves short, seat 2 calls; seat 0 may only call.
  const t = table([1000, 45, 1000]);
  t.startHand();
  t.act(0, { type: 'raise', to: 30 });
  t.act(1, { type: 'allin' }); // 45 total, a 15 raise over 30
  assert.strictEqual(t.currentBet, 45);
  t.act(2, { type: 'call' });
  const legal = t.legalActions(0);
  assert.strictEqual(legal.raise, null, 'raiser may not re-raise a short all-in');
  assert.strictEqual(legal.callAmount, 15);
});

test('a full raise reopens raising', () => {
  const t = table([1000, 1000, 1000]);
  t.startHand();
  t.act(0, { type: 'raise', to: 30 });
  t.act(1, { type: 'raise', to: 60 });
  t.act(2, { type: 'fold' });
  const legal = t.legalActions(0);
  assert.ok(legal.raise, 'original raiser may re-raise a full raise');
  assert.strictEqual(legal.raise.min, 90);
});

test('an all-in call never exceeds the stack and marks the player all-in', () => {
  const t = table([1000, 1000, 55]);
  t.startHand();
  t.act(0, { type: 'raise', to: 100 });
  t.act(1, { type: 'fold' });
  const legal = t.legalActions(2);
  assert.strictEqual(legal.callAmount, 45);
  t.act(2, { type: 'call' });
  assert.strictEqual(t.log[t.log.length - 1].paid, 45, 'call never exceeds the stack');
  assert.strictEqual(t.players[2].allin, true);
  assert.ok(t.players[2].stack >= 0);
});

/* ---------------- conservation over many hands ---------------- */
test('chip conservation across 3,000 random AI-vs-AI hands', () => {
  const t = table([1000, 1000, 1000, 1000], { seed: 987654 });
  const startTotal = t.totalChips;
  let actions = 0;
  for (let h = 0; h < 3000; h++) {
    t.startHand();
    let guard = 0;
    while (!t.result && guard++ < 400) {
      const seat = t.acting;
      const legal = t.legalActions(seat);
      assert.ok(legal, 'acting seat must have legal actions');
      const roll = t.rand();
      let action;
      if (roll < 0.16) action = { type: 'fold' };
      else if (roll < 0.58) action = legal.check ? { type: 'check' }
        : { type: 'call' };
      else if (roll < 0.9 && legal.raise) {
        const span = legal.raise.max - legal.raise.min;
        action = { type: 'raise', to: legal.raise.min + Math.floor(t.rand() * (span + 1)) };
      } else action = { type: 'allin' };
      t.act(seat, action);
      actions++;
      const inPlay = t.chipTotal() + t.pot();
      assert.strictEqual(inPlay, startTotal, 'chips conserved mid-hand');
      t.players.forEach((p) => assert.ok(p.stack >= 0, 'no negative stacks'));
    }
    assert.ok(t.result, 'hand ' + h + ' must finish');
    assert.strictEqual(t.chipTotal(), startTotal, 'chips conserved after hand ' + h);
    if (t.players.filter((p) => p.stack > 0).length < 2) {
      const each = Math.floor(startTotal / t.players.length);
      t.players.forEach((p) => { p.stack = each; p.out = false; p.folded = false; });
      assert.strictEqual(t.chipTotal(), startTotal);
    }
  }
  console.log('  ' + actions + ' actions simulated');
});

test('a folded pot reports seat ids and conserves chips', () => {
  const t = table([200, 50, 30], { sb: 5, bb: 10, seed: 909 });
  t.startHand();
  t.act(0, { type: 'raise', to: 100 });
  t.act(1, { type: 'fold' });
  const r = t.act(2, { type: 'fold' });
  assert.strictEqual(r.showdown, false);
  assert.strictEqual(typeof r.pots[0].eligible[0], 'number', 'eligible seats are numbers');
  assert.strictEqual(t.chipTotal(), t.totalChips, 'chips conserved');
  assert.strictEqual(t.players[0].stack, 215, 'raiser collects blinds and own bet');
});

test('a player all-in from the blind still gets two cards', () => {
  const t = table([1000, 1000, 5], { sb: 5, bb: 10, seed: 31337 });
  t.startHand();
  t.players.forEach((p) => { if (!p.out) assert.strictEqual(p.hole.length, 2, 'two cards for seat ' + p.seat); });
  const all = t.players.flatMap((p) => p.hole);
  assert.strictEqual(new Set(all).size, all.length, 'no card dealt twice');
  assert.strictEqual(t.chipTotal() + t.pot(), t.totalChips);
});

test('a hand replays exactly from its seed and action log', () => {
  const pre = [{ stack: 500 }, { stack: 500 }];
  const t = new E.Table({ sb: 5, bb: 10, button: 0, seed: 4242, players: pre });
  t.startHand();
  const acts = [];
  const play = (seat, action) => { t.act(seat, action); acts.push({ seat, action }); };
  play(0, { type: 'call' }); play(1, { type: 'check' });
  for (let s = 0; s < 3; s++) { play(1, { type: 'check' }); play(0, { type: 'check' }); }
  assert.strictEqual(t.board.length, 5);
  const r = new E.Table({ sb: 5, bb: 10, button: 0, seed: t.handSeed, players: pre });
  r.startHand(t.handSeed);
  acts.forEach((x) => r.act(x.seat, x.action));
  assert.deepStrictEqual(r.players.map((p) => p.hole), t.players.map((p) => p.hole));
  assert.deepStrictEqual(r.board, t.board);
  assert.deepStrictEqual(r.result.winners, t.result.winners);
  assert.strictEqual(r.chipTotal(), t.totalChips);
});

test('deterministic shuffled deck for a given seed', () => {
  const a = new E.Table({ sb: 5, bb: 10, players: [{ stack: 500 }, { stack: 500 }], seed: 77 });
  const b = new E.Table({ sb: 5, bb: 10, players: [{ stack: 500 }, { stack: 500 }], seed: 77 });
  a.startHand(); b.startHand();
  assert.deepStrictEqual(a.players.map((p) => p.hole), b.players.map((p) => p.hole));
  assert.deepStrictEqual(a.board, b.board);
});

console.log('\n' + passed + ' test groups passed' + (process.exitCode ? ' (with failures)' : ''));
