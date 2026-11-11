/* replay.js — step through a recorded hand.
   Records store the table seed for that hand, the stacks before the deal, the
   button, and every engine-validated action. Replaying is therefore exact:
   the same engine rebuilds the same cards, betting state, pots and winners. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let timer = 0;

  const records = () => {
    try {
      const v = JSON.parse(localStorage.getItem('hlx_replays') || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  };
  const close = () => {
    clearInterval(timer); timer = 0;
    const m = $('#modal'); if (m) m.classList.remove('on');
  };
  const sheet = (html, wire) => {
    clearInterval(timer); timer = 0;
    const m = $('#modal'), sh = $('#sheet');
    if (!m || !sh) return;
    sh.innerHTML = html;
    m.classList.add('on');
    if (wire) wire(sh);
  };

  function actionText(rec, item) {
    const p = (rec.players || [])[item.seat] || { name: 'Seat ' + item.seat };
    const a = item.action || {};
    if (a.type === 'raise' || a.type === 'bet') return p.name + ' raises to ' + fmt(a.to);
    if (a.type === 'call') return p.name + ' calls';
    if (a.type === 'check') return p.name + ' checks';
    if (a.type === 'fold') return p.name + ' folds';
    if (a.type === 'allin') return p.name + ' is all-in';
    return p.name + ' ' + (a.type || 'acts');
  }

  function buildStates(rec) {
    const api = window.Engine;
    if (!api) throw new Error('Rules engine is not loaded');
    const T = new api.Table({
      sb: rec.sb, bb: rec.bb, button: rec.button, seed: rec.handSeed,
      players: (rec.players || []).map((p) => ({ id: p.id, name: p.name, stack: p.stack }))
    });
    T.startHand(rec.handSeed);
    const snap = () => ({
      board: T.board.slice(), street: T.street, pot: T.pot(), button: T.button,
      acting: T.acting, result: T.result, players: T.players.map((p) => ({
        seat: p.seat, name: p.name, stack: p.stack, bet: p.bet,
        folded: p.folded, allin: p.allin, out: p.out, hole: p.hole.slice()
      }))
    });
    const states = [snap()];
    (rec.actions || []).forEach((x) => {
      T.act(x.seat, x.action);
      states.push(snap());
    });
    return states;
  }

  function open(rec) {
    let states;
    try { states = buildStates(rec); }
    catch (e) {
      sheet('<h2>Replay unavailable</h2><p>This record could not be reconstructed: ' +
        esc(e.message) + '</p><button class="btn ghost-wide" id="rpClose">Close</button>',
        (sh) => { $('#rpClose', sh).onclick = close; });
      return;
    }
    let step = 0;
    const last = states.length - 1;
    sheet(
      '<div class="replay-head"><div><div class="sheet-tag">Hand replay</div>' +
      '<h2>Hand #' + esc(rec.hand) + '</h2><p>' + esc(rec.map || 'Hold\'em') + ' · ' +
      fmt(rec.sb) + '/' + fmt(rec.bb) + ' blinds</p></div>' +
      '<b class="replay-seed">seed ' + esc(rec.handSeed) + '</b></div>' +
      '<div class="rp-board" id="rpBoard"></div>' +
      '<div class="rp-meta" id="rpMeta"></div>' +
      '<div class="rp-players" id="rpPlayers"></div>' +
      '<div class="rp-log" id="rpLog"></div>' +
      '<div class="rp-controls"><button id="rpPrev" class="btn">‹ Prev</button>' +
      '<button id="rpPlay" class="btn primary">Play</button>' +
      '<button id="rpNext" class="btn">Next ›</button>' +
      '<span id="rpStep" class="rp-step"></span></div>' +
      '<button class="btn ghost-wide" id="rpClose">Close</button>',
      (sh) => {
        const board = $('#rpBoard', sh), meta = $('#rpMeta', sh);
        const players = $('#rpPlayers', sh), log = $('#rpLog', sh);
        const stepEl = $('#rpStep', sh), prev = $('#rpPrev', sh);
        const next = $('#rpNext', sh), play = $('#rpPlay', sh);

        const paint = (n) => {
          step = Math.max(0, Math.min(last, n));
          const s = states[step];
          board.innerHTML = '';
          for (let i = 0; i < 5; i++) {
            if (s.board[i] == null) {
              const e = document.createElement('div'); e.className = 'card empty'; board.appendChild(e);
            } else {
              const e = window.__hld.makeCardEl(s.board[i]);
              e.classList.add('rp-card'); board.appendChild(e);
            }
          }
          const winners = new Map((s.result && s.result.winners || []).map((w) => [w.seat, w]));
          meta.innerHTML = '<span class="rp-pot">Pot <b>' + fmt(s.pot) + '</b></span>' +
            '<span>' + esc(s.street) + '</span>' +
            (s.result ? '<span class="rp-result">' + (s.result.showdown ? 'Showdown' : 'Uncontested') + '</span>' : '');
          if (s.result && s.result.winners && s.result.winners.length) {
            meta.innerHTML += '<div class="rp-winners">' + s.result.winners.map((w) =>
              '<span><b>' + esc(w.name) + '</b> wins ' + fmt(w.amount) + '</span>').join('') + '</div>';
            if (s.result.pots && s.result.pots.length > 1) {
              meta.innerHTML += '<div class="rp-pots">Side pots: ' + s.result.pots.map((p) =>
                fmt(p.amount) + ' (' + p.eligible.length + ' eligible)').join(' · ') + '</div>';
            }
          }
          players.innerHTML = '';
          s.players.forEach((p, seat) => {
            const held = winners.get(seat);
            const d = document.createElement('div');
            d.className = 'rp-player' + (p.folded ? ' fold' : '') + (held ? ' win' : '');
            d.innerHTML = '<div class="rp-who"><b>' + esc(p.name) + '</b><span>' +
              fmt(p.stack) + '</span></div>' +
              (p.bet ? '<small class="rp-bet">bet ' + fmt(p.bet) + '</small>' : '') +
              (p.allin ? '<small class="rp-allin">all-in</small>' : '') +
              (s.button === seat ? '<small class="rp-d">D</small>' : '') +
              '<div class="rp-cards"></div>';
            const cards = $('.rp-cards', d);
            p.hole.forEach((c) => cards.appendChild(window.__hld.makeCardEl(c, 'rp-card')));
            players.appendChild(d);
          });
          log.innerHTML = '';
          (rec.actions || []).forEach((item, i) => {
            const row = document.createElement('div');
            row.className = 'rp-act' + (i < step ? ' done' : '') + (i === step - 1 ? ' current' : '');
            row.innerHTML = '<span>' + (i + 1) + '</span><b>' + esc(actionText(rec, item)) + '</b>';
            log.appendChild(row);
          });
          stepEl.textContent = 'Step ' + step + ' / ' + last;
          prev.disabled = step <= 0;
          next.disabled = step >= last;
          if (s.result) play.textContent = 'Replay';
        };

        const stop = () => { clearInterval(timer); timer = 0; play.textContent = 'Play'; };
        const start = () => {
          if (step >= last) paint(0);
          play.textContent = 'Pause';
          timer = setInterval(() => {
            if (step >= last) { stop(); return; }
            paint(step + 1);
            if (step >= last) stop();
          }, 750);
        };
        prev.onclick = () => { stop(); paint(step - 1); };
        next.onclick = () => { stop(); paint(step + 1); };
        play.onclick = () => { if (timer) stop(); else start(); };
        $('#rpClose', sh).onclick = close;
        paint(0);
      }
    );
  }

  function openList() {
    const list = records();
    if (!list.length) {
      sheet('<h2>Hand replays</h2><p>No hands recorded yet. Play a hand and it will ' +
        'appear here, with its seed and every action.</p>' +
        '<button class="btn ghost-wide" id="rpClose">Close</button>',
        (sh) => { $('#rpClose', sh).onclick = close; });
      return;
    }
    sheet('<h2>Hand replays</h2><p>Recorded hands can be stepped through exactly, ' +
      'including the deal, every action, side pots and the result.</p><div id="rpList" class="rp-list"></div>' +
      '<button class="btn ghost-wide" id="rpClose">Close</button>', (sh) => {
        const box = $('#rpList', sh);
        list.forEach((rec, i) => {
          const b = document.createElement('button');
          b.className = 'rp-row';
          const win = rec.result && rec.result.winners && rec.result.winners[0];
          b.innerHTML = '<b>Hand #' + esc(rec.hand) + '</b><span>' + esc(rec.map || 'Table') +
            ' · ' + fmt(rec.sb) + '/' + fmt(rec.bb) + '</span><small>' +
            (win ? esc(win.name) + ' won ' + fmt(win.amount) : 'No result') + '</small>';
          b.onclick = () => open(rec);
          box.appendChild(b);
        });
        $('#rpClose', sh).onclick = close;
      });
  }

  const api = { open, openList, openLast: () => { const l = records(); if (l[0]) open(l[0]); else openList(); }, records };
  window.ReplayUI = api;
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('mReplays');
    if (b) b.onclick = openList;
  });
  if (document.readyState !== 'loading') {
    const b = document.getElementById('mReplays');
    if (b) b.onclick = openList;
  }
  const modal = document.getElementById('modal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
})();
