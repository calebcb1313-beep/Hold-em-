/* bots.js — opponent brains. Personalities, generated names, per-hand moods,
   pot-odds / equity decisions, exploration of the human's tendencies.
   Depends on poker-core.js (PokerCore). No DOM. */
(function (root) {
  'use strict';

  const Core = (typeof module !== 'undefined' && module.exports) ? require('./poker-core.js') : root.PokerCore;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const rnd = Math.random;
  const pick = (a, r) => a[Math.floor((r || rnd)() * a.length)];

  /* ---------------- name generator ---------------- */
  const FIRST = ['Marcus', 'Priya', 'Tomas', 'Yuki', 'Rosa', 'Elias', 'Nadia', 'Dimitri', 'Keisha', 'Arjun',
    'Sofia', 'Beto', 'Hana', 'Viktor', 'Amara', 'Luca', 'Ingrid', 'Malik', 'Chen', 'Noor',
    'Paulo', 'Zoe', 'Rafael', 'Mei', 'Andre', 'Farah', 'Otto', 'Sana', 'Nico', 'Leila',
    'Gus', 'Ivy', 'Ramon', 'Tessa', 'Jae', 'Bruno', 'Anya', 'Kwame', 'Delia', 'Iker',
    'Mila', 'Rusty', 'Simone', 'Hugo', 'Dario', 'Freya', 'Omar', 'Lena', 'Kai', 'Ruth',
    'Mateo', 'Nina', 'Sal', 'Yara', 'Dev', 'Esme', 'Tariq', 'Greta', 'Bo', 'Lin'];
  const LAST = ['Vale', 'Okafor', 'Lindqvist', 'Moreau', 'Castellanos', 'Nakamura', 'Bishop', 'Duarte', 'Kovac',
    'Salim', 'Bright', 'Osei', 'Ferreira', 'Hale', 'Tanaka', 'Bauer', 'Reyes', 'Novak', 'Strand', 'Aziz',
    'Costa', 'Warden', 'Iqbal', 'Larsen', 'Mbeki', 'Rossi', 'Vance', 'Sato', 'Delgado', 'Kaur',
    'Weiss', 'Frost', 'Molina', 'Nash', 'Petrov', 'Adeyemi', 'Blume', 'Calloway'];
  const NICK = ['Ice', 'The Wall', 'Doc', 'Cash', 'The Ghost', 'Tank', 'Slick', 'Hammer', 'Ace', 'The Kid',
    'Vulture', 'Duke', 'Rocket', 'Lucky', 'The Professor', 'Bones', 'Maverick', 'Pirate', 'Sunshine', 'Mad Dog'];

  function genName(r) {
    const f = pick(FIRST, r), l = pick(LAST, r);
    if (r() < 0.34) return f + ' \u201C' + pick(NICK, r) + '\u201D';
    return f + ' ' + l[0] + '.';
  }

  /* ---------------- personalities ---------------- */
  // vpip: how many hands they play. pfr: how often they raise before the flop.
  // aggr: post-flop betting. bluff: pure bluffs. callDown: stickiness (0 folds, 1 station).
  // trap: slow-plays monsters. sizing: bet size multiplier. overbet: taste for big sizing.
  const ARCH = [
    {
      id: 'shark', label: 'Shark', w: 6, vpip: 0.28, pfr: 0.22, aggr: 0.62, bluff: 0.12, callDown: 0.46,
      trap: 0.2, sizing: 1.0, overbet: 0.06,
      chat: {
        raise: ['Let us find out.', 'I am putting you to the test.', 'That is a big number.', 'You are not folding, are you?'],
        call: ['I will see it.', 'Call.', 'Show me.', 'Price is right.'],
        fold: ['Not this one.', 'Take it.', 'I will wait.', 'Yours.'],
        win: ['That is how it is done.', 'Ship it.', 'Thank you kindly.'], lose: ['Nice hand.', 'Good for you.']
      }
    },
    {
      id: 'pro', label: 'Pro', w: 6, vpip: 0.25, pfr: 0.2, aggr: 0.58, bluff: 0.1, callDown: 0.42,
      trap: 0.26, sizing: 0.95, overbet: 0.04,
      chat: {
        raise: ['Standard.', 'Value.', 'I think you are weak.', 'Raise.'],
        call: ['I call.', 'Fine.', 'Let us see the turn.'],
        fold: ['I will pass.', 'Not enough there.', 'Folding.'],
        win: ['Good pot.', 'Mine.'], lose: ['Correct play, wrong result.', 'Well played.']
      }
    },
    {
      id: 'nit', label: 'Nit', w: 5, vpip: 0.16, pfr: 0.12, aggr: 0.34, bluff: 0.04, callDown: 0.2,
      trap: 0.34, sizing: 0.85, overbet: 0.01,
      chat: {
        raise: ['Now I have a hand.', 'Raise.', 'I do not do this often.'],
        call: ['I will call, but I do not like it.', 'Hmm.'],
        fold: ['Too rich for me.', 'I fold.', 'Patience.'],
        win: ['Told you.'], lose: ['Unbelievable.']
      }
    },
    {
      id: 'rock', label: 'Rock', w: 4, vpip: 0.13, pfr: 0.09, aggr: 0.3, bluff: 0.03, callDown: 0.15,
      trap: 0.4, sizing: 0.8, overbet: 0.01,
      chat: {
        raise: ['Raise.', 'I have it.'],
        call: ['Call.'], fold: ['No.', 'Fold.'], win: ['Naturally.'], lose: ['Hmph.']
      }
    },
    {
      id: 'station', label: 'Station', w: 6, vpip: 0.58, pfr: 0.06, aggr: 0.16, bluff: 0.04, callDown: 0.95,
      trap: 0.05, sizing: 0.7, overbet: 0.01,
      chat: {
        raise: ['Fine, I raise.', 'Why not.'],
        call: ['I call.', 'I am curious.', 'You cannot bluff me.', 'Show it.'],
        fold: ['Okay, you win this one.', 'I fold.'],
        win: ['I knew it!', 'Pay me.'], lose: ['Wow.', 'Again?']
      }
    },
    {
      id: 'maniac', label: 'Maniac', w: 4, vpip: 0.64, pfr: 0.5, aggr: 0.82, bluff: 0.32, callDown: 0.72,
      trap: 0.05, sizing: 1.25, overbet: 0.22,
      chat: {
        raise: ['ALL DAY.', 'Let us gamble!', 'I do not fold.', 'POT.'],
        call: ['I call.', 'Whatever.', 'Sure.'],
        fold: ['Fine, fine.', 'Take it, take it.'],
        win: ['SHIP IT!', 'Hahaha!'], lose: ['Bad beat!' ]
      }
    },
    {
      id: 'lag', label: 'LAG', w: 5, vpip: 0.44, pfr: 0.34, aggr: 0.74, bluff: 0.24, callDown: 0.56,
      trap: 0.12, sizing: 1.1, overbet: 0.14,
      chat: {
        raise: ['Pressure.', 'I like this board.', 'Raise.', 'Your turn to guess.'],
        call: ['Call.', 'I will bite.'],
        fold: ['Not now.', 'Fine.'],
        win: ['Aggression pays.', 'Yes!'], lose: ['Sick.']
      }
    },
    {
      id: 'bully', label: 'Bully', w: 4, vpip: 0.38, pfr: 0.3, aggr: 0.8, bluff: 0.3, callDown: 0.5,
      trap: 0.08, sizing: 1.35, overbet: 0.28,
      chat: {
        raise: ['You fold too much.', 'BIG.', 'Scared?', 'I am buying this pot.'],
        call: ['Fine.', 'I call.'],
        fold: ['Keep it.', 'Ugh.'],
        win: ['Easy game.', 'Mine.'], lose: ['You got lucky.']
      }
    },
    {
      id: 'trapper', label: 'Trapper', w: 4, vpip: 0.27, pfr: 0.14, aggr: 0.36, bluff: 0.08, callDown: 0.6,
      trap: 0.78, sizing: 0.9, overbet: 0.02,
      chat: {
        raise: ['Surprise.', 'Now I raise.', 'Gotcha.'],
        call: ['Call.', 'I will keep you in.', 'Interesting.'],
        fold: ['I will let it go.', 'No.'],
        win: ['Patience.', 'Trapped you.'], lose: ['Hmm.']
      }
    },
    {
      id: 'gambler', label: 'Gambler', w: 4, vpip: 0.56, pfr: 0.4, aggr: 0.66, bluff: 0.26, callDown: 0.78,
      trap: 0.06, sizing: 1.15, overbet: 0.16,
      chat: {
        raise: ['Fortune favours me.', 'Raise!', 'Let it ride.'],
        call: ['I call.', 'One time!', 'Deal.'],
        fold: ['Not my hand.', 'Next.'],
        win: ['Lucky me.', 'Yes!'], lose: ['Unlucky.']
      }
    },
    {
      id: 'folder', label: 'Folder', w: 4, vpip: 0.21, pfr: 0.16, aggr: 0.3, bluff: 0.05, callDown: 0.24,
      trap: 0.2, sizing: 0.85, overbet: 0.02,
      chat: {
        raise: ['Raise.', 'Try this.'],
        call: ['Call.'], fold: ['I will fold.', 'Yours.', 'Too much.'],
        win: ['Good.'], lose: ['Of course.']
      }
    },
    {
      id: 'wild', label: 'Wildcard', w: 5, vpip: 0.4, pfr: 0.28, aggr: 0.55, bluff: 0.2, callDown: 0.55,
      trap: 0.15, sizing: 1.0, overbet: 0.1,
      chat: {
        raise: ['Why not.', 'Feeling lucky.', 'Raise.', 'Let us dance.'],
        call: ['Sure.', 'I call.'],
        fold: ['Nope.', 'Okay.'],
        win: ['Ha!', 'Chaos wins.'], lose: ['Ha. Wow.']
      }
    }
  ];

  function strategyFor(a, r) {
    return {
      vpip: clamp(a.vpip + (r() - 0.5) * 0.09, 0.08, 0.82),
      pfr: clamp(a.pfr + (r() - 0.5) * 0.07, 0.03, 0.75),
      aggr: clamp(a.aggr + (r() - 0.5) * 0.16, 0.08, 0.96),
      bluff: clamp(a.bluff + (r() - 0.5) * 0.07, 0.01, 0.45),
      callDown: clamp(a.callDown + (r() - 0.5) * 0.16, 0.05, 0.98),
      trap: clamp(a.trap + (r() - 0.5) * 0.14, 0, 0.85),
      sizing: clamp(a.sizing + (r() - 0.5) * 0.22, 0.5, 1.7),
      overbet: clamp(a.overbet + (r() - 0.5) * 0.04, 0, 0.35)
    };
  }

  function makeBot(i, skill, rng, forceId) {
    const r = rng || Math.random;
    let a;
    if (forceId) {
      a = ARCH.filter((x) => x.id === forceId)[0];
    }
    if (!a) {
      const pool = ARCH;
      let total = 0;
      for (const x of pool) total += x.w;
      let t = r() * total;
      a = pool[pool.length - 1];
      for (const x of pool) { t -= x.w; if (t <= 0) { a = x; break; } }
    }

    const band = clamp(skill == null ? 0.4 : skill, 0, 1);
    const bot = Object.assign({
      id: 'b' + i + '_' + Math.floor(r() * 1e7).toString(36),
      arch: a.id,
      label: a.label,
      hue: Math.floor(r() * 360),
      name: genName(r),
      skill: clamp(0.42 + band * 0.58 + (r() - 0.5) * 0.1, 0.3, 1),
      noise: clamp(0.12 - band * 0.075 + (r() - 0.5) * 0.03, 0.02, 0.15),
      chat: a.chat,
      mood: null,
      seen: 0,
      hands: 0,
      vpipCount: 0,
      pfrCount: 0,
      aggrCount: 0
    }, strategyFor(a, r));
    bot.sims = Math.round(110 + band * 190);
    bot.tilt = 0;
    return bot;
  }

  // A fresh table full of strangers. Distinct archetypes, no duplicate names.
  function makeRoster(n, skill, rng) {
    const r = rng || Math.random;
    const roster = [];
    const used = new Set();
    const order = ARCH.slice().sort(() => r() - 0.5);
    for (let i = 0; i < n; i++) {
      const forced = i < order.length && r() < 0.85 ? order[i].id : null;
      const band = clamp((skill == null ? 0.4 : skill) + (r() - 0.5) * 0.16, 0, 1);
      let bot = makeBot(i, band, r, forced);
      let guard = 0;
      while (used.has(bot.name) && guard++ < 30) bot = makeBot(i, band, r, forced);
      used.add(bot.name);
      roster.push(bot);
    }
    return roster;
  }

  // Mood is re-rolled every hand: the same player is not the same player every orbit.
  function newMood(bot, r) {
    r = r || Math.random;
    let aggr = 0.78 + r() * 0.46;
    let loose = 0.86 + r() * 0.32;
    if (r() < 0.14) { aggr = 1.35; loose = 1.25; }        // "feeling it" hand
    else if (r() < 0.1) { aggr = 0.55; loose = 0.72; }    // distracted / card dead
    const tilt = bot.tilt > 0 ? 1 + bot.tilt * 0.5 : 1;
    return { aggr: aggr * tilt, loose: loose * (1 + bot.tilt * 0.2) };
  }

  function read(bot) {
    if (!bot || bot.seen < 6) return '';
    const v = bot.vpip;
    const a = bot.aggr;
    let style;
    if (v >= 0.45) style = 'Loose';
    else if (v <= 0.2) style = 'Tight';
    else style = 'Balanced';
    let post;
    if (a >= 0.68) post = 'aggressive';
    else if (a <= 0.32) post = 'passive';
    else post = 'measured';
    return style + ' \u00B7 ' + post;
  }

  function chatFor(bot, kind, r) {
    const bank = bot.chat && bot.chat[kind];
    if (!bank || !bank.length) return '';
    return pick(bank, r);
  }

  /* ---------------- decision ---------------- */
  // ctx: {hole, board, pot, toCall, cur, minRaise, myBet, myChips, nOpp, bb, sb,
  //       street, late, nPlayers, heroProfile, rng}
  function decide(bot, x) {
    const R = x.rng || Math.random;
    const hole = x.hole || [];
    const board = x.board || [];
    const bb = x.bb || 2, sb = x.sb || 1;
    if (hole.length < 2) return { type: 'call' };
    const pot = Math.max(bb, x.pot || 0);
    const cur = x.cur || 0;
    const toCall = Math.max(0, (x.toCall == null ? cur - (x.myBet || 0) : x.toCall));
    const myBet = x.myBet || 0;
    const myChips = Math.max(0, x.myChips || 0);
    const maxTo = myChips + myBet;
    const minTo = Math.min(maxTo, cur + Math.max(bb, x.minRaise || bb));
    const canRaise = maxTo > cur;
    const nOpp = Math.max(1, x.nOpp || 1);
    const multi = clamp((nOpp - 1) / 4, 0, 1);
    const hero = x.heroProfile || {};
    const maniac = clamp(hero.maniac || 0, 0, 1);
    const stationHero = clamp(hero.callHappy || 0, 0, 1);

    const m = bot.mood || (bot.mood = newMood(bot, R));
    const aggr = bot.aggr * m.aggr;
    const loose = m.loose;

    const raiseTo = (to) => {
      if (!canRaise) return { type: 'call' };
      let t = Math.round(to / Math.max(1, sb)) * Math.max(1, sb);
      t = clamp(t, minTo, maxTo);
      if (t <= cur) return { type: 'call' };
      return { type: 'raise', to: t };
    };
    const potAfter = pot + toCall;
    const sizeTo = (frac) => {
      // frac of the pot after calling, in addition to the current bet
      const base = Math.max(bb, potAfter * frac * bot.sizing);
      return raiseTo(cur + base);
    };

    const eq = Core.equity(hole, board, nOpp, bot.sims, R);
    const noise = (R() - 0.5) * bot.noise * 2;

    /* ---- preflop ---- */
    if (board.length === 0) {
      const ps = Core.preflopStrength(hole);
      const pair = (hole[0] >> 2) === (hole[1] >> 2);
      const suited = (hole[0] & 3) === (hole[1] & 3);
      // vpip is the fraction of hands this player likes, so the bar sits at that percentile.
      const playThresh = clamp(0.425 - bot.vpip * 0.4, 0.10, 0.46)
        - (loose - 1) * 0.12 - (bot.callDown - 0.5) * 0.04;
      const openSize = Math.max(bb * 2, Math.round((bb * (2.3 + R() * 1.1)) / Math.max(1, sb)) * Math.max(1, sb));
      const facingRaise = cur > bb;

      // Short stack: push or fold.
      if (myChips <= bb * 9) {
        const pushThresh = 0.5 - bot.vpip * 0.12 + multi * 0.05;
        if (ps > pushThresh && canRaise) return raiseTo(maxTo);
        if (toCall > 0 && ps > pushThresh - 0.06) return { type: 'call' };
        if (toCall === 0) return { type: 'call' };
        return { type: 'fold' };
      }

      if (!facingRaise) {
        const premium = ps > 0.86 - maniac * 0.03;
        if (premium && canRaise && R() < 0.9) return raiseTo(Math.max(minTo, openSize * (1 + R() * 0.5)));
        if (ps + (R() - 0.5) * bot.noise > playThresh) {
          const raiseP = clamp((bot.pfr / Math.max(0.08, bot.vpip)) * (0.6 + aggr * 0.55), 0, 0.95);
          if (canRaise && R() < raiseP) return raiseTo(openSize);
          if (toCall === 0) return { type: 'call' };
          if (toCall <= bb * 1.3 || bot.callDown > 0.7 || R() < 0.4) return { type: 'call' };
          return { type: 'fold' };
        }
        if (toCall === 0) {
          // Big blind stab at a limped pot.
          if (canRaise && R() < aggr * 0.22) return raiseTo(openSize);
          return { type: 'call' };
        }
        if (canRaise && x.late && R() < bot.bluff * 1.7 * aggr) return raiseTo(openSize);
        return { type: 'fold' };
      }

      // Facing a raise.
      // Facing a shove is its own decision: price, read and nerve.
      if (toCall >= myChips * 0.8) {
        // The bar drops for sticky players and for known maniacs whose range is any two.
        const shoveCall = clamp(0.32 + (1 - maniac) * 0.1 - maniac * 0.08
          - (bot.callDown - 0.5) * 0.16 - (loose - 1) * 0.12 + multi * 0.03, 0.18, 0.6);
        if (ps > shoveCall) return { type: 'call' };
        if (pair && ps > shoveCall - 0.13 && R() < 0.45) return { type: 'call' };
        if (maniac > 0.35 && suited && ps > shoveCall - 0.08 && R() < 0.35) return { type: 'call' };
        return { type: 'fold' };
      }
      const vsRaise = clamp(0.78 - (loose - 1) * 0.2 - (bot.callDown - 0.5) * 0.1
        + multi * 0.07 - maniac * 0.15, 0.42, 0.9);
      if (ps > 0.92 && canRaise && R() < 0.8) return raiseTo(Math.min(maxTo, Math.max(minTo, cur * 3)));
      if (ps > 0.74 && canRaise && R() < aggr * 0.5) return raiseTo(Math.max(minTo, cur * 2.6));
      if (ps > vsRaise) return { type: 'call' };
      if (toCall <= bb * 2.2 && ps > vsRaise - 0.09 && R() < bot.callDown * 0.8) return { type: 'call' };
      // Defend the big blind cheaply with playable hands.
      if (toCall <= bb * 1.5 && pair && ps > 0.28 && R() < 0.45 + bot.callDown * 0.3) return { type: 'call' };
      return { type: 'fold' };
    }

    /* ---- post-flop ---- */
    const tex = Core.texture(board, hole);
    const made = Core.category(Core.evaluate(hole.concat(board)));
    const draw = tex.flushDraw || tex.straightOuts >= 2;
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const monster = made >= 5 || (made >= 3 && eq > 0.78) || eq > 0.9 || (made === 2 && eq > 0.8);
    const strong = eq > 0.7 + multi * 0.05;
    const decent = eq > 0.47;
    const boardScary = tex.wet || tex.paired || tex.broadway >= 3;

    const bluffFreq = clamp(bot.bluff * (0.55 + aggr * 0.85) * (hero.foldsALot ? 1.55 : 1)
      * (multi > 0.5 ? 0.7 : 1) * (stationHero > 0.5 ? 0.45 : 1), 0.005, 0.5);
    const trap = clamp(bot.trap * (monster ? 1 : 0.2), 0, 0.85);

    // Nobody has bet: check or take the initiative.
    if (toCall <= 0) {
      if (!canRaise) return { type: 'call' };
      if (monster) {
        if (R() < trap * 0.9) return { type: 'call' };            // slow-play
        return sizeTo(0.6 + R() * 0.5);
      }
      if (strong && R() < 0.6 + aggr * 0.3) return sizeTo(0.5 + R() * 0.42);
      if (decent && R() < aggr * 0.34) return sizeTo(0.38 + R() * 0.2);
      if (draw && R() < 0.34 + aggr * 0.34) return sizeTo(0.55 + R() * 0.25);
      if (R() < bluffFreq) return sizeTo(R() < bot.overbet ? 1.35 : 0.72);
      return { type: 'call' };
    }

    // Facing a bet.
    const implied = draw && x.street < 3 ? 0.045 : 0;
    const stick = (bot.callDown - 0.5);
    const needEq = potOdds + 0.01 + multi * 0.025 - stick * 0.11 - implied + (1 - bot.skill) * 0.02;
    let strength = eq + noise;
    const allIn = toCall >= myChips * 0.72;

    if (allIn) {
      const maniacBonus = maniac * 0.14;
      const shoveNeed = needEq + 0.02 - maniacBonus - stick * 0.05;
      if (monster) {
        if (canRaise && R() < 0.35) return raiseTo(maxTo);
        return { type: 'call' };
      }
      if (strength > shoveNeed + 0.03) return { type: 'call' };
      // Sticky players and made hands find hero calls.
      if (made >= 2 && R() < bot.callDown * 0.45) return { type: 'call' };
      if (made === 1 && R() < bot.callDown * 0.18 && toCall < pot * 0.6) return { type: 'call' };
      if (maniac > 0.35 && made >= 1 && R() < 0.4) return { type: 'call' };
      return { type: 'fold' };
    }

    if (monster) {
      if (canRaise && R() > trap * 0.5) return sizeTo(0.7 + R() * 0.6);
      return { type: 'call' };
    }
    if (strength > needEq) {
      if (canRaise && (strong || made >= 2) && R() < aggr * 0.55) return sizeTo(0.58 + R() * 0.4);
      return { type: 'call' };
    }
    // Semi-bluff with draws, occasional bluff raise.
    if (canRaise && draw && R() < bluffFreq * 1.1 && toCall < pot * 0.55) return sizeTo(0.85);
    if (canRaise && R() < bluffFreq * 0.45) return sizeTo(boardScary ? 1.0 : 0.8);
    // Cheap calls keep the game alive and are realistic with any equity.
    if (toCall <= Math.max(bb, pot * 0.1) && (decent || made >= 1) && R() < 0.35 + bot.callDown * 0.4) return { type: 'call' };
    return { type: 'fold' };
  }

  const api = { ARCH, makeBot, makeRoster, newMood, read, decide, chatFor, genName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bots = api;
})(typeof self !== 'undefined' ? self : this);
