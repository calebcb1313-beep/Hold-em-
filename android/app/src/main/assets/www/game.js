/* game.js — Hold'em: UI, career progression, table flow. Needs poker-core.js + bots.js */
(() => {
  'use strict';
  const C = window.PokerCore;
  const B = window.Bots;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M'
    : n >= 1e4 ? Math.round(n / 1e3) + 'k' : fmt(n);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ABORT = { abort: true };

  /* ================= storage ================= */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hlx_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hlx_' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem('hlx_' + k); } catch (e) {} }
  };

  const DEFAULTS = { name: 'You', speed: 'normal', sound: true, vibe: true, fourColor: false, hints: true };
  let S = Object.assign({}, DEFAULTS, store.get('settings', {}));
  const saveSettings = () => store.set('settings', S);

  const CAREER0 = { bankroll: 5000, xp: 0, cleared: 0, tables: 0, hands: 0, won: 0, bestPot: 0, bestHand: '', bestLevel: 1, tournamentWins: 0, trophies: {} };
  let career = Object.assign({}, CAREER0, store.get('career', {}));
  career.trophies = career.trophies || {};
  career.tournamentWins = career.tournamentWins || 0;
  const saveCareer = () => store.set('career', career);

  /* ================= sound ================= */
  let ac = null, master = null, comp = null, voices = 0;

  function audio() {
    if (!S.sound) return null;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 22;
        comp.ratio.value = 5;
        comp.attack.value = 0.003;
        comp.release.value = 0.22;
        master = ac.createGain();
        master.gain.value = 0.85;
        master.connect(comp);
        comp.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { return null; }
    return ac;
  }
  function spend(ms) {
    voices++;
    setTimeout(() => { voices = Math.max(0, voices - 1); }, ms);
  }
  // A voice with an exponential envelope, optional pitch glide.
  function tone(freq, dur, type, vol, delay, glide) {
    const a = audio(); if (!a || voices > 26) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(24, freq), t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(24, glide), t + dur);
    const peak = Math.max(0.0004, vol == null ? 0.05 : vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.04);
    spend((dur + (delay || 0)) * 1000 + 80);
  }
  // Filtered noise: card slides, folds, chip clatter.
  function noise(dur, freq, vol, type, q, delay, sweepTo) {
    const a = audio(); if (!a || voices > 26) return;
    const n = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.7);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    const t = a.currentTime + (delay || 0);
    src.buffer = buf;
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(Math.max(60, freq), t);
    f.Q.value = q == null ? 1 : q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    g.gain.setValueAtTime(Math.max(0.0002, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
    spend((dur + (delay || 0)) * 1000 + 60);
  }
  const chipHits = (count, vol, spread) => {
    for (let i = 0; i < count; i++) {
      const f = 1450 + Math.random() * 1900;
      tone(f, 0.045 + Math.random() * 0.03, 'triangle',
        vol * (0.55 + Math.random() * 0.7), i * spread + Math.random() * 0.012);
    }
    noise(0.05, 3400, vol * 0.5, 'highpass', 0.8, 0);
  };
  const sfx = {
    tap: () => tone(760, 0.035, 'sine', 0.018),
    deal: () => { noise(0.055, 3800, 0.12, 'bandpass', 1.6, 0, 1400); noise(0.028, 1100, 0.05, 'highpass', 0.9, 0.02); },
    flip: () => noise(0.05, 2600, 0.08, 'bandpass', 1.2, 0, 900),
    chip: () => chipHits(2, 0.055, 0.03),
    chips: () => chipHits(5, 0.05, 0.025),
    check: () => { tone(128, 0.085, 'sine', 0.16); noise(0.035, 620, 0.07, 'lowpass', 0.7, 0); },
    fold: () => noise(0.18, 1200, 0.1, 'lowpass', 0.6, 0, 260),
    turn: () => { tone(700, 0.09, 'sine', 0.045); tone(1050, 0.16, 'sine', 0.035, 0.08); },
    raise: () => { chipHits(3, 0.05, 0.03); tone(260, 0.16, 'sawtooth', 0.022, 0, 420); },
    allin: () => {
      tone(240, 0.5, 'sawtooth', 0.03, 0, 1250);
      chipHits(6, 0.05, 0.02);
      tone(88, 0.35, 'sine', 0.11, 0.42);
    },
    pot: () => { for (let i = 0; i < 7; i++) tone(1300 + Math.random() * 1400, 0.06, 'triangle', 0.032, i * 0.035); },
    win: () => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.42, 'triangle', 0.05, i * 0.09));
      tone(1568, 0.7, 'sine', 0.024, 0.36);
    },
    lose: () => { tone(330, 0.3, 'sine', 0.045); tone(247, 0.45, 'sine', 0.045, 0.14); },
    level: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.05, i * 0.08)); },
    blind: () => { tone(880, 0.1, 'square', 0.028); tone(1174, 0.16, 'square', 0.026, 0.12); },
    trophy: () => { [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.5, 'triangle', 0.048, i * 0.1)); },
    bust: () => { tone(196, 0.4, 'sine', 0.06); tone(147, 0.6, 'sine', 0.055, 0.2); noise(0.4, 400, 0.05, 'lowpass', 0.6, 0); }
  };

  const buzz = (ms) => { if (S.vibe && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };

  /* ================= screens ================= */
  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
    if (id === 'menu') renderMenu();
    if (id === 'maps') renderMaps();
    if (id === 'stats') renderStats();
    if (id === 'settings') renderSettings();
    if (id === 'howto') renderHow();
    document.body.dataset.screen = id;
  }
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => { audio(); show(b.dataset.go); }));

  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function modal(html, wire) {
    const m = $('#modal'), sh = $('#sheet');
    sh.innerHTML = html; m.classList.add('on');
    if (wire) wire(sh);
  }
  const closeModal = () => $('#modal').classList.remove('on');
  const modalOpen = () => $('#modal').classList.contains('on');

  /* ================= cards ================= */
  // Every rank gets a real pip layout, so the deck reads as printed cards
  // instead of two letters in a box.
  const PIPS = [
    [[2, 1], [2, 7]], [[2, 1], [2, 4], [2, 7]], [[1, 1], [3, 1], [1, 7], [3, 7]],
    [[1, 1], [3, 1], [2, 4], [1, 7], [3, 7]],
    [[1, 1], [3, 1], [1, 4], [3, 4], [1, 7], [3, 7]],
    [[1, 1], [3, 1], [1, 4], [3, 4], [1, 7], [3, 7], [2, 2]],
    [[1, 1], [3, 1], [1, 4], [3, 4], [1, 7], [3, 7], [2, 2], [2, 6]],
    [[1, 1], [3, 1], [1, 3], [3, 3], [1, 5], [3, 5], [1, 7], [3, 7], [2, 4]],
    [[1, 1], [3, 1], [1, 3], [3, 3], [1, 5], [3, 5], [1, 7], [3, 7], [2, 2], [2, 6]],
    null, null, null, [[2, 4]]
  ];
  // Pips are drawn in a fixed viewBox so they scale with the card and can
  // never spill past the border, whatever the card width.
  function pipArt(r, suit) {
    const P = {
      0: [[30, 28], [30, 66]],
      1: [[30, 24], [30, 46], [30, 68]],
      2: [[18, 28], [42, 28], [18, 66], [42, 66]],
      3: [[18, 24], [42, 24], [30, 46], [18, 68], [42, 68]],
      4: [[18, 24], [42, 24], [18, 46], [42, 46], [18, 68], [42, 68]],
      5: [[18, 24], [42, 24], [18, 46], [42, 46], [18, 68], [42, 68], [30, 35]],
      6: [[18, 24], [42, 24], [18, 46], [42, 46], [18, 68], [42, 68], [30, 35], [30, 57]],
      7: [[18, 24], [42, 24], [18, 42], [42, 42], [18, 60], [42, 60], [18, 78], [42, 78], [30, 51]],
      8: [[18, 24], [42, 24], [18, 42], [42, 42], [18, 60], [42, 60], [18, 78], [42, 78], [30, 33], [30, 69]],
      9: [[18, 22], [42, 22], [18, 36], [42, 36], [18, 50], [42, 50], [18, 64], [42, 64], [18, 78], [42, 78]],
      10: [[18, 20], [42, 20], [18, 33], [42, 33], [18, 46], [42, 46], [18, 59], [42, 59], [18, 72], [42, 72]],
      12: [[30, 46]]
    };
    const pts = P[r] || [];
    if (r === 12) {
      return '<div class="pips"><svg class="pip-art" viewBox="0 0 60 92" aria-hidden="true">' +
        '<text x="30" y="61" text-anchor="middle" font-size="31" fill="currentColor">' + suit + '</text></svg></div>';
    }
    return '<div class="pips"><svg class="pip-art" viewBox="0 0 60 92" aria-hidden="true">' +
      pts.map(([x, y]) => '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="9.4" fill="currentColor">' + suit + '</text>').join('') +
      '</svg></div>';
  }
  function cardHTML(c) {
    const r = c >> 2, suit = C.SUITS[c & 3];
    const idx = '<i class="r">' + C.RANK_CH[r] + '</i><i class="s">' + suit + '</i>';
    if (r >= 9 && r <= 11) return idx + window.Courts.art(r, suit);
    return idx + pipArt(r, suit);
  }
  function makeCardEl(c, cls) {
    const e = document.createElement('div');
    e.className = 'card s' + (c & 3) + (cls ? ' ' + cls : '');
    e.innerHTML = cardHTML(c);
    return e;
  }
  function setCard(el, c, up) {
    if (!el) return;
    const key = c == null ? 'e' : up ? 'u' + c : 'b';
    if (el._k === key) return;
    const prev = el._k; el._k = key;
    el.classList.remove('up', 'back', 'empty', 's0', 's1', 's2', 's3', 'dim', 'hl');
    if (key === 'e') { el.classList.add('empty'); el.innerHTML = ''; return; }
    if (key === 'b') { el.classList.add('back'); el.innerHTML = ''; }
    else { el.classList.add('up', 's' + (c & 3)); el.innerHTML = cardHTML(c); }
    if (prev === undefined || prev === 'e' || key !== 'b') {
      el.classList.remove('deal'); void el.offsetWidth; el.classList.add('deal');
    }
  }

  /* ================= career ================= */
  const MAPS = [
    {
      id: 'hometown', name: 'Hometown Game', room: 'Kentucky \u00B7 Friday night', buyin: 1000, bb: 20,
      seats: 4, target: 2000, skill: 0.05, accent: '#4f9d76', glyph: '\u2663',
      desc: 'A friendly kitchen table. Loose calls, small pots \u2014 learn the ropes without losing your shirt.'
    },
    {
      id: 'riverside', name: 'Riverside Card Room', room: 'Mississippi \u00B7 riverboat', buyin: 2500, bb: 50,
      seats: 5, target: 6000, skill: 0.28, accent: '#5b7fd4', glyph: '\u2666',
      desc: 'Locals who play every night. They will punish a loose call and remember your face.'
    },
    {
      id: 'neon', name: 'Neon Alley', room: 'Macau \u00B7 back room', buyin: 6000, bb: 100,
      seats: 5, target: 15000, skill: 0.48, accent: '#b45ad4', glyph: '\u2665',
      desc: 'Fast, loud and full of bluffers. Big swings, bigger egos, no free cards.'
    },
    {
      id: 'monaco', name: 'Monaco Gold', room: 'Monte Carlo \u00B7 high limit', buyin: 15000, bb: 200,
      seats: 5, target: 40000, skill: 0.68, accent: '#d4a94a', glyph: '\u2660',
      desc: 'Pros in sunglasses. Every bet has a reason behind it \u2014 and a read on you.'
    },
    {
      id: 'vault', name: 'The Vault', room: 'Zurich \u00B7 private club', buyin: 40000, bb: 500,
      seats: 5, target: 110000, skill: 0.84, accent: '#8f9ab0', glyph: '\u2663',
      desc: 'No tourists. No mistakes. The tightest, sharpest game in Europe.'
    },
    {
      id: 'legends', name: 'Legends Room', room: 'Las Vegas \u00B7 invite only', buyin: 100000, bb: 1000,
      seats: 5, target: 300000, skill: 1, accent: '#c8584a', glyph: '\u2665',
      desc: 'The best in the world. Beat this table and the city belongs to you.'
    }
  ];
  const mapUnlocked = (i) => i <= career.cleared || i === 0;

  function levelInfo() {
    let level = 1, need = 320, acc = 0;
    while (career.xp >= acc + need) { acc += need; level++; need = Math.round(need * 1.32); }
    return { level, cur: career.xp - acc, need, pct: clamp((career.xp - acc) / need, 0, 1) };
  }
  function addXp(n) {
    const before = levelInfo().level;
    career.xp += n;
    const after = levelInfo().level;
    career.bestLevel = Math.max(career.bestLevel || 1, after);
    if (after > before) { sfx.level(); toast('Level ' + after + ' \u00B7 new table unlocked?'); }
    saveCareer();
  }

  /* ================= menu ================= */
  function renderMenu() {
    const L = levelInfo();
    $('#bankroll').textContent = fmt(career.bankroll);
    $('#mLevelNum').textContent = 'LVL ' + L.level;
    $('#mLevelFill').style.width = Math.round(L.pct * 100) + '%';
    $('#mLevelXp').textContent = fmt(L.cur) + ' / ' + fmt(L.need) + ' XP';
    const nextIdx = Math.min(MAPS.length - 1, career.cleared);
    const next = MAPS[nextIdx];
    $('#mNextTable').textContent = next.name + ' \u00B7 ' + fmt(next.buyin) + ' buy-in';
    const sess = store.get('session', null);
    $('#mContinue').hidden = !sess;
    if (sess) $('#mContinue').textContent = 'Continue \u00B7 ' + fmt(sess.chips) + ' chips';
    const cleared = career.cleared;
    $('#mProgress').textContent = cleared + ' / ' + MAPS.length + ' tables cleared' +
      (trophyCount() ? ' - ' + trophyCount() + (trophyCount() === 1 ? ' trophy' : ' trophies') : '');
    const statsEl = $('#mStats');
    statsEl.innerHTML = '';
    [[career.hands, 'hands'], [career.won, 'pots won'], [fmtK(career.bestPot), 'best pot']].forEach(([v, k]) => {
      const d = document.createElement('div');
      d.innerHTML = '<b>' + v + '</b><span>' + k + '</span>';
      statsEl.appendChild(d);
    });
    applyTheme();
  }

  $('#mPlay').onclick = () => { audio(); show('maps'); };
  $('#mQuick').onclick = () => { audio(); startQuick(); };
  $('#mContinue').onclick = () => {
    audio();
    const sess = store.get('session', null);
    if (!sess) return;
    store.del('session');
    resumeSession(sess);
  };
  $('#mSettingsTop').onclick = () => { audio(); show('settings'); };
  const modeToggle = $('#modeToggle');
  if (modeToggle) {
    $$('button', modeToggle).forEach((b) => {
      b.onclick = () => { audio(); mapMode = b.dataset.mode || 'career'; renderMaps(); };
    });
  }

  /* ================= map screen ================= */
  function renderMaps() {
    const toggle = $('#modeToggle');
    if (toggle) $$('button', toggle).forEach((b) => b.classList.toggle('on', b.dataset.mode === mapMode));
    if (mapMode === 'tournament') return renderTournamentMaps();
    const list = $('#mapList');
    list.innerHTML = '';
    MAPS.forEach((m, i) => {
      const unlocked = mapUnlocked(i);
      const cleared = i < career.cleared;
      const afford = career.bankroll >= m.buyin;
      const el = document.createElement('button');
      el.className = 'map-card' + (unlocked ? '' : ' locked') + (cleared ? ' cleared' : '');
      el.style.setProperty('--acc', m.accent);
      el.innerHTML =
        '<div class="map-glyph">' + m.glyph + '</div>' +
        '<div class="map-main">' +
        '<div class="map-name">' + m.name + (cleared ? ' <em>\u2713</em>' : '') + '</div>' +
        '<div class="map-room">' + m.room + '</div>' +
        '<div class="map-meta"><span>' + fmt(m.buyin) + ' buy-in</span><span>' + m.seats + ' seats</span>' +
        '<span>goal ' + fmt(m.target) + '</span></div>' +
        '</div>' +
        '<div class="map-go">' + (unlocked ? (afford ? '\u203A' : 'Need ' + fmt(m.buyin - career.bankroll)) : '\uD83D\uDD12') + '</div>';
      el.onclick = () => {
        audio();
        if (!unlocked) { toast('Clear ' + MAPS[i - 1].name + ' to unlock'); return; }
        if (!afford) { toast('You need ' + fmt(m.buyin) + ' chips to buy in'); return; }
        confirmBuyIn(i);
      };
      list.appendChild(el);
    });
  }
  let mapMode = 'career';
  const tournamentPrize = (m) => Math.round((m.buyin * 5.4) / 100) * 100;
  const tournamentStack = (m) => m.bb * 100;
  const trophyCount = () => Object.keys(career.trophies || {}).reduce((n, k) => n + ((career.trophies || {})[k] || 0), 0);

  function renderTournamentMaps() {
    const list = $('#mapList');
    list.innerHTML = '';
    MAPS.forEach((m, i) => {
      const unlocked = mapUnlocked(i);
      const trophy = (career.trophies || {})[m.id] || 0;
      const entry = m.buyin;
      const afford = career.bankroll >= entry;
      const el = document.createElement('button');
      el.className = 'map-card' + (unlocked ? '' : ' locked') + (trophy ? ' cleared' : '');
      el.style.setProperty('--acc', m.accent);
      el.innerHTML =
        '<div class="map-glyph">' + m.glyph + '</div>' +
        '<div class="map-main">' +
        '<div class="map-name">' + m.name + (trophy ? ' <em>' + trophy + 'x</em>' : '') + '</div>' +
        '<div class="map-room">Sit and go - blinds rise every 8 hands</div>' +
        '<div class="map-meta"><span>' + fmt(entry) + ' entry</span><span>6 players</span>' +
        '<span>prize ' + fmt(tournamentPrize(m)) + '</span></div>' +
        '</div>' +
        '<div class="map-go">' + (unlocked ? (afford ? '>' : 'Need ' + fmt(entry - career.bankroll)) : 'Locked') + '</div>';
      el.onclick = () => {
        audio();
        if (!unlocked) { toast('Clear ' + MAPS[i - 1].name + ' to unlock'); return; }
        if (!afford) { toast('You need ' + fmt(entry) + ' chips to enter'); return; }
        confirmTournament(i);
      };
      list.appendChild(el);
    });
  }

  function confirmTournament(i) {
    const m = MAPS[i];
    modal(
      '<div class="sheet-tag" style="--acc:' + m.accent + '">Sit and go</div>' +
      '<h2>' + m.name + '</h2><p>Six players, equal stacks, blinds rise every 8 hands. Win it and take the prize, plus a circuit trophy.</p>' +
      '<div class="kv"><div><span>Entry</span><b>' + fmt(m.buyin) + '</b></div>' +
      '<div><span>Prize</span><b>' + fmt(tournamentPrize(m)) + '</b></div>' +
      '<div><span>Stack</span><b>' + fmt(tournamentStack(m)) + '</b></div>' +
      '<div><span>Blinds</span><b>' + fmt(m.bb / 2) + ' / ' + fmt(m.bb) + '</b></div></div>' +
      '<button class="btn primary" id="go">Take a seat</button>' +
      '<button class="btn ghost-wide" id="no">Not yet</button>',
      (sh) => {
        $('#go', sh).onclick = () => { closeModal(); enterTournament(i); };
        $('#no', sh).onclick = closeModal;
      }
    );
  }

  function enterTournament(i) {
    const m = MAPS[i];
    if (!mapUnlocked(i)) return;
    if (career.bankroll < m.buyin) { toast('Not enough chips to enter'); return; }
    career.bankroll -= m.buyin;
    saveCareer();
    startSession({
      mapIndex: i, mode: 'tournament', buyin: m.buyin, target: 0, skill: m.skill,
      seats: 6, bb: m.bb, chips: tournamentStack(m), hand: 0,
      entry: m.buyin, prize: tournamentPrize(m)
    });
  }

  function confirmBuyIn(i) {
    const m = MAPS[i];
    modal(
      '<div class="sheet-tag" style="--acc:' + m.accent + '">' + m.room + '</div>' +
      '<h2>' + m.name + '</h2><p>' + m.desc + '</p>' +
      '<div class="kv"><div><span>Buy-in</span><b>' + fmt(m.buyin) + '</b></div>' +
      '<div><span>Blinds</span><b>' + fmt(m.bb / 2) + ' / ' + fmt(m.bb) + '</b></div>' +
      '<div><span>Goal</span><b>' + fmt(m.target) + '</b></div>' +
      '<div><span>Opponents</span><b>' + (m.seats - 1) + '</b></div></div>' +
      '<button class="btn primary" id="go">Sit down</button>' +
      '<button class="btn ghost-wide" id="no">Not yet</button>',
      (sh) => {
        $('#go', sh).onclick = () => { closeModal(); buyIn(i); };
        $('#no', sh).onclick = closeModal;
      }
    );
  }
  function buyIn(i) {
    const m = MAPS[i];
    if (!mapUnlocked(i)) return;
    if (career.bankroll < m.buyin) { toast('Not enough chips'); return; }
    career.bankroll -= m.buyin;
    saveCareer();
    startSession({
      mapIndex: i, mode: 'career', buyin: m.buyin, target: m.target, skill: m.skill,
      seats: m.seats, bb: m.bb, chips: m.buyin, hand: 0
    });
  }
  function startQuick() {
    const i = Math.min(career.cleared, MAPS.length - 1);
    const m = MAPS[i];
    startSession({
      mapIndex: i, mode: 'quick', buyin: m.bb * 100, target: m.bb * 200, skill: m.skill,
      seats: m.seats, bb: m.bb, chips: m.bb * 100, hand: 0
    });
  }
  function resumeSession(sess) {
    const m = MAPS[sess.mapIndex] || MAPS[0];
    startSession({
      mapIndex: sess.mapIndex, mode: sess.mode, buyin: sess.buyin, target: sess.target,
      skill: sess.skill || m.skill, seats: sess.seats || m.seats, bb: sess.bb || m.bb,
      chips: sess.chips, hand: sess.hand || 0
    });
  }

  /* ================= stats / settings / how ================= */
  function renderStats() {
    const L = levelInfo();
    const h = career.hands, won = career.won;
    const rows = [
      ['Level', L.level + ' \u00B7 ' + fmt(L.cur) + '/' + fmt(L.need) + ' XP'],
      ['Bankroll', fmt(career.bankroll)],
      ['Tables cleared', career.cleared + ' / ' + MAPS.length],
      ['Tournament wins', career.tournamentWins || 0],
      ['Trophies', trophyCount()],
      ['Hands played', fmt(h)],
      ['Pots won', fmt(won) + (h ? ' (' + Math.round((won / h) * 100) + '%)' : '')],
      ['Biggest pot', fmt(career.bestPot)],
      ['Best hand', career.bestHand || '\u2014']
    ];
    $('#statsBody').innerHTML = '<div class="group stats-group">' + rows.map(([k, v]) =>
      '<div class="stat-row"><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' +
      '<button class="btn ghost-wide danger" id="resetProgress">Reset all progress</button>' +
      '<p class="note">Progress is stored on this device only.</p>';
    $('#resetProgress').onclick = () => {
      if (!confirm('Reset bankroll, level and all table progress?')) return;
      career = Object.assign({}, CAREER0, { trophies: {} });
      saveCareer(); store.del('session'); renderStats(); toast('Progress reset');
    };
  }

  const SPEEDS = [['slow', 'Relaxed'], ['normal', 'Normal'], ['fast', 'Fast']];
  function renderSettings() {
    const body = $('#settingsBody');
    const seg = (key, opts, after) => {
      const wrap = document.createElement('div');
      wrap.className = 'seg';
      opts.forEach(([val, label]) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (S[key] === val) b.className = 'on';
        b.onclick = () => {
          S[key] = val; saveSettings();
          $$('button', wrap).forEach((x) => { x.className = ''; });
          b.className = 'on';
          applyTheme();
          if (after) after(val);
        };
        wrap.appendChild(b);
      });
      return wrap;
    };
    body.innerHTML = '';
    const nameRow = document.createElement('div');
    nameRow.className = 'set';
    nameRow.innerHTML = '<label for="nameIn">Your name</label><div class="desc">Shown on your seat at the table.</div>';
    const inp = document.createElement('input');
    inp.id = 'nameIn'; inp.className = 'txt'; inp.maxLength = 12; inp.autocomplete = 'off';
    inp.spellcheck = false; inp.value = S.name === 'You' ? '' : S.name; inp.placeholder = 'You';
    inp.oninput = () => { S.name = inp.value.trim() || 'You'; saveSettings(); };
    nameRow.appendChild(inp);
    const g1 = document.createElement('div'); g1.className = 'group'; g1.appendChild(nameRow);

    const mk = (label, desc, control) => {
      const row = document.createElement('div');
      row.className = 'set';
      const t = document.createElement('span'); t.className = 'lab'; t.textContent = label;
      row.appendChild(t);
      if (desc) { const d = document.createElement('div'); d.className = 'desc'; d.textContent = desc; row.appendChild(d); }
      row.appendChild(control);
      return row;
    };
    const speed = mk('Game speed', 'How long the bots take to act.', seg('speed', SPEEDS));
    const hints = mk('Hand hints', 'Shows your hand and rough win chance on your turn.', seg('hints', [[true, 'On'], [false, 'Off']]));
    const four = mk('Four-colour deck', 'Each suit gets its own colour.', seg('fourColor', [[false, 'Off'], [true, 'On']]));
    const sound = mk('Sound', 'Chips, cards and showdown stings.', seg('sound', [[true, 'On'], [false, 'Off']], (v) => { if (v) sfx.chip(); }));
    const vibe = mk('Haptics', 'A short buzz when it is your turn.', seg('vibe', [[true, 'On'], [false, 'Off']], (v) => { if (v) buzz(30); }));
    const g2 = document.createElement('div'); g2.className = 'group';
    [speed, hints, four, sound, vibe].forEach((r) => g2.appendChild(r));

    body.appendChild(g1);
    const t1 = document.createElement('div'); t1.className = 'group-t'; t1.textContent = 'Table'; body.appendChild(t1);
    body.appendChild(g2);
    body.innerHTML += '<p class="note">Bot skill comes from the table you choose \u2014 the deeper the map, the sharper the players.</p>';
  }

  const RANKS = [
    ['Royal flush', 'A, K, Q, J, 10 of the same suit.', 'As Ks Qs Js Ts'],
    ['Straight flush', 'Five in a row, all the same suit.', '9h 8h 7h 6h 5h'],
    ['Four of a kind', 'Four cards of the same rank.', '8s 8h 8d 8c Kd'],
    ['Full house', 'Three of one rank and two of another.', 'Qs Qh Qd 4c 4s'],
    ['Flush', 'Any five cards of the same suit.', 'Ad Jd 8d 5d 3d'],
    ['Straight', 'Five in a row, any suits.', '9s 8h 7d 6c 5h'],
    ['Three of a kind', 'Three cards of the same rank.', '7s 7h 7d Kc 2h'],
    ['Two pair', 'Two different pairs.', 'Js Jh 4d 4c Ah'],
    ['Pair', 'Two cards of the same rank.', 'Ts Th Ad 6c 3h'],
    ['High card', 'None of the above. Your highest card plays.', 'As Jh 8d 5c 3h']
  ];
  const H = (s) => s.split(' ').map((x) => '23456789TJQKA'.indexOf(x[0]) * 4 + 'shdc'.indexOf(x[1]));
  function renderHow() {
    const b = $('#howBody');
    if (b._done) return;
    b._done = true;
    b.innerHTML =
      '<h3>The goal</h3><p>Win chips by making the best five-card hand \u2014 or by making everyone else fold.</p>' +
      '<h3>A hand, step by step</h3><ol class="steps">' +
      '<li><span><b>Blinds.</b> Two players post forced bets so there is always something to win.</span></li>' +
      '<li><span><b>Hole cards.</b> You get two private cards. Nobody sees them.</span></li>' +
      '<li><span><b>Pre-flop.</b> Betting starts left of the big blind.</span></li>' +
      '<li><span><b>Flop.</b> Three shared cards, then another betting round.</span></li>' +
      '<li><span><b>Turn and river.</b> One more shared card each, betting after both.</span></li>' +
      '<li><span><b>Showdown.</b> Best five cards from your two plus the five on the table takes the pot.</span></li></ol>' +
      '<h3>Your choices</h3><ol class="steps">' +
      '<li><span><b>Fold.</b> Give up the hand and anything you already put in.</span></li>' +
      '<li><span><b>Check.</b> Pass when nobody has bet.</span></li>' +
      '<li><span><b>Call.</b> Match the current bet.</span></li>' +
      '<li><span><b>Raise.</b> Increase the bet. Everyone must match it or fold.</span></li>' +
      '<li><span><b>All-in.</b> Push every chip in front of you.</span></li></ol>' +
      '<h3>Reading the table</h3><p>Each opponent has a personality. After a few hands their seat shows a read \u2014 tight or loose, passive or aggressive. Use it. They are reading you too. Watch their hands: a regular who counts his stack or stares you down usually has it, while fidgeting and fast shrugs often mean a bluff.</p>' +
      '<h3>Hand rankings</h3><p>Best at the top.</p><div class="group" id="rankList"></div>';
    const list = $('#rankList');
    RANKS.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'rank';
      row.innerHTML = '<span class="n">' + (i + 1) + '</span><div class="t"><b></b><span></span></div><div class="mini"></div>';
      $('b', row).textContent = r[0];
      $('.t span', row).textContent = r[1];
      const mini = $('.mini', row);
      H(r[2]).forEach((c) => mini.appendChild(makeCardEl(c)));
      list.appendChild(row);
    });
  }
  function showRanks() {
    modal('<h2>Hand rankings</h2><p>Best at the top.</p><div class="group" id="rl"></div><button class="btn ghost-wide" id="rc">Close</button>', (sh) => {
      const list = $('#rl', sh);
      RANKS.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'rank';
        row.innerHTML = '<span class="n">' + (i + 1) + '</span><div class="t"><b></b></div><div class="mini"></div>';
        $('b', row).textContent = r[0];
        const mini = $('.mini', row);
        H(r[2]).forEach((c) => mini.appendChild(makeCardEl(c)));
        list.appendChild(row);
      });
      $('#rc', sh).onclick = closeModal;
    });
  }

  /* ================= table state ================= */
  const G = {
    running: false, sid: 0, players: [], hero: null, dealer: -1, hand: 0, bb: 20, sb: 10,
    board: [], deck: [], turn: -1, pending: null, hl: null, cur: 0, minRaise: 20,
    over: false, mode: 'career', mapIndex: 0, map: MAPS[0], buyin: 1000, target: 2000,
    skill: 0.3, seats: 4, acting: -1, hp: null,
    tournament: false, entry: 0, prize: 0, tLevel: 1, riseEvery: 8,
    finish: 0, finalShown: false, lastRaiser: null,
    engine: null, seed: 0, showPot: 0, replay: null
  };
  const LAYOUT_WIDE = {
    2: [[50, 82], [50, 17]],
    3: [[50, 82], [17, 23], [83, 23]],
    4: [[50, 82], [16, 59], [50, 15], [84, 59]],
    5: [[50, 82], [14, 63], [20, 22], [80, 22], [86, 63]],
    6: [[50, 82], [13, 67], [15, 30], [50, 14], [85, 30], [87, 67]]
  };
  // Phones need the seats pulled in so plates never run off the screen edge.
  const LAYOUT_NARROW = {
    2: [[50, 82], [50, 18]],
    3: [[50, 82], [25, 25], [75, 25]],
    4: [[50, 82], [25, 58], [50, 16], [75, 58]],
    5: [[50, 82], [23, 62], [27, 24], [73, 24], [77, 62]],
    6: [[50, 82], [23, 66], [24, 31], [50, 15], [76, 31], [77, 66]]
  };
  const layoutFor = (n) => {
    const set = (window.innerWidth < 560 ? LAYOUT_NARROW : LAYOUT_WIDE)[n] || LAYOUT_WIDE[4];
    return set;
  };
  let seatEls = [], holeEls = [], boardEls = [], betsEls = [], seatXY = [];
  let bannerT = 0, lastPot = 0;

  const delay = () => ({ slow: 1400, normal: 780, fast: 260 }[S.speed] || 780);
  const sleep = (ms) => new Promise((res, rej) => {
    const sid = G.sid;
    setTimeout(() => (G.sid === sid ? res() : rej(ABORT)), ms);
  });
  const alive = (p) => !p.out && !p.folded;
  const canAct = (p) => alive(p) && !p.allin && p.chips > 0;
  const potTotal = () => G.players.reduce((s, p) => s + p.total, 0);
  const botCount = () => G.players.filter((p) => !p.human).length;

  function applyTheme() { document.body.classList.toggle('four', !!S.fourColor); }

  function makePlayerFromBot(bot, i, chips) {
    return {
      i, id: bot.id, bot, human: false, name: bot.name, hue: bot.hue, chips,
      hole: [], bet: 0, total: 0, folded: false, allin: false, out: false,
      tag: '', role: '', reveal: false, win: false, said: '', score: 0
    };
  }
  const freshStack = () => {
    const unit = Math.max(1, G.bb / 2);
    const base = G.buyin * (0.72 + Math.random() * 0.85);
    return Math.max(G.bb * 18, Math.round(base / unit) * unit);
  };

  function startSession(o) {
    abortGame();
    G.sid++;
    G.mode = o.mode || 'career';
    G.mapIndex = o.mapIndex || 0;
    G.map = MAPS[G.mapIndex] || MAPS[0];
    G.buyin = o.buyin || 1000;
    G.target = o.target || G.buyin * 2;
    G.skill = o.skill; G.seats = o.seats;
    G.bb = o.bb || 20; G.sb = Math.floor(G.bb / 2);
    G.engine = null;
    G.showPot = 0;
    G.replay = null;
    G.seed = o.seed != null ? (o.seed >>> 0) : ((Date.now() ^ (G.sid * 2654435761)) >>> 0);
    G.hand = o.hand || 0;
    G.tournament = o.mode === 'tournament';
    G.entry = o.entry || 0; G.prize = o.prize || 0;
    G.tLevel = o.level || 1; G.riseEvery = 8; G.finish = 0; G.finalShown = false;
    G.dealer = -1; G.lastRaiser = null;
    G.board = []; G.hl = null; G.turn = -1; G.over = false; G.acting = -1;
    G.hp = { hands: 0, shoves: 0, raises: 0, calls: 0, folds: 0, faced: 0, foldFaced: 0, overbets: 0, bigBets: 0 };

    G.hero = {
      i: 0, id: 'hero', human: true, name: S.name || 'You', hue: 42,
      chips: o.chips != null ? o.chips : G.buyin,
      hole: [], bet: 0, total: 0, folded: false, allin: false, out: false,
      tag: '', role: '', reveal: false, win: false, said: '', score: 0
    };
    G.players = [G.hero];
    const roster = B.makeRoster(G.seats - 1, G.skill);
    roster.forEach((bot, k) => G.players.push(makePlayerFromBot(bot, k + 1,
      G.tournament ? o.chips : freshStack())));

    buildTable();
    applyTheme();
    show('table');
    G.running = true;
    setMode('wait');
    $('#status').textContent = '';
    updateGoal();
    render();
    saveSession();
    runSession();
  }

  function saveReplay(rec) {
    try {
      const list = store.get('replays', []);
      list.unshift(rec);
      store.set('replays', list.slice(0, 12));
    } catch (e) {}
  }

  function saveSession() {
    if (!G.running || G.mode === 'quick' || G.tournament) return;
    store.set('session', {
      mapIndex: G.mapIndex, mode: G.mode, buyin: G.buyin, target: G.target,
      skill: G.skill, seats: G.seats, bb: G.bb, chips: Math.max(0, G.hero.chips), hand: G.hand
    });
  }

  /* ================= table DOM ================= */
  function buildTable() {
    const seats = $('#seats'), board = $('#board');
    seats.innerHTML = ''; board.innerHTML = '';
    seatEls = []; holeEls = []; boardEls = [];
    const pos = layoutFor(G.players.length);
    seatXY = pos;
    const betsWrap = $('#bets');
    betsWrap.innerHTML = '';
    betsEls = G.players.map(() => {
      const d = document.createElement('div');
      d.className = 'bet';
      betsWrap.appendChild(d);
      return d;
    });
    G.players.forEach((p, i) => {
      const [x, y] = pos[i];
      const el = document.createElement('div');
      el.className = 'seat' + (p.human ? ' hero' : '');
      el.style.left = x + '%'; el.style.top = y + '%';
      el.innerHTML =
        '<div class="say"></div>' +
        '<div class="hole"><div class="card empty"></div><div class="card empty"></div></div>' +
        '<div class="plate">' +
        '<div class="avatar"><span></span></div>' +
        '<div class="who"><div class="nm"></div><div class="ch"></div></div>' +
        '<div class="dealer" hidden>D</div>' +
        '</div>' +
        '<div class="read"></div><div class="tag"></div>';
      seats.appendChild(el);
      seatEls.push(el);
      holeEls.push([$('.hole .card:nth-child(1)', el), $('.hole .card:nth-child(2)', el)]);
      if (p.human) {
        $('.avatar span', el).textContent = (p.name || 'Y').trim().charAt(0).toUpperCase();
        el.style.setProperty('--hue', '42');
      }
    });
    for (let k = 0; k < 5; k++) {
      const c = document.createElement('div');
      c.className = 'card empty';
      board.appendChild(c);
      boardEls.push(c);
    }
    applyTheme();
  }

  function seatBotInfo(el, p) {
    if (!p.bot) return;
    const av = $('.avatar', el);
    if (!av.dataset.portrait) {
      let h = 0;
      for (let k = 0; k < p.name.length; k++) h = (h * 31 + p.name.charCodeAt(k)) % 997;
      const n = 1 + (h % 6);
      av.dataset.portrait = 'art/portrait-' + n + '.svg';
      av.innerHTML = '<img alt="" src="' + av.dataset.portrait + '">';
    }
    $('.nm', el).textContent = p.name;
    $('.read', el).textContent = p.bot ? B.readLive(p.bot) : '';
  }

  function render() {
    if (!seatEls.length) return;
    G.players.forEach((p, i) => {
      const el = seatEls[i];
      if (!el) return;
      if (!p.human) seatBotInfo(el, p);
      if (p.human) {
        $('.nm', el).textContent = p.name;
        $('.ch', el).textContent = p.out ? 'Out' : p.allin ? 'ALL-IN' : fmt(p.chips);
      } else {
        $('.ch', el).textContent = p.out ? 'Out' : p.allin ? 'ALL-IN' : fmt(p.chips);
      }
      el.classList.toggle('fold', p.folded && !p.out);
      el.classList.toggle('out', p.out);
      el.classList.toggle('turn', G.turn === i);
      el.classList.toggle('win', !!p.win);
      el.classList.toggle('acting', G.acting === i);
      $('.dealer', el).hidden = G.dealer !== i || p.out;
      $('.tag', el).textContent = p.tag || '';
      el.classList.toggle('tell-strong', p.saidKind === 'tell' && p.tellKind === 'strong');
      el.classList.toggle('tell-weak', p.saidKind === 'tell' && p.tellKind === 'weak');
      el.classList.toggle('tell-bluff', p.saidKind === 'tell' && p.tellKind === 'bluff');
      const say = $('.say', el);
      say.textContent = p.said || '';
      say.classList.toggle('on', !!p.said);
      say.classList.toggle('tell', p.saidKind === 'tell');
      for (let k = 0; k < 2; k++) {
        const ce = holeEls[i][k];
        const up = p.human || p.reveal;
        setCard(ce, p.hole[k], up);
        const showHl = G.hl && p.hole[k] != null && (p.win || p.reveal) && G.hl.has(p.hole[k]) && up;
        ce.classList.toggle('hl', !!showHl);
      }
    });
    for (let k = 0; k < 5; k++) {
      const ce = boardEls[k];
      setCard(ce, G.board[k], true);
      const has = G.board[k] != null;
      ce.classList.toggle('dim', !!(G.hl && has && !G.hl.has(G.board[k])));
      ce.classList.toggle('hl', !!(G.hl && has && G.hl.has(G.board[k])));
    }
    const pot = G.showPot != null ? G.showPot : potTotal();
    const potEl = $('#pot');
    potEl.innerHTML = pot ? chipStackHTML(pot) + '<span>POT</span><b>' + fmt(pot) + '</b>' : '';
    if (pot > lastPot) {
      potEl.classList.remove('bump');
      void potEl.offsetWidth;
      potEl.classList.add('bump');
    }
    lastPot = pot;
    renderBets();
    updateGoal();
  }

  // Chips sit on the felt in front of each player, sliding in as they bet.
  function renderBets() {
    const wrap = $('#bets');
    if (!wrap) return;
    if (betsEls.length !== G.players.length) {
      wrap.innerHTML = '';
      betsEls = G.players.map(() => {
        const d = document.createElement('div');
        d.className = 'bet';
        wrap.appendChild(d);
        return d;
      });
    }
    G.players.forEach((p, i) => {
      const el = betsEls[i];
      if (!el) return;
      const xy = seatXY[i] || [50, 50];
      const bx = xy[0] + (50 - xy[0]) * 0.3;
      const by = xy[1] + (44 - xy[1]) * 0.34;
      el.style.left = bx.toFixed(2) + '%';
      el.style.top = by.toFixed(2) + '%';
      const show = p.bet > 0 && !p.out && !G.over;
      el.classList.toggle('on', show);
      el.classList.toggle('allin', !!p.allin);
      if (show) el.innerHTML = chipStackHTML(p.bet) + '<b>' + fmt(p.bet) + '</b>';
    });
  }

  // Chips you can see: a stack leaves the seat and lands in the pot.
  function chipStackHTML(amt) {
    let v = Math.max(1, Math.round(amt));
    const units = [[1000, 'c1k'], [500, 'c500'], [100, 'c100'], [25, 'c25'], [5, 'c5'], [1, 'c1']];
    const out = [];
    for (let k = 0; k < units.length && out.length < 4; k++) {
      if (v >= units[k][0]) { out.push(units[k][1]); v -= units[k][0]; }
    }
    if (!out.length) out.push('c1');
    return '<span class="cstack">' + out.map((c, i) =>
      '<i class="chipdisc ' + c + '" style="--i:' + i + '"></i>').join('') + '</span>';
  }
  function chipFlight(p, amt) {
    const seat = seatEls[p.i], pot = $('#pot');
    if (!seat || !pot || !amt) return;
    const a = seat.getBoundingClientRect(), b = pot.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'chipfly';
    el.innerHTML = chipStackHTML(amt);
    const x0 = a.left + a.width / 2, y0 = a.top + a.height * 0.34;
    el.style.left = x0 + 'px';
    el.style.top = y0 + 'px';
    document.body.appendChild(el);
    const dx = b.left + b.width / 2 - x0, dy = b.top + b.height / 2 - y0;
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 },
      { transform: 'translate(calc(-50% + ' + dx * 0.5 + 'px), calc(-50% + ' + (dy * 0.5 - 26) + 'px)) scale(1.1)', opacity: 1, offset: 0.55 },
      { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.75)', opacity: 0 }
    ], { duration: 500, easing: 'cubic-bezier(.3,.8,.35,1)' });
    anim.onfinish = () => el.remove();
  }

  function updateGoal() {
    if (!G.hero) return;
    if (G.tournament) {
      const aliveNow = G.players.filter((p) => p.chips > 0).length;
      $('#goalTxt').textContent = 'LVL ' + G.tLevel + ' - ' + aliveNow + ' left - ' +
        fmt(G.sb) + '/' + fmt(G.bb);
      $('#goalFill').style.width = Math.round(((G.seats - aliveNow) / Math.max(1, G.seats - 1)) * 100) + '%';
      $('#tName').textContent = G.map.name + ' - ' + fmt(G.prize) + ' prize';
      return;
    }
    const chips = Math.max(0, G.hero.chips);
    $('#goalTxt').textContent = fmt(chips) + ' / ' + fmt(G.target);
    $('#goalFill').style.width = Math.min(100, (chips / G.target) * 100) + '%';
    $('#tName').textContent = G.map.name;
  }

  function status(msg, big) {
    const s = $('#status');
    s.textContent = msg || '';
    s.classList.toggle('big', !!big);
  }
  function banner(title, sub, kind) {
    const b = $('#banner');
    b.className = 'banner ' + (kind || '');
    $('b', b).textContent = title;
    $('span', b).textContent = sub || '';
    void b.offsetWidth;
    b.classList.add('on');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => b.classList.remove('on'), 2000);
  }
  function botSay(p, kind) {
    if (!p.bot) return;
    if (Math.random() > (p.bot.talk || 0.35)) return;
    p.said = B.chatFor(p.bot, kind, Math.random);
    p.saidKind = 'chat';
    setTimeout(() => { p.said = ''; p.saidKind = ''; render(); }, 2200);
    render();
  }
  // RDR2-style tell: a short physical habit shown before the action lands.
  function botTell(p, a) {
    if (!p.bot || !p.bot.tell) return;
    p.said = p.bot.tell;
    p.saidKind = 'tell';
    p.tellKind = B.tellState ? B.tellState(p.bot, a) : '';
    p.bot.tell = '';
    setTimeout(() => {
      if (p.saidKind === 'tell') { p.said = ''; p.saidKind = ''; p.tellKind = ''; render(); }
    }, 2600);
    render();
  }

  /* ================= action bar ================= */
  function setMode(m) {
    $('#btns').hidden = m === 'raise' || m === 'next';
    $('#raisePanel').hidden = m !== 'raise';
    $('#nextBtn').hidden = m !== 'next';
    const turn = m === 'turn';
    ['#aFold', '#aCall', '#aRaise'].forEach((s) => { $(s).disabled = !turn; });
    $('#actions').classList.toggle('your-turn', turn);
  }

  function handInfo(p) {
    const cards = p.hole.concat(G.board);
    if (!p.hole.length) return { name: '', eq: 0 };
    if (G.board.length >= 3) return { name: C.handName(C.evaluate(cards)), eq: 0 };
    return { name: C.preflopName(p.hole), eq: 0 };
  }

  let hintToken = 0;
  function updateHint() {
    const h = $('#hint'), p = G.hero;
    if (!p) return;
    if (!S.hints) { h.innerHTML = ''; return; }
    if (!p.hole.length || p.out || p.folded) {
      h.innerHTML = p.folded && !p.out ? '<span class="muted">You folded this hand</span>' : '';
      return;
    }
    const info = handInfo(p);
    const opp = G.players.filter((q) => q !== p && alive(q)).length;
    const toCall = Math.max(0, G.cur - p.bet);
    const odds = toCall > 0 ? Math.round((toCall / (potTotal() + toCall)) * 100) : 0;
    const oddsTxt = toCall > 0 ? ' \u00B7 need ' + odds + '%' : '';
    h.innerHTML = '<b>' + info.name + '</b>' + oddsTxt;
    if (opp > 0 && !G.over) {
      const token = ++hintToken;
      const eq = C.equity(p.hole, G.board, opp, 220);
      setTimeout(() => {
        if (token !== hintToken) return;
        const pct = Math.round(eq * 100);
        h.innerHTML = '<b>' + info.name + '</b><span class="eq"><i style="width:' + pct + '%"></i></span>' +
          '<span class="muted">' + pct + '% to win' + oddsTxt + '</span>';
      }, 20);
    }
  }

  function askHuman(p) {
    return new Promise((resolve) => {
      const toCall = Math.min(G.cur - p.bet, p.chips);
      const maxTo = p.chips + p.bet;
      const minTo = Math.min(maxTo, G.cur + G.minRaise);
      const canRaise = maxTo > G.cur;
      const callBtn = $('#aCall'), raiseBtn = $('#aRaise');
      callBtn.innerHTML = toCall === 0 ? 'Check'
        : toCall >= p.chips ? 'All-in ' + fmt(p.chips) : 'Call ' + fmt(toCall);
      raiseBtn.textContent = G.cur <= 0 ? 'Bet' : 'Raise';
      raiseBtn.style.display = canRaise ? '' : 'none';
      G.pending = { resolve };
      const done = (a) => { G.pending = null; setMode('wait'); resolve(a); };
      $('#aFold').onclick = () => { sfx.fold(); done({ type: 'fold' }); };
      callBtn.onclick = () => done({ type: 'call' });
      raiseBtn.onclick = () => openRaise(p, minTo, maxTo, done);
      setMode('turn');
      updateHint();
      sfx.turn(); buzz(25);
      status('');
    });
  }

  function openRaise(p, minTo, maxTo, done) {
    const sl = $('#rSlider');
    let v = minTo;
    const word = G.cur <= 0 ? 'Bet' : 'Raise to';
    sl.min = minTo; sl.max = maxTo; sl.step = 1;
    $('#rLabel').textContent = word;
    const upd = () => {
      v = clamp(Math.round(v), minTo, maxTo);
      sl.value = v;
      $('#rAmt').textContent = fmt(v);
      $('#rConfirm').textContent = v >= maxTo ? 'All-in ' + fmt(v) : word + ' ' + fmt(v);
    };
    const pot = potTotal(), toCall = G.cur - p.bet;
    const sized = (f) => G.cur + f * (pot + toCall);
    const rnd = (x) => Math.round(x / G.sb) * G.sb;
    const q = $('#rQuick'); q.innerHTML = '';
    [['Min', minTo], ['\u00BD pot', rnd(sized(0.5))], ['Pot', rnd(sized(1))], ['All-in', maxTo]].forEach(([label, val]) => {
      const b = document.createElement('button');
      b.className = 'q'; b.textContent = label;
      b.onclick = () => { v = val; upd(); sfx.chip(); };
      q.appendChild(b);
    });
    sl.oninput = () => { v = +sl.value; upd(); };
    $('#rMinus').onclick = () => { v -= G.bb; upd(); };
    $('#rPlus').onclick = () => { v += G.bb; upd(); };
    $('#rCancel').onclick = () => { setMode('turn'); updateHint(); };
    $('#rConfirm').onclick = () => {
      if (v >= maxTo) sfx.allin();
      done({ type: 'raise', to: v });
    };
    upd();
    setMode('raise');
  }

  /* ================= hand flow ================= */
  const next = (i, pred) => {
    const n = G.players.length;
    for (let k = 1; k <= n; k++) {
      const j = (i + k) % n;
      if (pred(G.players[j])) return j;
    }
    return i;
  };
  const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st'
    : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

  /* ================= engine-backed hand flow ================= */
  // The UI never decides what is legal. Human buttons and bot choices both
  // come from Engine.Table.legalActions(), and Table.act() throws on anything
  // else. Stacks, side pots and odd chips are settled by the tested engine.
  function syncEngine(T, boardLimit) {
    G.players.forEach((p, i) => {
      const ep = T.players[i];
      if (!ep) return;
      p.chips = ep.stack;
      p.bet = ep.bet;
      p.total = ep.total;
      p.hole = ep.hole.slice();
      p.folded = ep.folded;
      p.allin = ep.allin;
      if (ep.stack > 0) p.out = false;
    });
    G.board = T.board.slice(0, boardLimit == null ? T.board.length : boardLimit);
    G.cur = T.currentBet;
    G.minRaise = T.minRaise;
    G.dealer = T.button;
    G.turn = T.acting;
    G.acting = T.acting;
    G.over = !!T.result;
  }

  function ensureEngine() {
    const P = G.players;
    if (!window.Engine) throw new Error('Rules engine failed to load');
    if (!G.engine) {
      G.engine = new Engine.Table({
        sb: G.sb, bb: G.bb, button: 0, seed: G.seed,
        players: P.map((p) => ({ id: p.id, name: p.name, stack: Math.max(0, p.chips) }))
      });
    } else {
      const T = G.engine;
      T.sb = G.sb; T.bb = G.bb;
      T.players.forEach((ep, i) => {
        const p = P[i];
        if (!p) return;
        ep.id = p.id; ep.name = p.name;
        ep.stack = Math.max(0, p.chips);
      });
    }
    const T = G.engine;
    // New faces (or a rebuy seat) change the table total; adopt it before the
    // deal so the engine's conservation check compares like with like.
    T.totalChips = T.chipTotal();
    return T;
  }

  // Bots think in a richer world than the legal-action object, so every bot
  // choice is filtered through the engine's offer before it is submitted.
  function legalize(a, legal) {
    if (!a || !a.type) a = { type: legal.check ? 'check' : 'call' };
    if (a.type === 'raise' || a.type === 'bet') {
      if (!legal.raise) return { type: legal.check ? 'check' : 'call' };
      let to = Math.round(Number(a.to));
      if (!isFinite(to)) to = legal.raise.min;
      to = clamp(to, legal.raise.min, legal.raise.max);
      return { type: 'raise', to };
    }
    if (a.type === 'fold') return { type: 'fold' };
    return { type: legal.check ? 'check' : 'call' };
  }

  function askHuman(p, legal) {
    return new Promise((resolve) => {
      const callBtn = $('#aCall'), raiseBtn = $('#aRaise');
      const toCall = legal.callAmount;
      callBtn.innerHTML = legal.check ? 'Check'
        : toCall >= p.chips ? 'All-in ' + fmt(toCall) : 'Call ' + fmt(toCall);
      raiseBtn.textContent = G.cur <= 0 ? 'Bet' : 'Raise';
      raiseBtn.style.display = legal.raise ? '' : 'none';
      G.pending = { resolve };
      const done = (a) => { G.pending = null; setMode('wait'); resolve(a); };
      $('#aFold').onclick = () => { sfx.fold(); done({ type: 'fold' }); };
      callBtn.onclick = () => done({ type: legal.check ? 'check' : 'call' });
      raiseBtn.onclick = () => openRaise(p, legal, done);
      setMode('turn');
      updateHint();
      sfx.turn(); buzz(25);
      status('');
    });
  }

  function openRaise(p, legal, done) {
    const minTo = legal.raise.min, maxTo = legal.raise.max;
    const sl = $('#rSlider');
    let v = minTo;
    const word = G.cur <= 0 ? 'Bet' : 'Raise to';
    sl.min = minTo; sl.max = maxTo; sl.step = 1;
    $('#rLabel').textContent = word;
    const upd = () => {
      v = clamp(Math.round(v), minTo, maxTo);
      sl.value = v;
      $('#rAmt').textContent = fmt(v);
      $('#rConfirm').textContent = v >= maxTo ? 'All-in ' + fmt(v) : word + ' ' + fmt(v);
    };
    const base = G.cur, pot = legal.pot, toCall = legal.toCall;
    const sized = (f) => base + f * (pot + toCall);
    const rnd = (x) => clamp(Math.round(x / G.sb) * G.sb, minTo, maxTo);
    const q = $('#rQuick'); q.innerHTML = '';
    [['Min', minTo], ['\u00BD pot', rnd(sized(0.5))], ['Pot', rnd(sized(1))], ['All-in', maxTo]]
      .forEach(([label, val]) => {
        const b = document.createElement('button');
        b.className = 'q'; b.textContent = label;
        b.onclick = () => { v = val; upd(); sfx.chip(); };
        q.appendChild(b);
      });
    sl.oninput = () => { v = +sl.value; upd(); };
    $('#rMinus').onclick = () => { v -= G.bb; upd(); };
    $('#rPlus').onclick = () => { v += G.bb; upd(); };
    $('#rCancel').onclick = () => { setMode('turn'); updateHint(); };
    $('#rConfirm').onclick = () => {
      if (v >= maxTo) sfx.allin();
      done({ type: 'raise', to: v });
    };
    upd();
    setMode('raise');
  }

  // Bots watch every action and keep their own book on each opponent.
  function observeAction(p, a, faced, pre) {
    const info = { pre: !!pre, type: a.type, faced: !!faced };
    G.players.forEach((q) => {
      if (!q.human && q !== p && q.bot) B.noteAction(q.bot, p.id, info);
    });
    if (a.type === 'raise' || a.type === 'bet') G.lastRaiser = p;
  }
  function noteShowdowns() {
    G.players.forEach((p) => {
      if (!alive(p) || p.score == null) return;
      const cat = C.category(p.score);
      G.players.forEach((q) => {
        if (!q.human && q !== p && q.bot) B.noteShowdown(q.bot, p.id, cat);
      });
    });
  }

  function heroProfile() {
    const h = G.hp || { hands: 0, shoves: 0, raises: 0, calls: 0, folds: 0, faced: 0, foldFaced: 0 };
    const hands = Math.max(1, h.hands);
    return {
      maniac: clamp((h.shoves / hands - 0.1) * 2.4, 0, 1),
      foldsALot: h.faced >= 3 ? h.foldFaced / h.faced : 0.3,
      callHappy: h.faced >= 3 ? h.calls / Math.max(1, h.calls + h.folds) : 0.5,
      overbets: clamp((h.overbets || 0) / 3, 0, 1)
    };
  }

  function botDecide(p, legal) {
    const P = G.players;
    const others = P.filter((q) => q !== p && alive(q)).length;
    const street = G.board.length === 0 ? 0 : G.board.length === 3 ? 1 : G.board.length === 4 ? 2 : 3;
    const n = P.length;
    const rel = ((p.i - G.dealer) % n + n) % n;
    const ctx = {
      hole: p.hole, board: G.board, pot: legal.pot, toCall: legal.toCall,
      cur: G.cur, minRaise: G.minRaise, myBet: p.bet, myChips: p.chips,
      nOpp: Math.max(1, others), bb: G.bb, sb: G.sb, street,
      late: rel >= n - 3, nPlayers: n, heroProfile: heroProfile(), rng: Math.random,
      legal,
      reads: B.readsFor(p.bot, P.filter((q) => q !== p && alive(q)).map((q) => q.id),
        G.lastRaiser && G.lastRaiser !== p ? G.lastRaiser.id : null)
    };
    return B.decide(p.bot, ctx);
  }

  function recordHuman(p, a, legal, beforeCur) {
    if (!p.human) return;
    if (a.type === 'fold') { G.hp.folds++; return; }
    if (a.type === 'call' || a.type === 'check') { G.hp.calls++; return; }
    if (a.type === 'raise') {
      const allin = a.to >= legal.maxRaiseTo;
      if (allin) G.hp.shoves++; else G.hp.raises++;
      if (a.to - beforeCur > legal.pot * 0.8) G.hp.overbets++; else G.hp.bigBets++;
    }
  }

  async function playHand() {
    const P = G.players;
    churnLineup();
    P.forEach((p) => {
      p.out = p.chips <= 0;
      p.hole = []; p.bet = 0; p.total = 0; p.folded = p.out; p.allin = false;
      p.tag = ''; p.role = ''; p.reveal = false; p.win = false; p.said = ''; p.score = 0;
      p.tellKind = ''; p.saidKind = '';
      if (p.bot) { p.bot.mood = null; p.bot.plan = null; }
    });
    G.hand++;
    if (G.tournament) {
      const lvl = 1 + Math.floor(Math.max(0, G.hand - 1) / G.riseEvery);
      if (lvl > G.tLevel) {
        G.tLevel = lvl;
        G.bb = Math.max(G.bb + 1, Math.round((G.bb * 1.5) / 10) * 10);
        G.sb = Math.floor(G.bb / 2);
        toast('Level ' + G.tLevel + ' - blinds ' + fmt(G.sb) + ' / ' + fmt(G.bb));
        sfx.blind();
      }
      const aliveNow = P.filter((p) => p.chips > 0).length;
      if (!G.finalShown && aliveNow <= 3) {
        G.finalShown = true;
        banner('Final table', aliveNow + ' players left', 'win');
      }
    }
    G.over = false; G.board = []; G.hl = null; G.showPot = null;
    G.minRaise = G.bb; G.cur = 0; G.acting = -1; G.turn = -1; G.pending = null;
    G.lastRaiser = null;
    const potEl = $('#pot');
    if (potEl) potEl.classList.remove('collect', 'bump');
    lastPot = 0;

    const T = ensureEngine();
    const prePlayers = T.players.map((p) => ({ id: p.id, name: p.name, stack: p.stack }));
    const start = T.startHand();
    if (start && start.over) { G.over = true; render(); return; }
    G.replay = {
      hand: G.hand, handSeed: T.handSeed, sb: G.sb, bb: G.bb, button: T.button,
      players: prePlayers, actions: [], mode: G.mode, map: G.map.name, when: Date.now()
    };
    syncEngine(T);
    G.hp.hands++;
    P.forEach((p, i) => {
      p.role = i === T.sbSeat ? 'SB' : i === T.bbSeat ? 'BB' : '';
    });
    setMode('wait'); status('Dealing\u2026'); render();
    await sleep(240);

    // Deal one card at a time, left of the button, even if a blind is all-in.
    const holes = T.players.map((ep) => ep.hole.slice());
    P.forEach((p) => { p.hole = []; });
    render();
    let firstSeat = T.nextInHand(T.button);
    for (let round = 0; round < 2; round++) {
      let s = firstSeat;
      for (let k = 0; k < T.players.filter((p) => !p.out).length; k++) {
        const p = P[s];
        if (p) { p.hole.push(holes[s][round]); sfx.deal(); render(); }
        await sleep(55);
        s = T.nextInHand(s);
      }
    }
    status(''); updateHint(); saveSession();
    await sleep(160);

    while (!T.result) {
      const seat = T.acting;
      if (seat == null || seat < 0) break;
      const legal = T.legalActions(seat);
      if (!legal) break;
      const p = P[seat];
      G.turn = seat; G.acting = seat; render();
      const beforeCur = G.cur;
      const pre = T.board.length === 0;
      let a;
      if (p.human) {
        if (legal.toCall > 0) G.hp.faced++;
        a = await askHuman(p, legal);
        if (legal.toCall > 0 && a.type === 'fold') G.hp.foldFaced++;
        recordHuman(p, a, legal, beforeCur);
      } else {
        await sleep(delay() * (0.55 + Math.random() * 0.8) * (p.bot.pace || 1));
        a = legalize(botDecide(p, legal), legal);
        p.bot.seen++; p.bot.hands++;
        if (pre) {
          p.bot.preDecisions++;
          if (a.type === 'raise') p.bot.pfrCount++;
          if (a.type !== 'fold') p.bot.vpipCount++;
        } else {
          p.bot.postDecisions++;
          if (a.type === 'raise') p.bot.aggrCount++;
        }
        botTell(p, a);
        if (a.type === 'fold' && Math.random() < 0.25) botSay(p, 'fold');
        else if (a.type === 'raise' && Math.random() < 0.3) botSay(p, 'raise');
        else if (a.type === 'call' && legal.toCall === 0 && Math.random() < 0.2) botSay(p, 'call');
      }
      G.turn = -1; G.acting = -1;

      const boardBefore = T.board.length;
      const streetBefore = T.street;
      T.act(seat, a);
      if (G.replay) {
        G.replay.actions.push({
          seat,
          action: (a.type === 'raise' || a.type === 'bet')
            ? { type: a.type, to: a.to } : { type: a.type }
        });
      }
      syncEngine(T, boardBefore);
      const entry = T.log[T.log.length - 1] || { paid: 0 };
      const paid = entry.paid || 0;

      // Labels and sound are presentation only; the engine already ruled.
      if (a.type === 'fold') { p.tag = 'Fold'; sfx.fold(); }
      else if (a.type === 'call' || a.type === 'check') {
        p.tag = paid ? 'Call ' + fmt(paid) : 'Check';
        if (paid) { chipFlight(p, paid); sfx.chip(); } else sfx.check();
      } else if (a.type === 'raise' || a.type === 'bet') {
        p.tag = (beforeCur <= 0 ? 'Bet ' : 'Raise ') + fmt(a.to);
        if (paid) chipFlight(p, paid);
        if (p.allin) sfx.allin(); else sfx.raise();
      }
      render();

      if (T.board.length > boardBefore) {
        for (let k = boardBefore; k < T.board.length; k++) {
          G.board.push(T.board[k]);
          sfx.deal(); render();
          await sleep(125);
        }
        if (streetBefore !== T.street) status(T.street.charAt(0).toUpperCase() + T.street.slice(1));
      }
      observeAction(p, a, legal.toCall > 0, pre);
      syncEngine(T);
      render();
      updateHint();
      status('');
      if (!p.human) await sleep(Math.min(260, delay() * 0.3));
    }

    await finishHand(T.result);
  }

  async function finishHand(res) {
    const P = G.players;
    if (!res) return;
    G.over = true; G.turn = -1; G.acting = -1;
    syncEngine(G.engine);
    G.cur = 0; G.minRaise = G.bb;
    P.forEach((p) => {
      p.bet = 0; p.total = 0; p.allin = false;
      p.out = p.chips <= 0;
      p.win = false;
    });
    if (res.showdown) {
      (res.hands || []).forEach((h) => {
        const p = P[h.seat];
        if (p) { p.reveal = true; p.score = h.score; }
      });
      noteShowdowns();
      const topWin = (res.winners || []).slice().sort((a, b) => b.amount - a.amount)[0];
      if (topWin) {
        G.hl = new Set(C.bestFive(P[topWin.seat].hole.concat(G.board)));
      }
    }
    (res.winners || []).forEach((w) => { if (P[w.seat]) P[w.seat].win = true; });
    G.showPot = res.pot || 0;
    sfx.pot();
    $('#pot').classList.add('collect');
    render();
    updateHint();
    await sleep(420);

    const heroWin = (res.winners || []).find((w) => w.seat === 0);
    const heroGain = heroWin ? heroWin.amount : 0;
    const heroHand = res.showdown && G.hero.score ? C.handName(G.hero.score) : '';
    career.hands++;
    if (heroGain > 0) {
      career.won++;
      career.bestPot = Math.max(career.bestPot, heroGain);
      if (heroHand && G.hero.score === Math.max(...(res.hands || []).map((h) => h.score))) {
        career.bestHand = heroHand;
      }
      addXp(18 + Math.min(60, Math.round(heroGain / Math.max(1, G.bb))));
      sfx.win(); buzz([35, 55, 35]);
      banner('You win ' + fmt(heroGain), heroHand || 'Everyone folded', 'win');
      status('You take ' + fmt(heroGain) + (heroHand ? ' with ' + heroHand.toLowerCase() : ' \u2014 everyone folded'), true);
    } else {
      const topWin = (res.winners || []).slice().sort((a, b) => b.amount - a.amount)[0];
      if (topWin) {
        const p = P[topWin.seat];
        const nm = p && p.human ? 'You' : (p ? p.name : 'Seat');
        const h = (res.hands || []).find((x) => x.seat === topWin.seat);
        banner(nm + ' wins ' + fmt(topWin.amount), h ? C.handName(h.score) : 'Everyone folded', 'lose');
        status(nm + ' wins ' + fmt(topWin.amount) + (h ? ' with ' + C.handName(h.score).toLowerCase() : ''), true);
        if (p && !p.human) botSay(p, 'win');
      }
      addXp(6);
      if (G.hero.folded || G.hero.chips === 0) sfx.lose();
    }
    if (G.replay) {
      saveReplay(Object.assign({}, G.replay, {
        result: {
          showdown: !!res.showdown, board: (res.board || []).slice(), pot: res.pot,
          winners: res.winners, pots: res.pots
        },
        when: Date.now()
      }));
      G.replay = null;
    }
    saveCareer();
    saveSession();
    render();
    await sleep(650);
    G.showPot = 0;
    render();
    updateHint();
  }

  /* ================= session loop ================= */
  async function runSession() {
    const sid = G.sid;
    try {
      for (;;) {
        await playHand();
        if (G.sid !== sid) return;
        G.running = true;
        saveSession();
        if (G.tournament) {
          const bustedBots = G.players.filter((p) => !p.human && p.chips <= 0 && !p.place);
          const aliveNow = G.players.filter((p) => p.chips > 0).length;
          if (bustedBots.length) {
            bustedBots.forEach((p, k) => {
              p.out = true;
              p.folded = true;
              p.place = aliveNow + bustedBots.length - k;
              toast(p.name + ' busts - ' + ordinal(p.place));
            });
            render();
          }
          if (G.hero.chips <= 0) { await sleep(500); return tournamentBust(aliveNow + 1); }
          if (aliveNow <= 1) { await sleep(500); return tournamentWon(); }
          await waitNext();
          if (G.sid !== sid) return;
          continue;
        }
        rotateSeats();
        const hero = G.hero;
        if (hero.chips <= 0) { await sleep(500); return busted(); }
        if (hero.chips >= G.target) { await sleep(500); return cleared(); }
        const botsLeft = G.players.slice(1).filter((p) => p.chips > 0).length;
        if (!botsLeft) { await sleep(400); return cleared(); }
        await waitNext();
        if (G.sid !== sid) return;
      }
    } catch (e) {
      if (e !== ABORT) console.error(e);
    }
  }

  // A saloon table is a room people drift through. Every round brings new
  // faces, new temperaments and new habits; tournaments keep their field.
  function churnLineup() {
    if (G.tournament || G.hand < 1) return;
    const count = G.players.length - 1;
    if (count < 1) return;
    const swaps = Math.random() < 0.4 ? 2 : 1;
    for (let s = 0; s < swaps; s++) {
      const i = 1 + Math.floor(Math.random() * count);
      const old = G.players[i];
      const bot = B.makeRoster(1, G.skill)[0];
      G.players[i] = makePlayerFromBot(bot, i, freshStack());
      const el = seatEls[i];
      if (el) {
        const av = $('.avatar', el);
        if (av) { av.dataset.portrait = ''; av.innerHTML = ''; }
        el.classList.remove('win', 'fold', 'out', 'turn', 'acting');
        seatBotInfo(el, G.players[i]);
      }
      toast(old.name + ' racks up \u2014 ' + bot.name + ' takes the seat');
    }
    render();
  }

  function rotateSeats() {
    if (G.tournament) return;
    for (let i = 1; i < G.players.length; i++) {
      const p = G.players[i];
      const leave = p.chips <= 0 || (G.hand > 6 && Math.random() < 0.012);
      if (!leave) continue;
      const why = p.chips <= 0 ? ' is felted. ' : ' racks up and leaves. ';
      const bot = B.makeRoster(1, G.skill)[0];
      G.players[i] = makePlayerFromBot(bot, i, freshStack());
      const el = seatEls[i];
      if (el) {
        el.classList.remove('win', 'fold', 'out');
        seatBotInfo(el, G.players[i]);
      }
      toast(p.name + why + bot.name + ' sits down');
      break;
    }
    render();
  }

  function waitNext() {
    return new Promise((resolve, reject) => {
      const b = $('#nextBtn');
      b.textContent = 'Next hand';
      setMode('next');
      G.pending = { resolve, reject };
      b.onclick = () => { G.pending = null; setMode('wait'); resolve(); };
    });
  }

  function cleared() {
    const first = G.mapIndex >= career.cleared;
    const bonus = Math.round(G.buyin * (first ? 0.3 : 0.1));
    const chips = Math.max(0, G.hero.chips);
    // Practice tables never touch the bankroll or the map.
    if (G.mode === 'career') {
      career.bankroll += chips + bonus;
      if (first) career.cleared = G.mapIndex + 1;
      career.tables++;
    }
    addXp(first ? 400 : 120);
    saveCareer();
    store.del('session');
    G.running = false;
    sfx.level();
    const nextMap = MAPS[career.cleared];
    modal(
      '<div class="sheet-tag">Table cleared</div>' +
      '<h2>' + G.map.name + '</h2>' +
      '<p>You turned ' + fmt(G.buyin) + ' into <b>' + fmt(chips) + '</b> in ' + G.hand + ' hands.</p>' +
      '<div class="kv"><div><span>Cash out</span><b>+' + fmt(chips) + '</b></div>' +
      '<div><span>Clear bonus</span><b>+' + fmt(bonus) + '</b></div>' +
      '<div><span>Bankroll</span><b>' + fmt(career.bankroll) + '</b></div></div>' +
      (nextMap ? '<p class="unlock-line">Unlocked: <b>' + nextMap.name + '</b></p>' : '<p class="unlock-line">You have beaten every table. Legend.</p>') +
      '<button class="btn primary" id="nextMap">' + (nextMap ? 'Next table' : 'Back to menu') + '</button>' +
      '<button class="btn ghost-wide" id="toMenu">Main menu</button>',
      (sh) => {
        $('#nextMap', sh).onclick = () => {
          closeModal();
          if (nextMap) {
            if (career.bankroll < nextMap.buyin) { show('maps'); return; }
            career.bankroll -= nextMap.buyin; saveCareer();
            startSession({
              mapIndex: career.cleared, mode: 'career', buyin: nextMap.buyin, target: nextMap.target,
              skill: nextMap.skill, seats: nextMap.seats, bb: nextMap.bb, chips: nextMap.buyin, hand: 0
            });
          } else show('menu');
        };
        $('#toMenu', sh).onclick = () => { closeModal(); show('menu'); };
      }
    );
  }

  function busted() {
    G.running = false;
    store.del('session');
    saveCareer();
    sfx.bust();
    const canRetry = G.mode === 'career' && career.bankroll >= G.buyin;
    modal(
      '<div class="sheet-tag danger">Busted</div><h2>Out of chips</h2>' +
      '<p>You lost your ' + fmt(G.buyin) + ' buy-in after ' + G.hand + ' hands at ' + G.map.name + '.</p>' +
      '<p class="note">Bankroll: ' + fmt(career.bankroll) + ' chips</p>' +
      (canRetry ? '<button class="btn primary" id="retry">Buy in again \u00B7 ' + fmt(G.buyin) + '</button>' : '') +
      '<button class="btn ghost-wide" id="toMenu">Main menu</button>',
      (sh) => {
        const r = $('#retry', sh);
        if (r) r.onclick = () => {
          closeModal();
          career.bankroll -= G.buyin; saveCareer();
          startSession({
            mapIndex: G.mapIndex, mode: 'career', buyin: G.buyin, target: G.target,
            skill: G.skill, seats: G.seats, bb: G.bb, chips: G.buyin, hand: 0
          });
        };
        $('#toMenu', sh).onclick = () => { closeModal(); show('menu'); };
      }
    );
  }

  function tournamentWon() {
    G.running = false;
    store.del('session');
    const m = G.map;
    career.trophies[m.id] = (career.trophies[m.id] || 0) + 1;
    career.tournamentWins = (career.tournamentWins || 0) + 1;
    career.bankroll += G.prize;
    addXp(500);
    saveCareer();
    sfx.trophy();
    modal(
      '<div class="sheet-tag">Tournament won</div>' +
      '<h2>' + m.name + '</h2>' +
      '<p>You outlasted five players and took the whole thing.</p>' +
      '<div class="kv"><div><span>Prize</span><b>+' + fmt(G.prize) + '</b></div>' +
      '<div><span>Trophies here</span><b>' + career.trophies[m.id] + '</b></div>' +
      '<div><span>Bankroll</span><b>' + fmt(career.bankroll) + '</b></div></div>' +
      '<button class="btn primary" id="again">Play again</button>' +
      '<button class="btn ghost-wide" id="toMenu">Main menu</button>',
      (sh) => {
        $('#again', sh).onclick = () => { closeModal(); enterTournament(G.mapIndex); };
        $('#toMenu', sh).onclick = () => { closeModal(); show('menu'); };
      }
    );
  }

  function tournamentBust(place) {
    G.running = false;
    store.del('session');
    saveCareer();
    sfx.bust();
    const canRetry = career.bankroll >= G.buyin;
    modal(
      '<div class="sheet-tag danger">Knocked out</div>' +
      '<h2>' + ordinal(place) + ' place</h2>' +
      '<p>You finished ' + ordinal(place) + ' of 6 at ' + G.map.name + ' after ' + G.hand + ' hands.</p>' +
      '<p class="note">Bankroll: ' + fmt(career.bankroll) + ' chips</p>' +
      (canRetry ? '<button class="btn primary" id="retry">Re-enter - ' + fmt(G.buyin) + '</button>' : '') +
      '<button class="btn ghost-wide" id="toMenu">Main menu</button>',
      (sh) => {
        const r = $('#retry', sh);
        if (r) r.onclick = () => { closeModal(); enterTournament(G.mapIndex); };
        $('#toMenu', sh).onclick = () => { closeModal(); show('menu'); };
      }
    );
  }

  /* ================= pause / exit ================= */
  function abortGame() {
    G.sid++;
    G.running = false;
    G.acting = -1; G.turn = -1;
    if (G.pending) {
      const p = G.pending;
      G.pending = null;
      try { p.reject(ABORT); } catch (e) {}
    }
  }
  function cashOut() {
    if (G.mode === 'career') { career.bankroll += Math.max(0, G.hero.chips); saveCareer(); }
    abortGame();
    store.del('session');
    closeModal();
    show('menu');
  }
  function pauseMenu() {
    const SPEED_KEYS = ['slow', 'normal', 'fast'];
    const SL = { slow: 'Relaxed', normal: 'Normal', fast: 'Fast' };
    const cash = G.hero ? Math.max(0, G.hero.chips) : 0;
    modal(
      '<h2>Paused</h2><p>' + G.map.name + ' \u00B7 hand ' + G.hand + ' \u00B7 your stack <b>' + fmt(cash) + '</b></p>' +
      '<div class="group">' +
      '<div class="set"><span class="lab">Sound</span><div class="seg" id="segSound"></div></div>' +
      '<div class="set"><span class="lab">Speed</span><div class="seg" id="segSpeed"></div></div>' +
      '</div>' +
      '<button class="btn primary" id="pr">Resume</button>' +
      '<button class="btn" id="pc">' + (G.mode === 'career' ? 'Cash out \u00B7 ' + fmt(cash) : 'Leave table') + '</button>' +
      '<button class="btn ghost-wide" id="pq">Quit without cashing out</button>',
      (sh) => {
        const soundSeg = $('#segSound', sh), speedSeg = $('#segSpeed', sh);
        const paint = () => {
          soundSeg.innerHTML = '';
          [[true, 'On'], [false, 'Off']].forEach(([v, l]) => {
            const b = document.createElement('button'); b.textContent = l;
            if (S.sound === v) b.className = 'on';
            b.onclick = () => { S.sound = v; saveSettings(); paint(); if (v) sfx.chip(); };
            soundSeg.appendChild(b);
          });
          speedSeg.innerHTML = '';
          SPEED_KEYS.forEach((k) => {
            const b = document.createElement('button'); b.textContent = SL[k];
            if (S.speed === k) b.className = 'on';
            b.onclick = () => { S.speed = k; saveSettings(); paint(); };
            speedSeg.appendChild(b);
          });
        };
        paint();
        $('#pr', sh).onclick = closeModal;
        const pcBtn = $('#pc', sh);
        if (pcBtn) {
          pcBtn.onclick = cashOut;
          if (G.tournament) pcBtn.hidden = true;
        }
        if (G.tournament) {
          const info = sh.querySelector('p');
          if (info) info.textContent = G.map.name + ' - Level ' + G.tLevel + ', blinds ' +
            fmt(G.sb) + '/' + fmt(G.bb) + ', ' + G.players.filter((p) => p.chips > 0).length + ' left';
          const q = $('#pq', sh);
          if (q) q.textContent = 'Forfeit tournament';
        }
        $('#pq', sh).onclick = () => {
          abortGame(); store.del('session'); closeModal(); show('menu');
        };
      }
    );
  }

  $('#gMenu').onclick = () => { audio(); pauseMenu(); };
  $('#gHelp').onclick = showRanks;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  window.__back = () => {
    if (modalOpen()) { closeModal(); return true; }
    const on = document.querySelector('.screen.on');
    if (!on) return false;
    if (on.id === 'table') { pauseMenu(); return true; }
    if (on.id !== 'menu') { show('menu'); return true; }
    return false;
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.__back();
  });
  document.addEventListener('pointerdown', () => { if (S.sound) audio(); }, { once: true });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && !b.disabled) sfx.tap();
  }, true);

  /* ================= boot ================= */
  applyTheme();
  renderMenu();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__hld = {
    G, S, career, startSession, MAPS, sfx, audio, churnLineup, cardHTML, makeCardEl,
    engine: () => G.engine,
    graph: () => ({ ac, master, comp })
  };
})();
