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
    'Vulture', 'Duke', 'Rocket', 'Lucky', 'The Professor', 'Bones', 'Maverick', 'Pirate', 'Sunshine', 'Mad Dog',
    'Preacher', 'Dusty', 'Six-Gun', 'Whiskey', 'Parson', 'Deadeye', 'Buckshot', 'Sundance', 'Cotton', 'Reverend',
    'Hatchet', 'Slim'];
  FIRST.push('Hollis', 'Emmett', 'Wade', 'Cletus', 'Josiah', 'Mabel', 'Rufus', 'Silas', 'Tobias', 'Wyatt',
    'Cordell', 'Ezra', 'Lyle', 'Otis', 'Vernon', 'Clay', 'Dewey', 'Hank', 'Ira', 'Jeb');
  LAST.push('McCabe', 'Bramble', 'Cutter', 'Dunmore', 'Fisk', 'Gantry', 'Hobbs', 'Keller', 'Larkin', 'Mercer',
    'Pike', 'Quill', 'Rourke', 'Stroud', 'Tully', 'Vickers', 'Whitlock', 'Baird', 'Cobb', 'Slade');

  // A tell is a habit, not a random line: every regular has one per state and
  // keeps it for the whole session, so the player can actually learn the table.
  const TELLS = {
    strong: ['counts his stack', 'sits up straight', 'stares you down', 'leans forward', 'tips his hat',
      'goes very still'],
    weak: ['checks his cards again', 'slumps in his chair', 'fidgets with a chip', 'will not meet your eye',
      'sighs', 'shifts in his seat'],
    bluff: ['talks a little too much', 'over-stacks his chips', 'taps the felt twice', 'grins at the felt',
      'shrugs too quickly', 'reaches for his glass']
  };

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
    },
    {
      id: 'honest', label: 'Straight Shooter', w: 5, vpip: 0.24, pfr: 0.16, aggr: 0.42, bluff: 0.005,
      callDown: 0.55, trap: 0.18, sizing: 0.95, overbet: 0.03,
      chat: {
        raise: ['I have it.', 'No bluff here.', 'You should fold.'], call: ['I call.', 'Show me.'],
        fold: ['Not for me.', 'I fold.'], win: ['Straightforward.'], lose: ['Fair enough.']
      }
    },
    {
      id: 'bluffer', label: 'Bluffer', w: 4, vpip: 0.72, pfr: 0.44, aggr: 0.84, bluff: 0.44,
      callDown: 0.62, trap: 0.04, sizing: 1.3, overbet: 0.3,
      chat: {
        raise: ['POT.', 'You cannot have it every time.', 'I am buying it.', 'Raise!'],
        call: ['I call.', 'Why not.'], fold: ['Fine.', 'Take it.'], win: ['Told you.', 'Hah!'],
        lose: ['Whatever.']
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
      tells: {
        strong: pick(TELLS.strong, r), weak: pick(TELLS.weak, r), bluff: pick(TELLS.bluff, r)
      },
      mood: null,
      seen: 0,
      hands: 0,
      preDecisions: 0,
      postDecisions: 0,
      vpipCount: 0,
      pfrCount: 0,
      aggrCount: 0,
      memory: {}
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

  // ---- observed hand history: every bot builds its own book on every opponent ----
  function ensureMemory(bot, id) {
    const mem = bot.memory || (bot.memory = {});
    let m = mem[id];
    if (!m) {
      m = mem[id] = {
        seen: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, folds: 0,
        faced: 0, foldFaced: 0, showdowns: 0, strength: 0
      };
    }
    return m;
  }

  function noteAction(bot, oppId, info) {
    if (!bot || !oppId) return;
    const m = ensureMemory(bot, oppId);
    m.seen++;
    if (info.pre) {
      if (info.type !== 'fold') m.vpip++;
      if (info.type === 'raise') m.pfr++;
    }
    if (info.faced) {
      m.faced++;
      if (info.type === 'fold') m.foldFaced++;
    }
    if (info.type === 'raise') m.bets++;
    else if (info.type === 'fold') m.folds++;
    else m.calls++;
  }

  function noteShowdown(bot, oppId, category) {
    if (!bot || !oppId) return;
    const m = ensureMemory(bot, oppId);
    m.showdowns++;
    m.strength += category;
  }

  function readsFor(bot, ids, aggressorId) {
    const mem = (bot && bot.memory) || {};
    let seen = 0, bets = 0, calls = 0, folds = 0, faced = 0, foldFaced = 0, show = 0, showSum = 0;
    (ids || []).forEach((id) => {
      const m = mem[id];
      if (!m) return;
      seen += m.seen; bets += m.bets; calls += m.calls; folds += m.folds;
      faced += m.faced; foldFaced += m.foldFaced; show += m.showdowns; showSum += m.strength;
    });
    const confident = seen >= 4;
    let aggAggr = 0.35, aggSeen = 0;
    if (aggressorId && mem[aggressorId]) {
      const a = mem[aggressorId];
      aggSeen = a.seen;
      aggAggr = a.bets / Math.max(1, a.bets + a.calls);
    }
    return {
      hands: seen,
      confident,
      foldToBet: confident && faced ? foldFaced / faced : 0.35,
      callRate: confident ? calls / Math.max(1, calls + folds) : 0.45,
      aggression: confident ? bets / Math.max(1, bets + calls) : 0.35,
      showdown: show ? showSum / show / 8 : 0.4,
      aggAggr: aggSeen >= 2 ? aggAggr : 0.35
    };
  }

  // Public read: what the human sees on the seat, built from real observed play.
  function readLive(bot) {
    if (!bot) return '';
    const pre = bot.preDecisions || 0;
    if (pre < 8) return '';
    const v = bot.vpipCount / pre;
    const p = bot.pfrCount / pre;
    const post = Math.max(1, bot.postDecisions || 1);
    const a = (bot.aggrCount || 0) / post;
    const style = v >= 0.45 ? 'Loose' : v <= 0.2 ? 'Tight' : 'Balanced';
    const postLabel = (a >= 0.22 || p >= 0.35) ? 'aggressive' : a <= 0.06 ? 'passive' : 'measured';
    return style + ' - ' + postLabel;
  }

  function chatFor(bot, kind, r) {
    const bank = bot.chat && bot.chat[kind];
    if (!bank || !bank.length) return '';
    return pick(bank, r);
  }

  /* ---------------- decision ---------------- */
  // ctx: {hole, board, pot, toCall, cur, minRaise, myBet, myChips, nOpp, bb, sb,
  //       street, late, nPlayers, heroProfile, rng}
  // Equity-driven decisions: ranges, pot odds, implied odds, fold equity,
  // board texture, multi-street plans and live exploits of the table.
  function decideAction(bot, x) {
    const R = x.rng || Math.random;
    const hole = x.hole || [];
    const board = x.board || [];
    const bb = x.bb || 2, sb = x.sb || 1;
    if (hole.length < 2) return { type: 'call' };
    const pot = Math.max(bb, x.pot || 0);
    const cur = x.cur || 0;
    const myBet = x.myBet || 0;
    const toCall = Math.max(0, x.toCall == null ? cur - myBet : x.toCall);
    const myChips = Math.max(0, x.myChips || 0);
    const maxTo = myChips + myBet;
    const minTo = Math.min(maxTo, cur + Math.max(bb, x.minRaise || bb));
    const canRaise = maxTo > cur;
    const nOpp = Math.max(1, x.nOpp || 1);
    const multi = clamp((nOpp - 1) / 4, 0, 1);
    const hero = x.heroProfile || {};
    const maniac = clamp(hero.maniac || 0, 0, 1);
    const stationHero = clamp(hero.callHappy || 0, 0, 1);
    const reads = x.reads || {};
    const tableFold = reads.confident ? clamp(reads.foldToBet, 0.05, 0.85) : 0.34;
    const tableCall = reads.confident ? clamp(reads.callRate, 0, 1) : 0.45;
    const aggroRead = clamp(reads.aggAggr == null ? 0.35 : reads.aggAggr, 0, 1);

    const mood = bot.mood || (bot.mood = newMood(bot, R));
    const aggr = clamp(bot.aggr * mood.aggr, 0.05, 1.3);
    const loose = mood.loose;
    const skill = clamp(bot.skill, 0.3, 1);
    const stick = bot.callDown - 0.5;

    const raiseTo = (to) => {
      if (!canRaise) return { type: 'call' };
      const unit = Math.max(1, sb);
      let t = Math.round(to / unit) * unit;
      t = clamp(t, minTo, maxTo);
      if (t <= cur) return { type: 'call' };
      return { type: 'raise', to: t };
    };
    const potAfter = pot + toCall;
    const sizeTo = (frac) => {
      const base = Math.max(bb, potAfter * frac * bot.sizing);
      return raiseTo(cur + base);
    };
    const roundBB = (v) => Math.max(minTo, Math.round(v / Math.max(1, sb)) * Math.max(1, sb));

    const eq = Core.equity(hole, board, nOpp, bot.sims, R);
    const noise = (R() - 0.5) * bot.noise * 0.9;
    const eqN = clamp(eq + noise, 0, 1);
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

    /* ---------------- pre-flop ---------------- */
    if (!board.length) {
      bot.plan = null;
      const ps = Core.preflopStrength(hole);
      bot._pre = true; bot._ps = ps; bot._made = -1;
      const pair = (hole[0] >> 2) === (hole[1] >> 2);
      const suited = (hole[0] & 3) === (hole[1] & 3);
      const gap = Math.abs((hole[0] >> 2) - (hole[1] >> 2));
      const conn = !pair && gap <= 2;
      const pos = x.late ? 1 : 0;
      const stackBB = myChips / bb;
      const facingRaise = cur > bb;

      // Short stack: shove or fold, judged on equity against the price.
      if (stackBB <= 12) {
        const need = toCall > 0 ? toCall / (pot + toCall) : 0;
        const handEq = clamp(0.16 + ps * 0.66, 0, 0.95);
        const callNeed = need + 0.02 - maniac * 0.06 - stick * 0.04 - (1 - skill) * 0.02;
        if (canRaise && (ps > 0.54 - bot.vpip * 0.1 || (pos && ps > 0.46 && R() < 0.5))) {
          return raiseTo(maxTo);
        }
        if (toCall > 0) return handEq > callNeed ? { type: 'call' } : { type: 'fold' };
        return { type: 'call' };
      }

      if (!facingRaise) {
        const openBar = clamp(0.46 - bot.vpip * 0.44 - pos * 0.045 - (loose - 1) * 0.09
          - (bot.callDown - 0.5) * 0.02 - (pair ? 0.06 : 0) - (suited ? 0.02 : 0), 0.08, 0.5);
        if (ps > 0.9 && canRaise && R() < 0.9) return raiseTo(roundBB(bb * (3 + R() * 1.2)));
        if (ps > openBar) {
          const pfr = clamp(bot.pfr / Math.max(0.06, bot.vpip), 0.05, 0.95);
          if (canRaise && R() < clamp(pfr * (0.75 + aggr * 0.5) + (pos ? 0.05 : 0), 0, 0.96)) {
            return raiseTo(roundBB(bb * (2.2 + R() * 1.2)));
          }
          if (toCall <= bb) return { type: 'call' };
          return { type: 'fold' };
        }
        // Late-position steal against a table that folds too much.
        if (pos && canRaise && toCall <= sb * 2 && R() < clamp(bot.bluff * 2.2 * (0.6 + tableFold), 0, 0.42)) {
          return raiseTo(roundBB(bb * (2.4 + R() * 0.8)));
        }
        return { type: 'call' };
      }

      // Facing an open: 3-bet the top of the range, defend by price.
      if (toCall >= myChips * 0.55) {
        const need = toCall / (pot + toCall);
        const handEq = clamp(0.16 + ps * 0.66, 0, 0.95);
        const exploit = maniac * 0.12 + aggroRead * 0.05 + stick * 0.05 + (loose - 1) * 0.05;
        if (handEq > need + 0.02 - exploit) return { type: 'call' };
        if (pair && ps > 0.55 && R() < 0.4) return { type: 'call' };
        if (suited && conn && ps > 0.4 && R() < 0.22) return { type: 'call' };
        return { type: 'fold' };
      }
      const defend = clamp(0.82 - pos * 0.06 - (loose - 1) * 0.14 - stick * 0.06
        - maniac * 0.1 - (aggroRead - 0.35) * 0.08, 0.5, 0.95);
      if (ps > 0.93 && canRaise && R() < 0.78) return raiseTo(roundBB(Math.max(cur * 3, bb * 9)));
      if (ps > 0.78 && canRaise && R() < aggr * 0.55) return raiseTo(roundBB(cur * 2.8));
      if (ps > defend) return { type: 'call' };
      if (toCall <= bb * 2.5 && (pair || (suited && conn)) && ps > 0.34 && R() < 0.5 + stick * 0.3) {
        return { type: 'call' };
      }
      return { type: 'fold' };
    }

    /* ---------------- post-flop ---------------- */
    const tex = Core.texture(board, hole);
    const made = Core.category(Core.evaluate(hole.concat(board)));
    const flushDraw = !!tex.flushDraw;
    const straightDraw = (tex.straightOuts || 0) >= 2;
    const draw = flushDraw || straightDraw;
    // A call is priced against the bettor, not the whole table. Multi-way
    // equity made routine hands look worthless and caused mass over-folding.
    const eqHU = nOpp > 1
      ? Core.equity(hole, board, 1, Math.max(120, Math.round(bot.sims * 0.7)), R)
      : eq;
    const callEq = clamp(eqHU + noise * 0.6, 0, 1);
    bot._pre = false; bot._eq = callEq; bot._made = made;
    const monster = made >= 5 || (made >= 3 && callEq > 0.8) || callEq > 0.92;
    const strong = callEq > 0.68;
    const medium = callEq > 0.46;
    const air = made <= 0 || (made === 1 && callEq < 0.34);
    const boardScary = !!tex.wet || !!tex.paired || (tex.broadway || 0) >= 3;
    const street = x.street || 1;
    const foldEq = clamp(0.28 + tableFold * 0.5 + (boardScary ? 0.08 : 0)
      - multi * 0.12 - stationHero * 0.18 - tableCall * 0.15, 0.05, 0.85);
    const plan = bot.plan && bot.plan.street === street - 1 ? bot.plan : null;
    const barrel = plan && plan.kind === 'bluff'
      ? clamp(0.38 + aggr * 0.35 + foldEq * 0.3, 0, 0.85) : 0;

    if (toCall <= 0) {
      if (!canRaise) return { type: 'call' };
      if (monster) {
        bot.plan = { kind: 'value', street };
        if (R() < bot.trap * 0.55) return { type: 'call' };
        return sizeTo(boardScary ? 0.85 : 0.6 + R() * 0.25);
      }
      if (strong) {
        bot.plan = { kind: 'value', street };
        const freq = 0.72 + aggr * 0.2;
        if (R() < freq) return sizeTo(boardScary ? 0.7 : 0.55);
        return { type: 'call' };
      }
      if (medium) {
        if (R() < 0.3 + aggr * 0.26) {
          bot.plan = { kind: 'value', street };
          return sizeTo(0.45);
        }
        return { type: 'call' };
      }
      if (draw) {
        if (R() < 0.5 + aggr * 0.32) {
          bot.plan = { kind: 'semi', street };
          return sizeTo(0.6);
        }
        return { type: 'call' };
      }
      const bluff = clamp(bot.bluff * (0.8 + aggr * 0.9) * (1 + foldEq)
        * (1 - stationHero * 0.6) * (street === 3 ? 0.8 : 1)
        * (boardScary ? 1.1 : 0.9), 0.01, 0.55);
      if (R() < bluff || (barrel && R() < barrel)) {
        bot.plan = { kind: 'bluff', street };
        return sizeTo(R() < bot.overbet ? 1.3 : 0.7);
      }
      bot.plan = null;
      return { type: 'call' };
    }

    const implied = draw && street < 3 ? 0.06 : 0;
    const bluffCatch = clamp((aggroRead - 0.45) * 0.12, 0, 0.06);
    // The price, with small exploit adjustments. A flat safety tax here made
    // bots surrender routinely priced hands; a call now needs equity above the
    // real pot odds, not above them plus a premium.
    const need = potOdds + 0.01 - implied - stick * 0.04 - maniac * 0.05
      - bluffCatch + (1 - skill) * 0.015;

    if (toCall >= myChips * 0.75) {
      const shoveNeed = need + 0.01 - maniac * 0.05 - stick * 0.02;
      if (monster || callEq > shoveNeed) return { type: 'call' };
      if (draw && street < 3 && callEq > shoveNeed - 0.03) return { type: 'call' };
      if (made >= 2 && R() < 0.4 + bot.callDown * 0.35) return { type: 'call' };
      return { type: 'fold' };
    }

    if (monster) {
      bot.plan = { kind: 'value', street };
      if (canRaise && R() < 0.22 + bot.trap * 0.35) return sizeTo(1.0);
      return { type: 'call' };
    }
    if (strong) {
      bot.plan = { kind: 'value', street };
      if (canRaise && R() < aggr * 0.5) return sizeTo(0.9);
      return { type: 'call' };
    }
    if (callEq > need + 0.02) {
      if (canRaise && medium && R() < aggr * 0.2) return sizeTo(0.85);
      return { type: 'call' };
    }
    // Small prices: defend any pair, draw or live overcards instead of folding.
    if (toCall <= Math.max(bb, pot * 0.18) && (made >= 1 || draw || callEq > need - 0.04)) {
      if (canRaise && draw && R() < aggr * 0.2) return sizeTo(1.0);
      return { type: 'call' };
    }
    if (draw && toCall < pot * 0.45 && callEq > need - 0.03) {
      if (canRaise && R() < 0.16 + aggr * 0.18) return sizeTo(1.0);
      return { type: 'call' };
    }
    if (canRaise && air && R() < bot.bluff * 0.5 * (0.5 + foldEq) && toCall < pot * 0.5) {
      return sizeTo(boardScary ? 1.05 : 0.8);
    }
    if (made >= 1 && callEq > need - 0.06 && R() < 0.4 + bot.callDown * 0.3) {
      return { type: 'call' };
    }
    bot.plan = null;
    return { type: 'fold' };
  }

  function tellState(bot, a) {
    if (!bot || a.type === 'fold') return '';
    if (bot._pre) {
      const ps = bot._ps || 0;
      if (a.type === 'raise' && ps < 0.58) return 'bluff';
      if (ps > 0.8) return 'strong';
      if (ps < 0.34) return 'weak';
      return '';
    }
    const eq = bot._eq == null ? 0.4 : bot._eq;
    const made = bot._made == null ? 0 : bot._made;
    if (a.type === 'raise' && made <= 1 && eq < 0.56) return 'bluff';
    if (made >= 3 || eq > 0.74) return 'strong';
    if (eq < 0.36 && made <= 1) return 'weak';
    return '';
  }

  // Sharper players hide it better, but every archetype leaks sometimes.
  function tellFor(bot, a) {
    const st = tellState(bot, a);
    if (!st) return '';
    const rate = clamp(0.5 - clamp(bot.skill, 0, 1) * 0.3, 0.14, 0.5);
    if (Math.random() > rate) return '';
    return (bot.tells && bot.tells[st]) || '';
  }

  function decide(bot, x) {
    const a = decideAction(bot, x);
    bot.tell = tellFor(bot, a);
    return a;
  }

  const api = {
    ARCH, makeBot, makeRoster, newMood, read, readLive, decide, tellFor, chatFor, genName,
    noteAction, noteShowdown, readsFor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bots = api;
})(typeof self !== 'undefined' ? self : this);
