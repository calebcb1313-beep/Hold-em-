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

  const format = () => {
    if (!window.ReplayFormat) throw new Error('Replay sharing is not loaded');
    return window.ReplayFormat;
  };
  const records = () => {
    try {
      const v = JSON.parse(localStorage.getItem('hlx_replays') || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  };
  const writeRecords = (list) => {
    localStorage.setItem('hlx_replays', JSON.stringify(list.slice(0, 12)));
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

  function importSummary(result) {
    let out = result.added
      ? 'Imported ' + result.added + ' hand' + (result.added === 1 ? '.' : 's.')
      : 'No new hands \u2014 those replays are already saved.';
    if (result.dropped) {
      out += ' The oldest ' + result.dropped + ' hand' + (result.dropped === 1 ? ' was' : 's were') +
        ' replaced.';
    }
    return out + ' ' + result.records.length + ' of 12 saved.';
  }

  function importText(text) {
    const imported = format().parse(text, window.Engine);
    const result = format().merge(records(), imported);
    writeRecords(result.records);
    return result;
  }

  function share(recs) {
    let text;
    try { text = format().serialize(recs); }
    catch (e) {
      sheet('<h2>Sharing unavailable</h2><p>' + esc(e.message) +
        '</p><button class="btn ghost-wide" id="rpClose">Close</button>',
        (sh) => { $('#rpClose', sh).onclick = close; });
      return;
    }
    const one = recs.length === 1;
    const title = one ? 'Share hand #' + esc(recs[0].hand) : 'Share ' + recs.length + ' replays';
    const file = one
      ? 'holdem-royale-hand-' + String(recs[0].hand || 0).replace(/[^\w.-]/g, '') + '-' +
        String(recs[0].handSeed || 0).replace(/[^\w.-]/g, '') + '.json'
      : 'holdem-royale-replays.json';
    sheet(
      '<div class="sheet-tag">Replay file</div><h2>' + title + '</h2>' +
      '<p>Copy this JSON or download it. Import it from <b>Replays \u2192 Import</b> ' +
      'on this or another device.</p>' +
      '<textarea id="rpShareText" class="rp-text" readonly spellcheck="false" ' +
      'aria-label="Replay JSON"></textarea>' +
      '<div class="rp-io"><button id="rpCopy" class="btn primary">Copy</button>' +
      '<button id="rpDownload" class="btn">Download .json</button></div>' +
      '<div id="rpShareNote" class="rp-note" role="status"></div>' +
      '<button class="btn ghost-wide" id="rpBack">Back</button>',
      (sh) => {
        const area = $('#rpShareText', sh), note = $('#rpShareNote', sh);
        area.value = text;
        const say = (msg, bad) => {
          note.textContent = msg;
          note.classList.toggle('err', !!bad);
        };
        $('#rpCopy', sh).onclick = async () => {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
              await navigator.clipboard.writeText(text);
            } else {
              area.focus(); area.select();
              if (!document.execCommand('copy')) throw new Error('copy was blocked');
            }
            say('Copied to clipboard.');
          } catch (e) {
            area.focus(); area.select();
            say('Selected the JSON. Press Ctrl/Cmd+C to copy.', true);
          }
        };
        $('#rpDownload', sh).onclick = () => {
          try {
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url; a.download = file;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            say('Download started. If nothing happened, copy the JSON above.');
          } catch (e) {
            say('Download is blocked here. Copy the JSON above instead.', true);
          }
        };
        $('#rpBack', sh).onclick = () => openList();
      }
    );
  }

  function importSheet() {
    sheet(
      '<h2>Import replays</h2><p>Paste an exported replay bundle or choose its JSON file. ' +
      'The engine checks every action and rebuilds the hand before saving it.</p>' +
      '<textarea id="rpImportText" class="rp-text" spellcheck="false" ' +
      'placeholder="Paste replay JSON here" aria-label="Replay JSON to import"></textarea>' +
      '<div class="rp-io"><button id="rpPick" class="btn">Choose file</button>' +
      '<button id="rpImportGo" class="btn primary">Import</button></div>' +
      '<input id="rpFile" type="file" accept=".json,application/json" hidden>' +
      '<div id="rpImportNote" class="rp-note" role="status"></div>' +
      '<button class="btn ghost-wide" id="rpBack">Back</button>',
      (sh) => {
        const area = $('#rpImportText', sh), file = $('#rpFile', sh);
        const note = $('#rpImportNote', sh);
        const say = (msg, bad) => {
          note.textContent = msg;
          note.classList.toggle('err', !!bad);
        };
        const doImport = () => {
          try {
            const result = importText(area.value);
            openList(importSummary(result));
          } catch (e) {
            say('Could not import: ' + (e.message || e), true);
          }
        };
        $('#rpPick', sh).onclick = () => file.click();
        file.onchange = () => {
          const f = file.files && file.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => {
            area.value = String(reader.result || '');
            doImport();
          };
          reader.onerror = () => say('Could not read that file.', true);
          reader.readAsText(f);
        };
        $('#rpImportGo', sh).onclick = doImport;
        $('#rpBack', sh).onclick = () => openList();
      }
    );
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
      '<h2>Hand #' + esc(rec.hand) + '</h2><p>' + esc(rec.map || 'Hold\'em') + ' \u00b7 ' +
      fmt(rec.sb) + '/' + fmt(rec.bb) + ' blinds</p></div>' +
      '<b class="replay-seed">seed ' + esc(rec.handSeed) + '</b></div>' +
      '<div class="rp-board" id="rpBoard"></div>' +
      '<div class="rp-meta" id="rpMeta"></div>' +
      '<div class="rp-players" id="rpPlayers"></div>' +
      '<div class="rp-log" id="rpLog"></div>' +
      '<div class="rp-controls"><button id="rpPrev" class="btn">\u2039 Prev</button>' +
      '<button id="rpPlay" class="btn primary">Play</button>' +
      '<button id="rpNext" class="btn">Next \u203a</button>' +
      '<span id="rpStep" class="rp-step"></span></div>' +
      '<div class="rp-io"><button id="rpShare" class="btn">Share hand</button></div>' +
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
                fmt(p.amount) + ' (' + p.eligible.length + ' eligible)').join(' \u00b7 ') + '</div>';
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
        $('#rpShare', sh).onclick = () => { stop(); share([rec]); };
        $('#rpClose', sh).onclick = close;
        paint(0);
      }
    );
  }

  function openList(noteText, isError) {
    const list = records();
    const noteHtml = noteText
      ? '<div id="rpNote" class="rp-note' + (isError ? ' err' : '') + '" role="status">' +
        esc(noteText) + '</div>'
      : '';
    if (!list.length) {
      sheet('<h2>Hand replays</h2>' + noteHtml +
        '<p>No hands recorded yet. Play a hand and it will appear here, or import a ' +
        'shared JSON replay.</p>' +
        '<div class="rp-io"><button id="rpImport" class="btn">Import replay</button></div>' +
        '<button class="btn ghost-wide" id="rpClose">Close</button>',
        (sh) => {
          $('#rpImport', sh).onclick = importSheet;
          $('#rpClose', sh).onclick = close;
        });
      return;
    }
    sheet('<h2>Hand replays</h2>' + noteHtml +
      '<p>Recorded hands can be stepped through exactly, including the deal, every action, ' +
      'side pots and the result. Share one as a JSON file or import a friend\u2019s hand.</p>' +
      '<div class="rp-io"><button id="rpImport" class="btn">Import</button>' +
      '<button id="rpExport" class="btn">Export all</button></div>' +
      '<div id="rpList" class="rp-list"></div>' +
      '<button class="btn ghost-wide" id="rpClose">Close</button>', (sh) => {
        const box = $('#rpList', sh);
        list.forEach((rec) => {
          const b = document.createElement('button');
          b.className = 'rp-row';
          const win = rec.result && rec.result.winners && rec.result.winners[0];
          b.innerHTML = '<b>Hand #' + esc(rec.hand) + '</b><span>' + esc(rec.map || 'Table') +
            ' \u00b7 ' + fmt(rec.sb) + '/' + fmt(rec.bb) + '</span><small>' +
            (win ? esc(win.name) + ' won ' + fmt(win.amount) : 'No result') + '</small>';
          b.onclick = () => open(rec);
          box.appendChild(b);
        });
        $('#rpImport', sh).onclick = importSheet;
        $('#rpExport', sh).onclick = () => share(list);
        $('#rpClose', sh).onclick = close;
      });
  }

  const api = {
    open, openList,
    openLast: () => { const l = records(); if (l[0]) open(l[0]); else openList(); },
    records,
    exportText: (list) => format().serialize(list),
    parseText: (text) => format().parse(text, window.Engine),
    importText
  };
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
