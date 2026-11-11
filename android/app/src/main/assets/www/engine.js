/* engine.js — pure no-limit Texas Hold'em rules.
   No DOM, no AI, no timers. Every state change goes through act(), which
   rejects anything not present in legalActions(). Chips are integers and the
   total is conserved on every hand.

   Odd chips: when a pot cannot be divided evenly, the remainder is awarded one
   chip at a time to the winners in clockwise order starting from the first seat
   left of the button. This is documented in README and covered by tests. */
(function (root) {
  'use strict';

  const Core = (typeof module !== 'undefined' && module.exports)
    ? require('./poker-core.js') : root.PokerCore;

  const STREETS = ['preflop', 'flop', 'turn', 'river'];

  function makeRng(seed) {
    let t = (seed == null ? 1 : seed) >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = t;
      r = Math.imul(r ^ (r >>> 15), 1 | r);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(deck, rand) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  // Side pots from total contributions. Folded chips stay in the pot but the
  // folded player is never eligible to win.
  function buildPots(players) {
    const levels = Array.from(new Set(players.filter((p) => p.total > 0).map((p) => p.total)))
      .sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const p of players) {
        amount += Math.max(0, Math.min(p.total, lvl) - Math.min(p.total, prev));
      }
      const eligible = players.filter((p) => !p.folded && p.total >= lvl);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lvl;
    }
    return pots;
  }

  function awardPots(players, scores, button) {
    const n = players.length;
    const pots = buildPots(players);
    const wins = new Map();
    pots.forEach((pot) => {
      if (!pot.eligible.length) return;
      let winners = pot.eligible;
      if (scores) {
        const best = Math.max.apply(null, pot.eligible.map((p) => scores[p.seat] == null ? -1 : scores[p.seat]));
        winners = pot.eligible.filter((p) => scores[p.seat] === best);
      }
      // The first seat left of the button gets the odd chip, then clockwise.
      winners = winners.slice().sort((a, b) =>
        ((a.seat - button - 1 + n) % n) - ((b.seat - button - 1 + n) % n));
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      winners.forEach((p) => {
        const amt = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        wins.set(p.seat, (wins.get(p.seat) || 0) + amt);
      });
    });
    return wins;
  }

  class Table {
    constructor(o) {
      o = o || {};
      this.sb = o.sb || 1;
      this.bb = o.bb || 2;
      this.button = o.button || 0;
      this.seed = o.seed == null ? 1 : o.seed;
      this.handSeed = this.seed;
      this.rand = makeRng(this.seed);
      this.players = (o.players || []).map((p, i) => ({
        seat: i,
        id: p.id || ('seat' + i),
        name: p.name || ('Seat ' + i),
        stack: Math.max(0, Math.round(p.stack || 0)),
        meta: p.meta || null,
        hole: [], bet: 0, total: 0,
        folded: (p.stack || 0) <= 0, allin: false, out: (p.stack || 0) <= 0,
        lastAction: null
      }));
      this.handNo = 0;
      this.board = [];
      this.street = 'idle';
      this.currentBet = 0;
      this.minRaise = this.bb;
      this.acting = -1;
      this.sbSeat = -1;
      this.bbSeat = -1;
      this.needsAction = new Set();
      this.actedSinceRaise = new Set();
      this.result = null;
      this.totalChips = this.chipTotal();
      this.deck = [];
      this.log = [];
    }

    chipTotal() {
      return this.players.reduce((s, p) => s + p.stack, 0);
    }
    pot() {
      return this.players.reduce((s, p) => s + p.total, 0);
    }
    inHand() {
      return this.players.filter((p) => !p.folded && !p.out);
    }
    nextSeat(from, pred) {
      const n = this.players.length;
      for (let k = 1; k <= n; k++) {
        const j = (from + k) % n;
        if (pred(this.players[j])) return j;
      }
      return from;
    }
    nextLive(from) {
      return this.nextSeat(from, (p) => !p.out && p.stack > 0);
    }
    // Dealing follows every player still in the hand, including someone who is
    // already all-in from a blind and therefore has no chips left.
    nextInHand(from) {
      return this.nextSeat(from, (p) => !p.out);
    }
    postBlind(seat, amount) {
      const p = this.players[seat];
      const amt = Math.min(amount, p.stack);
      p.stack -= amt; p.bet += amt; p.total += amt;
      if (p.stack === 0) p.allin = true;
      p.lastAction = 'blind';
    }

    startHand(handSeed) {
      this.handNo++;
      // Each hand gets its own reproducible seed. A supplied seed is used by
      // the replay viewer; otherwise it is derived from the table seed and hand
      // number, so replaying a record starts from exactly the same shuffle.
      this.handSeed = handSeed != null
        ? (handSeed >>> 0)
        : ((this.seed + Math.imul(this.handNo, 0x9E3779B1)) >>> 0);
      this.rand = makeRng(this.handSeed);
      this.result = null;
      this.board = [];
      this.street = 'preflop';
      this.currentBet = 0;
      this.minRaise = this.bb;
      this.acting = -1;
      this.needsAction.clear();
      this.actedSinceRaise.clear();
      this.log = [];
      this.players.forEach((p) => {
        p.hole = []; p.bet = 0; p.total = 0;
        p.out = p.stack <= 0;
        p.folded = p.out;
        p.allin = false;
        p.lastAction = null;
      });
      if (this.handNo > 1) this.button = this.nextLive(this.button);
      const live = this.players.filter((p) => !p.out);
      if (live.length < 2) {
        this.street = 'over';
        this.result = { over: true, winners: [], pots: [], showdown: false };
        return this.result;
      }
      const headsUp = live.length === 2;
      this.sbSeat = headsUp ? this.button : this.nextLive(this.button);
      this.bbSeat = this.nextLive(this.sbSeat);
      this.postBlind(this.sbSeat, this.sb);
      this.postBlind(this.bbSeat, this.bb);
      this.deck = shuffle(Core.makeDeck(), this.rand);
      // Two cards each, one at a time, starting left of the button.
      for (let round = 0; round < 2; round++) {
        let s = this.nextInHand(this.button);
        for (let k = 0; k < live.length; k++) {
          this.players[s].hole.push(this.deck.pop());
          s = this.nextInHand(s);
        }
      }
      this.currentBet = this.bb;
      this.minRaise = this.bb;
      this.players.forEach((p) => {
        if (!p.out && !p.allin) this.needsAction.add(p.seat);
      });
      const first = headsUp ? this.button : this.nextLive(this.bbSeat);
      this.advance(first, true);
      return this.result || this.snapshot();
    }

    snapshot() {
      return {
        handNo: this.handNo, handSeed: this.handSeed, street: this.street, board: this.board.slice(),
        pot: this.pot(), currentBet: this.currentBet, minRaise: this.minRaise,
        acting: this.acting, button: this.button, sbSeat: this.sbSeat, bbSeat: this.bbSeat,
        players: this.players.map((p) => ({
          seat: p.seat, name: p.name, stack: p.stack, bet: p.bet, total: p.total,
          folded: p.folded, allin: p.allin, out: p.out, lastAction: p.lastAction
        })),
        result: this.result
      };
    }

    // What this seat may legally do, computed from state. This is the only
    // source of truth for both the human UI and the bots.
    legalActions(seat) {
      if (seat !== this.acting || this.result) return null;
      const p = this.players[seat];
      if (!p || p.folded || p.allin) return null;
      const toCall = Math.max(0, this.currentBet - p.bet);
      const maxTo = p.stack + p.bet;
      const minTo = Math.min(maxTo, this.currentBet + this.minRaise);
      const blocked = this.actedSinceRaise.has(seat);
      const raise = (!blocked && maxTo > this.currentBet && maxTo >= minTo)
        ? { min: minTo, max: maxTo } : null;
      return {
        seat,
        fold: true,
        check: toCall === 0,
        call: toCall > 0,
        callAmount: Math.min(toCall, p.stack),
        raise,
        allin: maxTo,
        toCall,
        pot: this.pot(),
        minRaiseTo: minTo,
        maxRaiseTo: maxTo
      };
    }

    advance(from, includeFrom) {
      if (this.result) return;
      if (!this.needsAction.size) return this.closeStreet();
      if (includeFrom && this.needsAction.has(from)) { this.acting = from; return; }
      this.acting = this.nextSeat(from, (p) => this.needsAction.has(p.seat));
    }

    act(seat, action) {
      if (this.result || this.street === 'over') throw new Error('hand is over');
      if (seat !== this.acting) throw new Error('seat ' + seat + ' is not to act');
      const legal = this.legalActions(seat);
      if (!legal) throw new Error('no legal actions');
      const p = this.players[seat];
      const type = action && action.type;
      if (!type) throw new Error('missing action');

      let raised = false;
      let paid = 0;
      if (type === 'fold') {
        if (!legal.fold) throw new Error('fold is not legal');
        p.folded = true;
        p.lastAction = 'fold';
      } else if (type === 'check') {
        if (!legal.check) throw new Error('check is not legal');
        p.lastAction = 'check';
      } else if (type === 'call') {
        if (!legal.call) throw new Error('call is not legal');
        paid = Math.min(legal.callAmount, p.stack);
        this.pay(p, paid);
        p.lastAction = paid > 0 ? 'call' : 'check';
      } else if (type === 'allin') {
        const maxTo = p.stack + p.bet;
        if (maxTo <= this.currentBet) {
          paid = p.stack;
          this.pay(p, paid);
          p.lastAction = 'call';
        } else {
          raised = true;
          paid = p.stack;
          this.doRaise(p, maxTo, true);
        }
      } else if (type === 'bet' || type === 'raise') {
        if (!legal.raise) throw new Error('raise is not legal');
        const to = Math.round(action.to == null ? 0 : action.to);
        if (!isFinite(to)) throw new Error('raise amount must be a number');
        if (to > legal.maxRaiseTo) throw new Error('raise above maximum');
        const allin = to === legal.maxRaiseTo;
        if (to < legal.minRaiseTo && !allin) throw new Error('raise below minimum');
        if (to <= this.currentBet) throw new Error('raise must exceed current bet');
        raised = true;
        paid = to - p.bet;
        this.doRaise(p, to, allin);
      } else {
        throw new Error('unknown action: ' + type);
      }

      this.log.push({ seat, type, paid, to: this.currentBet, street: this.street });
      this.needsAction.delete(seat);
      this.actedSinceRaise.add(seat);
      if (raised) {
        this.players.forEach((q) => {
          if (q.seat !== seat && !q.folded && !q.out && !q.allin) this.needsAction.add(q.seat);
        });
      }
      if (!this.needsAction.size) this.closeStreet();
      else this.advance(seat, false);
      return this.result || this.snapshot();
    }

    pay(p, amount) {
      const amt = Math.max(0, Math.min(amount, p.stack));
      p.stack -= amt;
      p.bet += amt;
      p.total += amt;
      if (p.stack === 0) p.allin = true;
    }

    doRaise(p, to, allin) {
      const opening = this.currentBet === 0;
      const raiseSize = to - this.currentBet;
      this.pay(p, to - p.bet);
      if (opening || raiseSize >= this.minRaise) {
        this.minRaise = Math.max(this.minRaise, raiseSize);
        // A full raise (or the opening wager) reopens betting for everyone.
        this.actedSinceRaise.clear();
      }
      this.currentBet = to;
      p.lastAction = opening ? 'bet' : 'raise';
      if (allin) p.allin = p.stack === 0;
    }

    closeStreet() {
      if (this.result) return;
      const contenders = this.inHand();
      if (contenders.length <= 1) return this.finishFold(contenders[0]);
      if (this.street === 'river') return this.showdown();
      this.deck.pop(); // burn before every community street
      if (this.street === 'preflop') {
        for (let k = 0; k < 3; k++) this.board.push(this.deck.pop());
        this.street = 'flop';
      } else {
        this.board.push(this.deck.pop());
        this.street = this.street === 'flop' ? 'turn' : 'river';
      }
      this.players.forEach((p) => { p.bet = 0; });
      this.currentBet = 0;
      this.minRaise = this.bb;
      this.actedSinceRaise.clear();
      this.needsAction = new Set(this.players
        .filter((p) => !p.folded && !p.out && !p.allin).map((p) => p.seat));
      if (this.needsAction.size <= 1) return this.runoutAndShowdown();
      this.advance(this.button, false);
    }

    runoutAndShowdown() {
      while (this.board.length < 5) {
        this.deck.pop(); // burn before the next street
        const n = this.board.length === 0 ? 3 : 1;
        for (let k = 0; k < n && this.board.length < 5; k++) this.board.push(this.deck.pop());
      }
      this.street = 'river';
      return this.showdown();
    }

    // A folded player can have committed more than any live stack; the
    // uncalled part of that wager is returned to them, never counted in a pot
    // nobody can win.
    refundUncalled() {
      const live = this.inHand();
      const maxLive = live.reduce((m, p) => Math.max(m, p.total), 0);
      this.players.forEach((p) => {
        if (p.folded && p.total > maxLive) {
          p.stack += p.total - maxLive;
          p.total = maxLive;
        }
      });
    }

    finishFold(winner) {
      this.refundUncalled();
      const pot = this.pot();
      if (winner) winner.stack += pot;
      this.result = {
        pot: pot,
        showdown: false,
        board: this.board.slice(),
        pots: pot ? [{ amount: pot, eligible: winner ? [winner.seat] : [] }] : [],
        winners: winner ? [{ seat: winner.seat, name: winner.name, amount: pot }] : [],
        hands: []
      };
      this.settle();
      return this.result;
    }

    showdown() {
      this.refundUncalled();
      const contenders = this.inHand();
      const scores = {};
      const hands = [];
      contenders.forEach((p) => {
        const score = Core.evaluate(p.hole.concat(this.board));
        scores[p.seat] = score;
        hands.push({ seat: p.seat, name: p.name, score, hand: Core.handName(score) });
      });
      const potTotal = this.pot();
      const pots = buildPots(this.players);
      const wins = awardPots(this.players, scores, this.button);
      const winners = [];
      wins.forEach((amount, seat) => {
        const p = this.players[seat];
        p.stack += amount;
        winners.push({ seat, name: p.name, amount });
      });
      this.result = {
        pot: potTotal,
        showdown: true,
        board: this.board.slice(),
        pots: pots.map((p) => ({ amount: p.amount, eligible: p.eligible.map((q) => q.seat) })),
        winners, hands
      };
      this.settle();
      return this.result;
    }

    settle() {
      // The pot has been awarded; clear street commitments so pot() is zero
      // and the only chips left are in stacks (conserved).
      this.players.forEach((p) => { p.bet = 0; p.total = 0; });
      this.currentBet = 0;
      this.minRaise = this.bb;
      this.acting = -1;
      this.street = 'showdown';
      this.needsAction.clear();
      const total = this.chipTotal();
      if (total !== this.totalChips) {
        throw new Error('chip conservation violated: ' + total + ' != ' + this.totalChips);
      }
    }
  }

  const api = { Table, buildPots, awardPots, makeRng, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
