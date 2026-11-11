/* replay-format.js — portable, validated JSON for recorded hands.
   Exported records are replayed through the engine on import. This means an
   imported hand must use legal actions and must actually finish, rather than
   trusting a result or card list supplied by the file. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReplayFormat = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'holdem-royale/replays';
  const VERSION = 1;
  const MAX_RECORDS = 12;
  const MAX_PLAYERS = 10;
  const MAX_ACTIONS = 500;
  const MAX_TEXT = 40;
  const TYPES = new Set(['fold', 'check', 'call', 'raise', 'bet', 'allin']);

  const bad = (msg) => { throw new Error(msg); };
  const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function whole(v, label, min, max) {
    const n = typeof v === 'string' && v.trim() ? Number(v) : v;
    if (!Number.isSafeInteger(n)) bad(label + ' must be a whole number');
    if (n < min || n > max) bad(label + ' is out of range');
    return n;
  }

  function text(v, label, max) {
    if (v == null) return '';
    if (typeof v !== 'string' && typeof v !== 'number') bad(label + ' must be text');
    const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (s.length > max) bad(label + ' is too long');
    return s;
  }

  function cleanAction(raw, index, seats) {
    if (!object(raw)) bad('Action ' + (index + 1) + ' is not an object');
    const seat = whole(raw.seat, 'Action ' + (index + 1) + ' seat', 0, seats - 1);
    if (!object(raw.action)) bad('Action ' + (index + 1) + ' is missing its play');
    const type = raw.action.type;
    if (!TYPES.has(type)) bad('Action ' + (index + 1) + ' has an unknown type');
    if (type === 'raise' || type === 'bet') {
      return {
        seat,
        action: { type, to: whole(raw.action.to, 'Action ' + (index + 1) + ' amount', 1, 1e9) }
      };
    }
    return { seat, action: { type } };
  }

  /* Structural checks first, then a full engine replay. The returned record
     carries the engine's own board, side pots and winners. */
  function normalize(raw, Engine) {
    if (!object(raw)) bad('Replay is not an object');
    if (!Engine || !Engine.Table) bad('Rules engine is not available');
    const handSeed = whole(raw.handSeed, 'Hand seed', 0, 4294967295);
    const sb = whole(raw.sb, 'Small blind', 1, 1e9);
    const bb = whole(raw.bb, 'Big blind', 1, 1e9);
    if (bb < sb) bad('Big blind must be at least the small blind');

    const inputPlayers = raw.players;
    if (!Array.isArray(inputPlayers) || inputPlayers.length < 2 ||
        inputPlayers.length > MAX_PLAYERS) {
      bad('A replay needs two to ten players');
    }
    const ids = new Set();
    const players = inputPlayers.map((p, i) => {
      if (!object(p)) bad('Player ' + (i + 1) + ' is not an object');
      const id = text(p.id == null ? 'p' + i : p.id, 'Player ' + (i + 1) + ' id', MAX_TEXT) ||
        ('p' + i);
      if (ids.has(id)) bad('Player ids must be unique');
      ids.add(id);
      const name = text(p.name == null ? 'Seat ' + i : p.name,
        'Player ' + (i + 1) + ' name', MAX_TEXT) || ('Seat ' + i);
      const stack = whole(p.stack, 'Player ' + (i + 1) + ' stack', 0, 1e9);
      return { id, name, stack };
    });
    if (players.filter((p) => p.stack > 0).length < 2) {
      bad('At least two players need chips');
    }

    const button = whole(raw.button, 'Button', 0, players.length - 1);
    const inputActions = raw.actions;
    if (!Array.isArray(inputActions) || !inputActions.length ||
        inputActions.length > MAX_ACTIONS) {
      bad('A replay needs between 1 and ' + MAX_ACTIONS + ' actions');
    }
    const actions = inputActions.map((a, i) => cleanAction(a, i, players.length));
    const rec = {
      hand: whole(raw.hand == null ? 0 : raw.hand, 'Hand number', 0, 1e9),
      handSeed, sb, bb, button, players, actions,
      mode: text(raw.mode, 'Mode', 16),
      map: text(raw.map, 'Table', MAX_TEXT)
    };

    let table;
    try {
      table = new Engine.Table({
        sb, bb, button, seed: handSeed,
        players: players.map((p) => ({ id: p.id, name: p.name, stack: p.stack }))
      });
      table.startHand(handSeed);
      actions.forEach((x) => table.act(x.seat, x.action));
    } catch (e) {
      bad('Replay actions are not legal: ' + (e && e.message ? e.message : e));
    }
    if (!table.result) bad('Replay does not finish the hand');
    rec.result = table.result;
    rec.when = Number.isFinite(Number(raw.when)) ? Number(raw.when) : Date.now();
    return rec;
  }

  function publicRecord(r) {
    return {
      hand: r.hand, handSeed: r.handSeed, sb: r.sb, bb: r.bb, button: r.button,
      players: (r.players || []).map((p) => ({ id: p.id, name: p.name, stack: p.stack })),
      actions: (r.actions || []).map((a) => ({
        seat: a.seat,
        action: (a.action && (a.action.type === 'raise' || a.action.type === 'bet'))
          ? { type: a.action.type, to: a.action.to }
          : { type: a.action && a.action.type }
      })),
      mode: r.mode || '', map: r.map || '', result: r.result || null,
      when: r.when || null
    };
  }

  function serialize(list) {
    if (!Array.isArray(list)) list = [list];
    return JSON.stringify({
      format: FORMAT,
      version: VERSION,
      app: "Hold'em Royale",
      exportedAt: new Date().toISOString(),
      replays: list.slice(0, MAX_RECORDS).map(publicRecord)
    }, null, 2);
  }

  function parse(source, Engine) {
    if (typeof source !== 'string' || !source.trim()) {
      bad('Paste an exported replay or choose a JSON file first.');
    }
    let data;
    try { data = JSON.parse(source); }
    catch (e) { bad('That is not valid JSON.'); }

    let list;
    if (Array.isArray(data)) list = data;
    else if (object(data) && data.format != null && data.format !== FORMAT) {
      bad('That is not a Hold\'em Royale replay file.');
    } else if (object(data) && data.format === FORMAT) {
      if (data.version != null && Number(data.version) !== VERSION) {
        bad('Unsupported replay version.');
      }
      list = data.replays;
    } else if (object(data) && data.replay) list = [data.replay];
    else if (object(data)) list = [data];
    else bad('No replays found in that file.');

    if (!Array.isArray(list) || !list.length) bad('No replays found in that file.');
    if (list.length > MAX_RECORDS) bad('A file may contain at most ' + MAX_RECORDS + ' replays.');
    return list.map((r, i) => {
      try { return normalize(r, Engine); }
      catch (e) { bad('Replay ' + (i + 1) + ': ' + (e && e.message ? e.message : e)); }
    });
  }

  /* The action log plus starting stacks identifies a hand. Results are not
     part of the identity because imports recompute them. */
  function signature(rec) {
    return JSON.stringify([
      rec.handSeed, rec.hand, rec.sb, rec.bb, rec.button,
      (rec.players || []).map((p) => [p.id, p.name, p.stack]),
      (rec.actions || []).map((a) => [a.seat, a.action && a.action.type, a.action && a.action.to])
    ]);
  }

  /* Incoming records go first. Duplicate hands are discarded and the list is
     capped so imports cannot grow localStorage without bound. */
  function merge(existing, incoming) {
    const base = Array.isArray(existing) ? existing : [];
    const add = Array.isArray(incoming) ? incoming : [];
    const existingKeys = new Set(base.map(signature));
    const seen = new Set();
    const records = [];
    let added = 0, duplicates = 0, dropped = 0;
    add.forEach((rec) => {
      const key = signature(rec);
      if (seen.has(key) || existingKeys.has(key)) { duplicates++; return; }
      if (records.length >= MAX_RECORDS) { dropped++; return; }
      seen.add(key);
      records.push(rec);
      added++;
    });
    base.forEach((rec) => {
      const key = signature(rec);
      if (seen.has(key)) return;
      if (records.length >= MAX_RECORDS) return;
      seen.add(key);
      records.push(rec);
    });
    return { records, added, duplicates, dropped };
  }

  return {
    FORMAT, VERSION, MAX_RECORDS, MAX_PLAYERS, MAX_ACTIONS,
    normalize, serialize, parse, signature, merge
  };
});
