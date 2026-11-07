/* ==========================================================================
   Asset Command Center
   A HUD-style control center for yachts, vehicles, properties and the
   equipment they carry, plus a logistics planner for missions.
   Vanilla JS, no build step. Data persists in localStorage.
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'asset-command-center.v1';
  var DAY = 86400000;

  // ---------------------------------------------------------------- utils
  function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function iso(d) {
    var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function parse(s) { if (!s) return null; var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(n) { return iso(new Date(today().getTime() + n * DAY)); }
  function daysUntil(s) { var d = parse(s); return d ? Math.round((d - today()) / DAY) : null; }
  function fmtDate(s) {
    var d = parse(s); if (!d) return '—';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtShort(s) { var d = parse(s); return d ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '—'; }
  function overlaps(a, b) { return a.start <= b.end && b.start <= a.end; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---------------------------------------------------------------- reference data
  var ASSET_TYPES = {
    yacht: 'Yacht', vehicle: 'Vehicle', property: 'Property', aircraft: 'Aircraft', other: 'Other'
  };
  var ASSET_STATUS = {
    operational: { label: 'Operational', cls: 's-ok' },
    deployed: { label: 'Deployed', cls: 's-info' },
    standby: { label: 'Standby', cls: 's-mute' },
    maintenance: { label: 'Maintenance', cls: 's-warn' },
    offline: { label: 'Offline', cls: 's-crit' }
  };
  var EQ_CONDITION = {
    ok: { label: 'Nominal', cls: 's-ok' },
    service: { label: 'Needs service', cls: 's-warn' },
    damaged: { label: 'Damaged', cls: 's-crit' }
  };
  var EQ_CATEGORIES = ['Watercraft', 'Diving', 'Comms', 'Power', 'Recovery', 'Camping', 'Sports', 'Safety', 'Electronics', 'Tools', 'Other'];
  var MISSION_STATUS = {
    planned: { label: 'Planned', cls: 's-info' },
    active: { label: 'Active', cls: 's-ok' },
    complete: { label: 'Complete', cls: 's-mute' },
    cancelled: { label: 'Cancelled', cls: 's-crit' }
  };

  var ICONS = {
    yacht: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 3v19M16 4l9 16H16M16 7L8 20h8"/><path d="M3 23h26l-4 5H7z"/></svg>',
    vehicle: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 21V10h17v11M19 13h6l5 5v3h-11"/><circle cx="8" cy="23" r="3"/><circle cx="24" cy="23" r="3"/><path d="M4 7h13"/></svg>',
    property: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 15L16 4l13 11"/><path d="M6 13v15h20V13"/><path d="M13 28v-8h6v8"/></svg>',
    aircraft: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 3c1.5 0 2 2 2 4v6l11 6v3l-11-3v6l3 3v2l-5-1.5L11 30v-2l3-3v-6L3 22v-3l11-6V7c0-2 .5-4 2-4z"/></svg>',
    other: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 3l11 6.5v13L16 29 5 22.5v-13z"/><circle cx="16" cy="16" r="4"/></svg>'
  };

  // ---------------------------------------------------------------- state
  var state = load();
  var ui = { view: 'bridge', assetFilter: '', eqFilter: '', eqAsset: '', missionFilter: 'upcoming', timelineDays: 60 };

  function seed() {
    var a = {
      aurora: uid('ast'), nomad: uid('ast'), truck: uid('ast'), chalet: uid('ast'), villa: uid('ast'), hq: uid('ast')
    };
    var assets = [
      { id: a.aurora, name: 'M/Y Aurora', type: 'yacht', status: 'operational', location: 'ACI Marina Split, HR', lat: 43.50, lon: 16.44,
        fuel: 78, battery: 92, water: 64, nextService: addDays(41), registration: 'HR-ST-2207', notes: '32 m motor yacht. Captain Marko on call.' },
      { id: a.nomad, name: 'S/Y Nomad', type: 'yacht', status: 'standby', location: 'Club de Mar, Palma', lat: 39.56, lon: 2.63,
        fuel: 36, battery: 71, water: 40, nextService: addDays(9), registration: 'ES-PM-118', notes: '18 m sailing yacht. Rigging check pending.' },
      { id: a.truck, name: 'Unimog Expedition', type: 'vehicle', status: 'operational', location: 'HQ Garage, Prague', lat: 50.08, lon: 14.43,
        fuel: 22, battery: 88, water: 15, nextService: addDays(26), registration: '9A1 4477', notes: 'U5023 overland camper. 4x4, 800 L water, solar 1.2 kW.' },
      { id: a.chalet, name: 'Chalet Matterhorn', type: 'property', status: 'operational', location: 'Zermatt, CH', lat: 46.02, lon: 7.75,
        fuel: 55, battery: null, water: null, nextService: addDays(70), registration: '', notes: 'Heating oil tank on fuel gauge. Caretaker: Anna.' },
      { id: a.villa, name: 'Villa Mare', type: 'property', status: 'operational', location: 'Port d\'Andratx, Mallorca', lat: 39.54, lon: 2.39,
        fuel: null, battery: 64, water: 81, nextService: addDays(-3), registration: '', notes: 'Pool + solar storage. Boat house for tender.' },
      { id: a.hq, name: 'Prague HQ & Depot', type: 'property', status: 'operational', location: 'Prague, CZ', lat: 50.09, lon: 14.40,
        fuel: null, battery: null, water: null, nextService: addDays(120), registration: '', notes: 'Main equipment depot.' }
    ];
    function eq(name, category, qty, assetId, condition, notes) {
      return { id: uid('eq'), name: name, category: category, qty: qty, assetId: assetId, condition: condition || 'ok', lastCheck: addDays(-Math.round(Math.random() * 90)), notes: notes || '' };
    }
    var equipment = [
      eq('Tender Williams 445', 'Watercraft', 1, a.aurora),
      eq('Jet ski Sea-Doo GTX', 'Watercraft', 2, a.aurora),
      eq('Scuba set (BCD + reg)', 'Diving', 6, a.aurora),
      eq('Bauer dive compressor', 'Diving', 1, a.aurora, 'service', 'Filter change overdue'),
      eq('Starlink Maritime kit', 'Comms', 1, a.aurora),
      eq('DJI Mavic 3 drone', 'Electronics', 1, a.truck),
      eq('Iridium sat phone', 'Comms', 2, a.hq),
      eq('Honda EU22i generator', 'Power', 1, a.hq),
      eq('Rooftop tent', 'Camping', 1, a.truck),
      eq('Maxtrax recovery boards', 'Recovery', 2, a.truck),
      eq('Warn winch kit', 'Recovery', 1, a.truck),
      eq('Kitesurf quiver', 'Sports', 1, a.villa),
      eq('E-bike Specialized Levo', 'Sports', 2, a.villa),
      eq('Ski set (adult)', 'Sports', 4, a.chalet),
      eq('Avalanche beacon kit', 'Safety', 4, a.hq, 'ok'),
      eq('Offshore medical kit', 'Safety', 1, a.nomad),
      eq('Liferaft 8-person', 'Safety', 1, a.nomad, 'service', 'Recertification due'),
      eq('Fishing gear (big game)', 'Sports', 1, a.aurora),
      eq('Starlink Mini', 'Comms', 1, a.hq)
    ];
    function eqId(name) { for (var i = 0; i < equipment.length; i++) if (equipment[i].name === name) return equipment[i].id; return null; }
    function cl(items) { return items.map(function (t) { return { text: t, done: false }; }); }
    var missions = [
      { id: uid('msn'), name: 'Dalmatian Coast Cruise', status: 'planned', start: addDays(5), end: addDays(14),
        assetIds: [a.aurora], equipmentIds: [eqId('Tender Williams 445'), eqId('Jet ski Sea-Doo GTX'), eqId('Scuba set (BCD + reg)'), eqId('DJI Mavic 3 drone'), eqId('Starlink Maritime kit')],
        destination: 'Split → Hvar → Vis → Korčula', lat: 43.17, lon: 16.44, crew: 'Capt. Marko, chef, 2 deckhands, 6 guests',
        checklist: cl(['Provisioning order sent', 'Fuel bunkering booked', 'Dive compressor serviced', 'Guest manifest to marina', 'Berth reservations Hvar & Vis']), notes: '' },
      { id: uid('msn'), name: 'Sahara Overland Expedition', status: 'planned', start: addDays(10), end: addDays(31),
        assetIds: [a.truck], equipmentIds: [eqId('Starlink Maritime kit'), eqId('Rooftop tent'), eqId('Maxtrax recovery boards'), eqId('Warn winch kit'), eqId('Iridium sat phone'), eqId('Honda EU22i generator')],
        destination: 'Prague → Genoa ferry → Tunis → Douz', lat: 33.46, lon: 9.02, crew: 'Driver + navigator',
        checklist: cl(['Carnet de passages', 'Ferry Genoa–Tunis booked', 'Tyres 80% or better', 'Fill water tanks', 'Medical & evac insurance']), notes: 'Starlink double-booked with the cruise — resolve.' },
      { id: uid('msn'), name: 'Balearic Regatta', status: 'planned', start: addDays(19), end: addDays(23),
        assetIds: [a.nomad], equipmentIds: [eqId('Offshore medical kit'), eqId('Liferaft 8-person'), eqId('Kitesurf quiver')],
        destination: 'Palma Bay', lat: 39.5, lon: 2.6, crew: 'Skipper + 5 crew',
        checklist: cl(['Race entry paid', 'Rigging inspection', 'Liferaft recertified', 'New sails delivered']), notes: '' },
      { id: uid('msn'), name: 'Ski Week Zermatt', status: 'planned', start: addDays(48), end: addDays(55),
        assetIds: [a.chalet], equipmentIds: [eqId('Ski set (adult)'), eqId('Avalanche beacon kit')],
        destination: 'Zermatt', lat: 46.02, lon: 7.75, crew: 'Family + 2 friends',
        checklist: cl(['Chalet heating on 2 days early', 'Ski passes', 'Helicopter transfer from Sion']), notes: '' },
      { id: uid('msn'), name: 'Spring Recommissioning', status: 'complete', start: addDays(-40), end: addDays(-33),
        assetIds: [a.aurora], equipmentIds: [], destination: 'Split shipyard', lat: 43.5, lon: 16.44, crew: 'Yard crew',
        checklist: [{ text: 'Antifouling', done: true }, { text: 'Engine service', done: true }], notes: '' }
    ];
    return { version: 1, assets: assets, equipment: equipment, missions: missions, log: [
      { at: new Date().toISOString(), text: 'Command center initialised with demo data.' }
    ] };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { var s = JSON.parse(raw); if (s && s.assets) return s; }
    } catch (e) { /* storage unavailable */ }
    return seed();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function log(text) {
    state.log.unshift({ at: new Date().toISOString(), text: text });
    if (state.log.length > 300) state.log.length = 300;
  }
  function commit(msg) { if (msg) log(msg); save(); render(); fetchWeather(); }

  // ---------------------------------------------------------------- logistics engine
  function assetName(id) { var a = byId(state.assets, id); return a ? a.name : 'Unassigned'; }
  function activeMissions() {
    return state.missions.filter(function (m) { return m.status !== 'complete' && m.status !== 'cancelled'; });
  }
  function missionPhase(m) {
    if (m.status === 'complete' || m.status === 'cancelled') return m.status;
    var t = iso(today());
    if (m.end < t) return 'overdue';
    if (m.start <= t) return 'underway';
    return 'upcoming';
  }

  /** Analyse the whole state and return logistics alerts. */
  function analyse() {
    var alerts = [];
    var ms = activeMissions();
    var t = iso(today());

    // Double-booked assets / equipment
    for (var i = 0; i < ms.length; i++) {
      for (var j = i + 1; j < ms.length; j++) {
        var a = ms[i], b = ms[j];
        if (!overlaps(a, b)) continue;
        a.assetIds.forEach(function (id) {
          if (b.assetIds.indexOf(id) >= 0) {
            alerts.push({ level: 'crit', kind: 'conflict', missions: [a.id, b.id],
              text: assetName(id) + ' double-booked', sub: a.name + ' ↔ ' + b.name });
          }
        });
        a.equipmentIds.forEach(function (id) {
          if (b.equipmentIds.indexOf(id) >= 0) {
            var e = byId(state.equipment, id);
            if (e) alerts.push({ level: 'crit', kind: 'conflict', missions: [a.id, b.id],
              text: e.name + ' needed in two places', sub: a.name + ' ↔ ' + b.name });
          }
        });
      }
    }

    // Transfers required / equipment condition
    ms.forEach(function (m) {
      var d = daysUntil(m.start);
      transfersFor(m).forEach(function (tr) {
        alerts.push({ level: d != null && d <= 7 ? 'crit' : 'warn', kind: 'transfer', missions: [m.id],
          text: 'Move ' + tr.equipment.name + ' → ' + assetName(tr.to),
          sub: 'From ' + assetName(tr.equipment.assetId) + ' for "' + m.name + '" (T-' + Math.max(d, 0) + 'd)' });
      });
      m.equipmentIds.forEach(function (id) {
        var e = byId(state.equipment, id);
        if (e && e.condition !== 'ok') {
          alerts.push({ level: e.condition === 'damaged' ? 'crit' : 'warn', kind: 'equipment', missions: [m.id],
            text: e.name + ': ' + EQ_CONDITION[e.condition].label, sub: 'Required for "' + m.name + '"' });
        }
      });
      m.assetIds.forEach(function (id) {
        var as = byId(state.assets, id);
        if (!as) return;
        if (as.status === 'maintenance' || as.status === 'offline') {
          alerts.push({ level: 'crit', kind: 'asset', missions: [m.id],
            text: as.name + ' is ' + ASSET_STATUS[as.status].label.toLowerCase(), sub: 'Assigned to "' + m.name + '"' });
        }
        if (as.nextService && as.nextService >= m.start && as.nextService <= m.end) {
          alerts.push({ level: 'warn', kind: 'service', missions: [m.id],
            text: as.name + ' service falls during mission', sub: fmtDate(as.nextService) + ' — "' + m.name + '"' });
        }
      });
      if (m.end < t && m.status !== 'complete') {
        alerts.push({ level: 'warn', kind: 'mission', missions: [m.id], text: '"' + m.name + '" ended — mark complete?', sub: 'Ended ' + fmtDate(m.end) });
      }
    });

    // Asset health
    state.assets.forEach(function (as) {
      var d = daysUntil(as.nextService);
      if (d != null && d < 0) alerts.push({ level: 'crit', kind: 'service', asset: as.id, text: as.name + ' service overdue', sub: Math.abs(d) + ' days overdue' });
      else if (d != null && d <= 14) alerts.push({ level: 'warn', kind: 'service', asset: as.id, text: as.name + ' service due', sub: 'in ' + d + ' days · ' + fmtDate(as.nextService) });
      ['fuel', 'battery', 'water'].forEach(function (k) {
        if (as[k] != null && as[k] !== '' && +as[k] < 25) {
          alerts.push({ level: +as[k] < 10 ? 'crit' : 'warn', kind: 'level', asset: as.id, text: as.name + ' ' + k + ' low', sub: as[k] + '% remaining' });
        }
      });
    });

    // Idle equipment needing service
    state.equipment.forEach(function (e) {
      if (e.condition === 'damaged') alerts.push({ level: 'warn', kind: 'equipment', text: e.name + ' damaged', sub: 'At ' + assetName(e.assetId) });
    });

    alerts = alerts.concat(weatherAlerts());

    // De-duplicate identical alerts
    var seen = {};
    alerts = alerts.filter(function (al) { var k = al.text + '|' + al.sub; if (seen[k]) return false; seen[k] = 1; return true; });
    alerts.sort(function (x, y) { return (x.level === 'crit' ? 0 : 1) - (y.level === 'crit' ? 0 : 1); });
    return alerts;
  }

  /** Equipment in a mission that is not currently on one of the mission's assets. */
  function transfersFor(m) {
    if (!m.assetIds.length) return [];
    var to = m.assetIds[0];
    return m.equipmentIds.map(function (id) { return byId(state.equipment, id); })
      .filter(function (e) { return e && m.assetIds.indexOf(e.assetId) < 0; })
      .map(function (e) { return { equipment: e, to: to }; });
  }

  function missionConflicts(m) {
    var out = [];
    activeMissions().forEach(function (o) {
      if (o.id === m.id || !overlaps(m, o)) return;
      var shared = m.assetIds.filter(function (id) { return o.assetIds.indexOf(id) >= 0; }).length +
        m.equipmentIds.filter(function (id) { return o.equipmentIds.indexOf(id) >= 0; }).length;
      if (shared) out.push(o);
    });
    return out;
  }

  // ---------------------------------------------------------------- widgets
  function gauge(label, value) {
    if (value == null || value === '') return '';
    var v = Math.max(0, Math.min(100, +value));
    var r = 26, c = 2 * Math.PI * r, arc = c * 0.75;
    var color = v < 10 ? 'var(--crit)' : v < 25 ? 'var(--warn)' : 'var(--primary)';
    return '<div class="gauge"><svg viewBox="0 0 64 64">' +
      '<circle class="g-track" cx="32" cy="32" r="' + r + '" fill="none" stroke-width="5" stroke-dasharray="' + arc + ' ' + c + '" transform="rotate(135 32 32)"/>' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" ' +
      'stroke-dasharray="' + (arc * v / 100) + ' ' + c + '" transform="rotate(135 32 32)" style="filter:drop-shadow(0 0 3px ' + color + ')"/>' +
      '<text x="32" y="37" text-anchor="middle">' + Math.round(v) + '</text></svg>' + esc(label) + '</div>';
  }
  function badge(map, key) { var s = map[key] || { label: key, cls: 's-mute' }; return '<span class="badge ' + s.cls + '">' + esc(s.label) + '</span>'; }
  function tminus(m) {
    var ph = missionPhase(m);
    if (ph === 'underway') return '<div class="t-minus" style="color:var(--ok)">UNDERWAY</div>';
    if (ph === 'overdue') return '<div class="t-minus" style="color:var(--warn)">ENDED</div>';
    if (ph === 'complete') return '<div class="t-minus" style="color:var(--muted)">DONE</div>';
    if (ph === 'cancelled') return '<div class="t-minus" style="color:var(--muted)">SCRUBBED</div>';
    return '<div class="t-minus">T-' + daysUntil(m.start) + 'D</div>';
  }
  function checklistProgress(m) {
    if (!m.checklist || !m.checklist.length) return 0;
    return Math.round(100 * m.checklist.filter(function (c) { return c.done; }).length / m.checklist.length);
  }
  function alertHtml(al) {
    var cls = al.level === 'crit' ? 's-crit' : 's-warn';
    var target = al.missions ? ' data-action="open-mission" data-id="' + al.missions[0] + '" style="cursor:pointer"' :
      al.asset ? ' data-action="edit-asset" data-id="' + al.asset + '" style="cursor:pointer"' : '';
    return '<div class="alert ' + cls + '"' + target + '><span class="alert-icon">' + (al.level === 'crit' ? '!!' : '!') + '</span>' +
      '<div><div class="a-text">' + esc(al.text) + '</div><div class="a-sub">' + esc(al.sub || '') + '</div></div></div>';
  }

  // Tactical map: equirectangular projection over a sci-fi grid, auto-zoomed to the points.
  function trackingMap(height) {
    var pts = [];
    state.assets.forEach(function (a) { if (isFinite(parseFloat(a.lat)) && isFinite(parseFloat(a.lon))) pts.push({ lat: +a.lat, lon: +a.lon, label: a.name, kind: 'asset' }); });
    activeMissions().forEach(function (m) { if (isFinite(parseFloat(m.lat)) && isFinite(parseFloat(m.lon))) pts.push({ lat: +m.lat, lon: +m.lon, label: '◇ ' + m.name, kind: 'mission' }); });
    var W = 600, H = height || 300;
    if (!pts.length) return '<div class="empty">No coordinates on file. Add lat/lon to assets or missions.</div>';
    var minLat = Math.min.apply(null, pts.map(function (p) { return p.lat; })), maxLat = Math.max.apply(null, pts.map(function (p) { return p.lat; }));
    var minLon = Math.min.apply(null, pts.map(function (p) { return p.lon; })), maxLon = Math.max.apply(null, pts.map(function (p) { return p.lon; }));
    var padLat = Math.max(3, (maxLat - minLat) * 0.18), padLon = Math.max(4, (maxLon - minLon) * 0.18);
    minLat -= padLat; maxLat += padLat; minLon -= padLon; maxLon += padLon;
    // keep aspect ratio
    var spanLon = maxLon - minLon, spanLat = maxLat - minLat;
    var want = spanLon * H / W;
    if (spanLat < want) { var e1 = (want - spanLat) / 2; minLat -= e1; maxLat += e1; } else { var want2 = spanLat * W / H, e2 = (want2 - spanLon) / 2; minLon -= e2; maxLon += e2; }
    function x(lon) { return (lon - minLon) / (maxLon - minLon) * W; }
    function y(lat) { return (maxLat - lat) / (maxLat - minLat) * H; }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
    var step = niceStep(maxLon - minLon);
    for (var lo = Math.ceil(minLon / step) * step; lo <= maxLon; lo += step) {
      svg += '<line class="grid-line" x1="' + x(lo) + '" y1="0" x2="' + x(lo) + '" y2="' + H + '"/><text x="' + (x(lo) + 3) + '" y="' + (H - 4) + '" style="fill:var(--muted)">' + Math.round(lo) + '°</text>';
    }
    for (var la = Math.ceil(minLat / step) * step; la <= maxLat; la += step) {
      svg += '<line class="grid-line" x1="0" y1="' + y(la) + '" x2="' + W + '" y2="' + y(la) + '"/><text x="3" y="' + (y(la) - 3) + '" style="fill:var(--muted)">' + Math.round(la) + '°</text>';
    }
    // route lines mission -> asset
    activeMissions().forEach(function (m) {
      var as = byId(state.assets, m.assetIds[0]);
      if (!as || !isFinite(parseFloat(m.lat)) || !isFinite(parseFloat(as.lat))) return;
      svg += '<line x1="' + x(+as.lon) + '" y1="' + y(+as.lat) + '" x2="' + x(+m.lon) + '" y2="' + y(+m.lat) + '" stroke="var(--accent)" stroke-dasharray="4 4" stroke-width="1" opacity=".7"/>';
    });
    var placed = [];
    pts.forEach(function (p) {
      var px = x(p.lon), py = y(p.lat), ty = py - 8;
      placed.forEach(function (q) { if (Math.abs(q.x - px) < 90 && Math.abs(q.y - ty) < 11) ty = q.y + 11; });
      placed.push({ x: px, y: ty });
      svg += '<circle class="blip-ring" cx="' + px + '" cy="' + py + '" r="6" stroke="' + (p.kind === 'mission' ? 'var(--accent)' : 'var(--primary)') + '"/>';
      svg += '<circle class="blip ' + p.kind + '" cx="' + px + '" cy="' + py + '" r="3"/>';
      svg += '<text x="' + (px + 7) + '" y="' + ty + '">' + esc(p.label) + '</text>';
    });
    return svg + '</svg>';
  }
  function niceStep(span) { return span > 120 ? 30 : span > 60 ? 15 : span > 25 ? 10 : span > 10 ? 5 : 2; }

  // ---------------------------------------------------------------- weather (Open-Meteo, no API key)
  var WX_KEY = STORAGE_KEY + '.wx';
  var WX_TTL = 60 * 60000;            // refetch after 1 hour
  var FORECAST_DAYS = 16;             // Open-Meteo forecast horizon
  var WX_CODES = [
    [[0], '☀', 'Clear'], [[1], '🌤', 'Mostly clear'], [[2], '⛅', 'Partly cloudy'], [[3], '☁', 'Overcast'],
    [[45, 48], '🌫', 'Fog'], [[51, 53, 55, 56, 57], '🌦', 'Drizzle'], [[61, 63, 65, 66, 67], '🌧', 'Rain'],
    [[71, 73, 75, 77], '❄', 'Snow'], [[80, 81, 82], '🌦', 'Showers'], [[85, 86], '🌨', 'Snow showers'], [[95, 96, 99], '⛈', 'Thunderstorm']
  ];
  var wx = loadWx();
  var wxInflight = false;

  function loadWx() {
    try { var w = JSON.parse(localStorage.getItem(WX_KEY)); if (w && w.points) return w; } catch (e) { /* ignore */ }
    return { at: 0, points: {} };
  }
  function saveWx() { try { localStorage.setItem(WX_KEY, JSON.stringify(wx)); } catch (e) { /* ignore */ } }
  function wxCode(c) {
    for (var i = 0; i < WX_CODES.length; i++) if (WX_CODES[i][0].indexOf(c) >= 0) return { icon: WX_CODES[i][1], label: WX_CODES[i][2] };
    return { icon: '·', label: 'Unknown' };
  }
  function hasCoords(o) {
    return o && o.lat !== '' && o.lat != null && o.lon !== '' && o.lon != null && isFinite(+o.lat) && isFinite(+o.lon);
  }
  function ptKey(lat, lon) { return (+lat).toFixed(2) + ',' + (+lon).toFixed(2); }
  function isMarineMission(m) {
    return m.assetIds.some(function (id) { var a = byId(state.assets, id); return a && a.type === 'yacht'; });
  }
  function toArr(x) { return Array.isArray(x) ? x : [x]; }
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  /** Points we need weather for: every asset and every active mission target. */
  function wxPoints() {
    var pts = {}, marine = {};
    state.assets.forEach(function (a) {
      if (!hasCoords(a)) return;
      var k = ptKey(a.lat, a.lon); pts[k] = [+a.lat, +a.lon];
      if (a.type === 'yacht') marine[k] = pts[k];
    });
    activeMissions().forEach(function (m) {
      if (!hasCoords(m)) return;
      var k = ptKey(m.lat, m.lon); pts[k] = [+m.lat, +m.lon];
      if (isMarineMission(m)) marine[k] = pts[k];
    });
    return { pts: pts, marine: marine };
  }

  function setWxStatus(st, text) {
    var pill = $('#wxPill'); if (!pill) return;
    pill.className = 'wx-pill ' + st;
    $('#wxText').textContent = text;
  }

  function fetchWeather(force) {
    if (wxInflight) return;
    var p = wxPoints(), keys = Object.keys(p.pts);
    if (!keys.length) return;
    var missing = keys.some(function (k) { return !wx.points[k]; });
    if (!force && !missing && Date.now() - wx.at < WX_TTL) return;
    wxInflight = true;
    setWxStatus('sync', 'WX SYNC…');
    function coords(list) {
      return 'latitude=' + list.map(function (k) { return p.pts[k][0]; }).join(',') +
        '&longitude=' + list.map(function (k) { return p.pts[k][1]; }).join(',');
    }
    var fUrl = 'https://api.open-meteo.com/v1/forecast?' + coords(keys) +
      '&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max' +
      '&timezone=auto&forecast_days=' + FORECAST_DAYS;
    var mKeys = Object.keys(p.marine);
    var mUrl = mKeys.length ? 'https://marine-api.open-meteo.com/v1/marine?' + coords(mKeys) +
      '&daily=wave_height_max&timezone=auto&forecast_days=' + FORECAST_DAYS : null;

    Promise.all([getJson(fUrl), mUrl ? getJson(mUrl).catch(function () { return null; }) : null]).then(function (res) {
      var points = {}, f = toArr(res[0]);
      keys.forEach(function (k, i) {
        var r = f[i]; if (!r || !r.daily) return;
        var d = r.daily, days = {};
        (d.time || []).forEach(function (t, j) {
          days[t] = { code: d.weather_code[j], tmax: d.temperature_2m_max[j], tmin: d.temperature_2m_min[j],
            precip: d.precipitation_sum[j], pop: d.precipitation_probability_max[j], wind: d.wind_speed_10m_max[j], gust: d.wind_gusts_10m_max[j], wave: null };
        });
        var c = r.current;
        points[k] = { days: days, current: c ? { temp: c.temperature_2m, code: c.weather_code, wind: c.wind_speed_10m, gust: c.wind_gusts_10m } : null };
      });
      if (res[1]) toArr(res[1]).forEach(function (r, i) {
        var k = mKeys[i]; if (!r || !r.daily || !points[k]) return;
        r.daily.time.forEach(function (t, j) { if (points[k].days[t]) points[k].days[t].wave = r.daily.wave_height_max[j]; });
      });
      wx = { at: Date.now(), points: points };
      saveWx();
      setWxStatus('ok', 'WX ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }));
    }).catch(function () {
      setWxStatus('err', wx.at ? 'WX CACHED' : 'WX OFFLINE');
    }).then(function () {
      wxInflight = false;
      refreshWeatherDom();
    });
  }

  /** Forecast for the mission's dates at its target. */
  function missionForecast(m) {
    if (!hasCoords(m)) return { state: 'nocoords' };
    var p = wx.points[ptKey(m.lat, m.lon)];
    if (!p) return { state: 'pending' };
    var dates = Object.keys(p.days).sort();
    var days = dates.filter(function (d) { return d >= m.start && d <= m.end; }).map(function (d) {
      var o = Object.assign({ date: d }, p.days[d]); return o;
    });
    if (days.length) return { state: 'ok', days: days, partial: m.end > dates[dates.length - 1], marine: isMarineMission(m) };
    if (dates.length && m.start > dates[dates.length - 1]) {
      return { state: 'later', from: iso(new Date(parse(m.start).getTime() - (FORECAST_DAYS - 1) * DAY)) };
    }
    return { state: 'none' };
  }

  function weatherAlerts() {
    var out = [];
    activeMissions().forEach(function (m) {
      var f = missionForecast(m);
      if (f.state !== 'ok') return;
      function worst(key) {
        var best = null;
        f.days.forEach(function (d) { if (d[key] != null && (!best || d[key] > best[key])) best = d; });
        return best;
      }
      var g = worst('gust');
      if (g && g.gust >= 50) out.push({ level: g.gust >= 75 ? 'crit' : 'warn', kind: 'weather', missions: [m.id],
        text: 'Wind gusts ' + Math.round(g.gust) + ' km/h forecast', sub: '"' + m.name + '" · ' + fmtShort(g.date) });
      if (f.marine) {
        var w = worst('wave');
        if (w && w.wave >= 2.5) out.push({ level: w.wave >= 4 ? 'crit' : 'warn', kind: 'weather', missions: [m.id],
          text: 'Waves ' + w.wave.toFixed(1) + ' m forecast', sub: '"' + m.name + '" · ' + fmtShort(w.date) });
      }
      var r = worst('precip');
      if (r && r.precip >= 20) out.push({ level: 'warn', kind: 'weather', missions: [m.id],
        text: 'Heavy precipitation ' + Math.round(r.precip) + ' mm', sub: '"' + m.name + '" · ' + fmtShort(r.date) });
      var storm = f.days.filter(function (d) { return d.code >= 95; })[0];
      if (storm) out.push({ level: 'warn', kind: 'weather', missions: [m.id], text: 'Thunderstorms forecast', sub: '"' + m.name + '" · ' + fmtShort(storm.date) });
      var hot = worst('tmax'), cold = f.days.reduce(function (a, d) { return d.tmin != null && (!a || d.tmin < a.tmin) ? d : a; }, null);
      if (hot && hot.tmax >= 40) out.push({ level: 'warn', kind: 'weather', missions: [m.id], text: 'Extreme heat ' + Math.round(hot.tmax) + '°C', sub: '"' + m.name + '" · ' + fmtShort(hot.date) });
      if (cold && cold.tmin <= -15) out.push({ level: 'warn', kind: 'weather', missions: [m.id], text: 'Extreme cold ' + Math.round(cold.tmin) + '°C', sub: '"' + m.name + '" · ' + fmtShort(cold.date) });
    });
    return out;
  }

  function wxMissionHtml(m) {
    var f = missionForecast(m);
    var head = '<div class="panel-head" style="margin-bottom:6px"><h3>Target weather</h3><span class="spacer"></span>' +
      '<span class="muted" style="font-size:11px">Open-Meteo</span></div>';
    if (f.state === 'nocoords') return head + '<div class="wx-note">Set target coordinates (Edit → Locate) to get a forecast.</div>';
    if (f.state === 'pending') return head + '<div class="wx-note">Awaiting weather link…</div>';
    if (f.state === 'later') return head + '<div class="wx-note">Beyond the ' + FORECAST_DAYS + '-day forecast horizon. Forecast available from ' + fmtDate(f.from) + '.</div>';
    if (f.state === 'none') return head + '<div class="wx-note">No forecast for these dates.</div>';
    return head + '<div class="wx-days">' + f.days.map(function (d) {
      var c = wxCode(d.code);
      var gustCls = d.gust >= 75 ? 's-crit' : d.gust >= 50 ? 's-warn' : '';
      var waveCls = d.wave >= 4 ? 's-crit' : d.wave >= 2.5 ? 's-warn' : '';
      return '<div class="wx-day" title="' + esc(c.label) + '"><div class="wx-date">' + esc(fmtShort(d.date)) + '</div>' +
        '<div class="wx-icon">' + c.icon + '</div>' +
        '<div class="wx-temp">' + Math.round(d.tmax) + '° <span class="muted">' + Math.round(d.tmin) + '°</span></div>' +
        '<div class="wx-line ' + gustCls + '">💨 ' + Math.round(d.gust) + '</div>' +
        (f.marine && d.wave != null ? '<div class="wx-line ' + waveCls + '">🌊 ' + d.wave.toFixed(1) + 'm</div>' : '') +
        '<div class="wx-line">💧 ' + (d.precip != null ? (+d.precip).toFixed(d.precip < 10 ? 1 : 0) : '–') + '</div></div>';
    }).join('') + '</div>' + (f.partial ? '<div class="wx-note">Remaining days are beyond the forecast horizon.</div>' : '') +
      '<div class="wx-note">Wind gusts km/h · precipitation mm' + (f.marine ? ' · max wave height' : '') + '</div>';
  }

  function wxAssetHtml(a) {
    if (!hasCoords(a)) return '';
    var p = wx.points[ptKey(a.lat, a.lon)];
    if (!p || !p.current) return '<span class="muted">—</span>';
    var c = p.current, code = wxCode(c.code), todayW = p.days[iso(today())];
    return code.icon + ' ' + Math.round(c.temp) + '°C · ' + esc(code.label) + ' · wind ' + Math.round(c.wind) + ' km/h (gust ' + Math.round(c.gust) + ')' +
      (a.type === 'yacht' && todayW && todayW.wave != null ? ' · waves ' + todayW.wave.toFixed(1) + ' m' : '');
  }

  function refreshWeatherDom() {
    $$('[data-wx-mission]').forEach(function (el) { var m = byId(state.missions, el.getAttribute('data-wx-mission')); if (m) el.innerHTML = wxMissionHtml(m); });
    $$('[data-wx-asset]').forEach(function (el) { var a = byId(state.assets, el.getAttribute('data-wx-asset')); if (a) el.innerHTML = wxAssetHtml(a); });
    var al = $('#alertsPanel'); if (al) al.innerHTML = alertsPanelHtml();
  }

  // ---------------------------------------------------------------- maps (Leaflet, vendored)
  var maps = [];
  var pickMap = null;

  function baseLayers() {
    var attrOsm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    return {
      'Tactical': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19, attribution: attrOsm + ' &copy; <a href="https://carto.com/attributions">CARTO</a>', className: 'tiles-tactical' }),
      'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagery &copy; Esri' }),
      'Street': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: attrOsm })
    };
  }
  function seamarks() {
    return L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>' });
  }
  function hudIcon(kind, glyph) {
    return L.divIcon({ className: 'hud-marker ' + kind, iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8],
      html: '<span class="hm-ring"></span><span class="hm-dot">' + (glyph || '') + '</span>' });
  }
  function assetPopup(a) {
    var aboard = state.equipment.filter(function (e) { return e.assetId === a.id; }).length;
    var w = wxAssetHtml(a);
    return '<div class="map-pop"><div class="mp-title">' + esc(a.name) + '</div>' +
      '<div class="mp-sub">' + esc(ASSET_TYPES[a.type] || a.type) + ' · ' + esc(ASSET_STATUS[a.status] ? ASSET_STATUS[a.status].label : a.status) + '</div>' +
      '<div>' + esc(a.location || '') + '</div>' + (w ? '<div class="mp-wx">' + w + '</div>' : '') +
      '<div class="mp-sub">' + aboard + ' equipment item' + (aboard === 1 ? '' : 's') + ' aboard</div>' +
      '<div class="card-actions" style="margin-top:8px"><button class="btn sm" data-action="goto-asset" data-id="' + a.id + '">Open</button>' +
      '<button class="btn sm accent" data-action="new-mission" data-asset="' + a.id + '">Plan mission</button></div></div>';
  }
  function missionPopup(m) {
    var f = missionForecast(m), wxLine = '';
    if (f.state === 'ok') {
      var maxG = Math.max.apply(null, f.days.map(function (d) { return d.gust || 0; }));
      var hi = Math.max.apply(null, f.days.map(function (d) { return d.tmax; })), lo = Math.min.apply(null, f.days.map(function (d) { return d.tmin; }));
      var waves = f.marine ? Math.max.apply(null, f.days.map(function (d) { return d.wave || 0; })) : null;
      wxLine = f.days.slice(0, 7).map(function (d) { return wxCode(d.code).icon; }).join(' ') + '<br>' + Math.round(lo) + '…' + Math.round(hi) + '°C · gusts ≤ ' + Math.round(maxG) + ' km/h' + (waves ? ' · waves ≤ ' + waves.toFixed(1) + ' m' : '');
    } else if (f.state === 'later') wxLine = 'Forecast from ' + fmtShort(f.from);
    return '<div class="map-pop"><div class="mp-title">◇ ' + esc(m.name) + '</div>' +
      '<div class="mp-sub">' + fmtShort(m.start) + ' – ' + fmtShort(m.end) + ' · ' + esc(m.assetIds.map(assetName).join(', ')) + '</div>' +
      '<div>' + esc(m.destination || '') + '</div>' + (wxLine ? '<div class="mp-wx">' + wxLine + '</div>' : '') +
      '<div class="card-actions" style="margin-top:8px"><button class="btn sm" data-action="open-mission" data-id="' + m.id + '">Open mission</button></div></div>';
  }

  function buildMap(el, mode) {
    if (!window.L) { el.classList.add('tracking'); el.innerHTML = trackingMap(mode === 'full' ? 520 : 320); return; }
    var full = mode === 'full';
    var map = L.map(el, { worldCopyJump: true, zoomControl: true, scrollWheelZoom: full });
    var base = baseLayers();
    base.Tactical.addTo(map);
    var assetsL = L.layerGroup().addTo(map), missionsL = L.layerGroup().addTo(map), routesL = L.layerGroup().addTo(map);
    var bounds = [];
    state.assets.forEach(function (a) {
      if (!hasCoords(a)) return;
      var ll = [+a.lat, +a.lon]; bounds.push(ll);
      L.marker(ll, { icon: hudIcon('asset s-' + a.status), title: a.name })
        .bindTooltip(esc(a.name), { permanent: full, direction: 'right', offset: [10, 0], className: 'hud-tip' })
        .bindPopup(function () { return assetPopup(a); }, { className: 'hud-popup', maxWidth: 280 })
        .addTo(assetsL);
    });
    activeMissions().forEach(function (m) {
      if (!hasCoords(m)) return;
      var ll = [+m.lat, +m.lon]; bounds.push(ll);
      var conflict = missionConflicts(m).length > 0;
      L.marker(ll, { icon: hudIcon('mission' + (conflict ? ' conflict' : '')), title: m.name })
        .bindTooltip('◇ ' + esc(m.name), { permanent: full, direction: 'right', offset: [10, 0], className: 'hud-tip mission' })
        .bindPopup(function () { return missionPopup(m); }, { className: 'hud-popup', maxWidth: 300 })
        .addTo(missionsL);
      m.assetIds.forEach(function (id) {
        var a = byId(state.assets, id);
        if (!hasCoords(a)) return;
        L.polyline([[+a.lat, +a.lon], ll], { color: conflict ? '#ff3b5c' : '#ffb000', weight: 1.5, dashArray: '6 6', opacity: .8, className: 'route-line' })
          .bindTooltip(esc(a.name) + ' → ' + esc(m.name), { sticky: true, className: 'hud-tip' }).addTo(routesL);
      });
    });
    L.control.layers(base, { 'Assets': assetsL, 'Missions': missionsL, 'Routes': routesL, 'Sea marks': seamarks() }, { collapsed: !full }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
    else map.setView([45, 10], 4);
    maps.push(map);
  }
  function destroyMaps() { maps.forEach(function (m) { m.remove(); }); maps = []; }
  function mountMaps() { $$('[data-map]').forEach(function (el) { buildMap(el, el.getAttribute('data-map')); }); }

  // ---------------------------------------------------------------- geocoding (Open-Meteo)
  function geocode(text) {
    var raw = String(text || '').split(/→|->|—/).pop().trim();
    if (!raw) return Promise.reject(new Error('Nothing to search for'));
    var parts = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var candidates = [raw].concat(parts, parts.length ? parts[0].split(/\s+/).reverse() : []);
    var seen = {};
    candidates = candidates.filter(function (c) { if (c.length < 2 || seen[c]) return false; seen[c] = 1; return true; });
    var i = 0;
    function next() {
      if (i >= candidates.length) return Promise.reject(new Error('No match for "' + raw + '"'));
      var q = candidates[i++];
      return getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&name=' + encodeURIComponent(q)).then(function (r) {
        if (r && r.results && r.results.length) {
          var g = r.results[0];
          return { lat: g.latitude, lon: g.longitude, label: [g.name, g.admin1, g.country].filter(Boolean).join(', ') };
        }
        return next();
      });
    }
    return next();
  }

  // ---------------------------------------------------------------- views
  var views = {};

  views.bridge = function () {
    var alerts = analyse();
    var crit = alerts.filter(function (a) { return a.level === 'crit'; }).length;
    var ms = activeMissions().slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var operational = state.assets.filter(function (a) { return a.status === 'operational' || a.status === 'deployed'; }).length;
    var readiness = state.assets.length ? Math.round(100 * operational / state.assets.length) : 0;
    var eqOk = state.equipment.filter(function (e) { return e.condition === 'ok'; }).length;
    var underway = ms.filter(function (m) { return missionPhase(m) === 'underway'; }).length;

    var html = '<div class="grid g-stats" style="margin-bottom:16px">' +
      stat('Assets online', operational + '/' + state.assets.length, readiness + '% fleet readiness', readiness < 60 ? 'warn' : 'ok') +
      stat('Equipment', state.equipment.length, eqOk + ' nominal · ' + (state.equipment.length - eqOk) + ' flagged', state.equipment.length - eqOk ? 'warn' : '') +
      stat('Missions', ms.length, underway + ' underway', '') +
      stat('Next launch', ms.length ? 'T-' + Math.max(0, daysUntil(ms[0].start)) + 'D' : '—', ms.length ? ms[0].name : 'No missions planned', '') +
      stat('Alerts', alerts.length, crit + ' critical', crit ? 'crit' : alerts.length ? 'warn' : 'ok') +
      '</div>';

    html += '<div class="grid g-bridge">';
    html += '<div class="grid" style="align-content:start">';
    html += '<section class="panel"><div class="panel-head"><h2>Tactical overview</h2><span class="spacer"></span><span class="muted" style="font-size:12px">● assets &nbsp; <span style="color:var(--accent)">●</span> mission targets</span></div><div class="map-host" data-map="mini"></div></section>';
    html += '<section class="panel"><div class="panel-head"><h2>Mission queue</h2><span class="spacer"></span><button class="btn sm" data-action="new-mission">+ New mission</button></div><div class="list">' +
      (ms.length ? ms.slice(0, 6).map(missionRow).join('') : '<div class="empty">No missions in the queue.</div>') + '</div></section>';
    html += '</div>';

    html += '<div class="grid" style="align-content:start">';
    html += '<section class="panel" id="alertsPanel">' + alertsPanelHtml() + '</section>';
    html += '<section class="panel"><div class="panel-head"><h2>Fleet status</h2></div><div class="list">' +
      state.assets.map(function (a) {
        return '<div class="mission-row" data-action="goto-asset" data-id="' + a.id + '"><div class="asset-icon" style="width:36px;height:36px">' + (ICONS[a.type] || ICONS.other) + '</div>' +
          '<div style="flex:1;min-width:0"><div>' + esc(a.name) + '</div><div class="asset-meta">' + esc(a.location || '—') + '</div></div>' + badge(ASSET_STATUS, a.status) + '</div>';
      }).join('') + '</div></section>';
    html += '</div></div>';
    return html;
  };
  function alertsPanelHtml() {
    var alerts = analyse(), crit = alerts.filter(function (a) { return a.level === 'crit'; }).length;
    return '<div class="panel-head"><h2>Logistics alerts</h2><span class="spacer"></span>' +
      (crit ? '<span class="badge s-crit">' + crit + ' critical</span>' : '<span class="badge s-ok">nominal</span>') + '</div><div class="list">' +
      (alerts.length ? alerts.slice(0, 12).map(alertHtml).join('') + (alerts.length > 12 ? '<div class="muted">+' + (alerts.length - 12) + ' more</div>' : '') : '<div class="empty">All systems nominal.</div>') +
      '</div>';
  }
  function stat(label, val, sub, cls) {
    return '<div class="panel stat"><div class="stat-label">' + esc(label) + '</div><div class="stat-val ' + (cls || '') + '">' + esc(val) + '</div><div class="stat-sub">' + esc(sub) + '</div></div>';
  }
  function missionRow(m) {
    var conf = missionConflicts(m).length, tr = transfersFor(m).length;
    return '<div class="mission-row" data-action="open-mission" data-id="' + m.id + '">' + tminus(m) +
      '<div style="flex:1;min-width:0"><div>' + esc(m.name) + '</div><div class="asset-meta">' + fmtShort(m.start) + ' – ' + fmtShort(m.end) + ' · ' +
      esc(m.assetIds.map(assetName).join(', ') || 'no asset') + '</div><div class="progress" style="margin-top:6px"><div style="width:' + checklistProgress(m) + '%"></div></div></div>' +
      (conf ? '<span class="badge s-crit">conflict</span>' : tr ? '<span class="badge s-warn">' + tr + ' transfer' + (tr > 1 ? 's' : '') + '</span>' : '<span class="badge s-ok">go</span>') + '</div>';
  }

  views.assets = function () {
    var q = ui.assetFilter.toLowerCase();
    var list = state.assets.filter(function (a) { return !q || (a.name + ' ' + a.location + ' ' + a.type).toLowerCase().indexOf(q) >= 0; });
    var html = '<div class="section-head"><h2>Assets</h2><span class="spacer"></span><div class="filters">' +
      '<input type="search" placeholder="Filter assets…" data-bind="assetFilter" value="' + esc(ui.assetFilter) + '">' +
      '<button class="btn primary" data-action="new-asset">+ Commission asset</button></div></div>';
    html += '<div class="grid g-cards">' + (list.length ? list.map(assetCard).join('') : '<div class="empty">No assets match.</div>') + '</div>';
    return html;
  };
  function assetCard(a) {
    var onboard = state.equipment.filter(function (e) { return e.assetId === a.id; });
    var next = activeMissions().filter(function (m) { return m.assetIds.indexOf(a.id) >= 0; }).sort(function (x, y) { return x.start < y.start ? -1 : 1; })[0];
    var sd = daysUntil(a.nextService);
    var labels = a.type === 'property' ? ['Heating', 'Storage', 'Water'] : ['Fuel', 'Battery', 'Water'];
    var gauges = gauge(labels[0], a.fuel) + gauge(labels[1], a.battery) + gauge(labels[2], a.water);
    return '<section class="panel asset-card" id="asset-' + a.id + '">' +
      '<div class="asset-top"><div class="asset-icon">' + (ICONS[a.type] || ICONS.other) + '</div><div style="flex:1;min-width:0">' +
      '<div class="asset-name">' + esc(a.name) + '</div><div class="asset-meta">' + esc(ASSET_TYPES[a.type] || a.type) + (a.registration ? ' · ' + esc(a.registration) : '') + '</div>' +
      '<div style="margin-top:4px">' + badge(ASSET_STATUS, a.status) + '</div></div></div>' +
      (gauges ? '<div class="gauges">' + gauges + '</div>' : '') +
      '<dl class="kv"><dt>Location</dt><dd>' + esc(a.location || '—') + '</dd>' +
      (hasCoords(a) ? '<dt>Weather</dt><dd data-wx-asset="' + a.id + '">' + wxAssetHtml(a) + '</dd>' : '') +
      '<dt>Service</dt><dd class="' + (sd != null && sd < 0 ? 's-crit' : sd != null && sd <= 14 ? 's-warn' : '') + '">' + fmtDate(a.nextService) + (sd != null ? ' (' + (sd < 0 ? Math.abs(sd) + 'd overdue' : 'in ' + sd + 'd') + ')' : '') + '</dd>' +
      '<dt>Next mission</dt><dd>' + (next ? '<a href="#" data-action="open-mission" data-id="' + next.id + '" style="color:var(--accent)">' + esc(next.name) + '</a> · ' + fmtShort(next.start) : '—') + '</dd>' +
      '<dt>Aboard</dt><dd>' + (onboard.length ? onboard.map(function (e) { return '<span class="chip">' + esc(e.name) + (e.qty > 1 ? ' ×' + e.qty : '') + '</span>'; }).join('') : '<span class="muted">nothing</span>') + '</dd></dl>' +
      (a.notes ? '<div class="muted" style="font-size:13px">' + esc(a.notes) + '</div>' : '') +
      '<div class="card-actions"><button class="btn sm" data-action="edit-asset" data-id="' + a.id + '">Configure</button>' +
      '<button class="btn sm" data-action="goto-equipment" data-id="' + a.id + '">Manifest</button>' +
      '<button class="btn sm accent" data-action="new-mission" data-asset="' + a.id + '">Plan mission</button></div></section>';
  }

  views.equipment = function () {
    var q = ui.eqFilter.toLowerCase();
    var list = state.equipment.filter(function (e) {
      return (!ui.eqAsset || e.assetId === ui.eqAsset) && (!q || (e.name + ' ' + e.category + ' ' + e.notes).toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var html = '<div class="section-head"><h2>Equipment manifest</h2><span class="spacer"></span><div class="filters">' +
      '<input type="search" placeholder="Search equipment…" data-bind="eqFilter" value="' + esc(ui.eqFilter) + '">' +
      '<select data-bind="eqAsset"><option value="">All locations</option>' + state.assets.map(function (a) {
        return '<option value="' + a.id + '"' + (ui.eqAsset === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn accent" data-action="bulk-transfer">Transfer…</button>' +
      '<button class="btn primary" data-action="new-equipment">+ Add equipment</button></div></div>';
    html += '<section class="panel table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Location</th><th>Condition</th><th>Next use</th><th>Last check</th><th></th></tr></thead><tbody>';
    html += list.length ? list.map(function (e) {
      var use = activeMissions().filter(function (m) { return m.equipmentIds.indexOf(e.id) >= 0; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; })[0];
      return '<tr><td>' + esc(e.name) + (e.notes ? '<div class="muted" style="font-size:12px">' + esc(e.notes) + '</div>' : '') + '</td><td>' + esc(e.category) + '</td><td class="num">' + esc(e.qty) + '</td>' +
        '<td>' + esc(assetName(e.assetId)) + '</td><td>' + badge(EQ_CONDITION, e.condition) + '</td>' +
        '<td>' + (use ? '<a href="#" data-action="open-mission" data-id="' + use.id + '" style="color:var(--accent)">' + esc(use.name) + '</a>' : '<span class="muted">—</span>') + '</td>' +
        '<td>' + fmtShort(e.lastCheck) + '</td>' +
        '<td style="white-space:nowrap"><button class="btn sm" data-action="transfer" data-id="' + e.id + '">Move</button> <button class="btn sm ghost" data-action="edit-equipment" data-id="' + e.id + '">Edit</button></td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty">No equipment found.</td></tr>';
    html += '</tbody></table></section>';
    return html;
  };

  views.missions = function () {
    var f = ui.missionFilter;
    var list = state.missions.filter(function (m) {
      var ph = missionPhase(m);
      if (f === 'upcoming') return ph === 'upcoming' || ph === 'underway' || ph === 'overdue';
      if (f === 'archive') return ph === 'complete' || ph === 'cancelled';
      return true;
    }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    var html = '<div class="section-head"><h2>Missions &amp; logistics</h2><span class="spacer"></span><div class="filters">' +
      '<select data-bind="missionFilter"><option value="upcoming"' + (f === 'upcoming' ? ' selected' : '') + '>Active &amp; upcoming</option><option value="archive"' + (f === 'archive' ? ' selected' : '') + '>Archive</option><option value="all"' + (f === 'all' ? ' selected' : '') + '>All</option></select>' +
      '<button class="btn primary" data-action="new-mission">+ New mission</button></div></div>';
    html += '<div class="grid g-cards">' + (list.length ? list.map(missionCard).join('') : '<div class="empty">No missions.</div>') + '</div>';
    return html;
  };
  function missionCard(m) {
    var conflicts = missionConflicts(m), transfers = transfersFor(m);
    var eqs = m.equipmentIds.map(function (id) { return byId(state.equipment, id); }).filter(Boolean);
    var html = '<section class="panel asset-card" id="mission-' + m.id + '">' +
      '<div class="panel-head" style="margin:0">' + tminus(m) + '<div style="flex:1;min-width:0"><div class="asset-name">' + esc(m.name) + '</div>' +
      '<div class="asset-meta">' + fmtDate(m.start) + ' → ' + fmtDate(m.end) + ' · ' + (daysBetween(m.start, m.end) + 1) + ' days</div></div>' + badge(MISSION_STATUS, m.status) + '</div>' +
      '<dl class="kv"><dt>Assets</dt><dd>' + (m.assetIds.length ? m.assetIds.map(function (id) { return '<span class="chip">' + esc(assetName(id)) + '</span>'; }).join('') : '<span class="s-warn">none assigned</span>') + '</dd>' +
      '<dt>Route</dt><dd>' + esc(m.destination || '—') + '</dd><dt>Crew</dt><dd>' + esc(m.crew || '—') + '</dd>' +
      '<dt>Load-out</dt><dd>' + (eqs.length ? eqs.map(function (e) {
        var off = m.assetIds.length && m.assetIds.indexOf(e.assetId) < 0;
        return '<span class="chip"' + (off ? ' style="border-color:var(--warn);color:var(--warn)" title="Currently at ' + esc(assetName(e.assetId)) + '"' : '') + '>' + esc(e.name) + '</span>';
      }).join('') : '<span class="muted">none</span>') + '</dd></dl>';
    if (conflicts.length || transfers.length) {
      html += '<div class="list">' + conflicts.map(function (o) { return alertHtml({ level: 'crit', text: 'Resource conflict with "' + o.name + '"', sub: fmtShort(o.start) + ' – ' + fmtShort(o.end), missions: [o.id] }); }).join('') +
        transfers.map(function (t) { return alertHtml({ level: 'warn', text: 'Move ' + t.equipment.name, sub: assetName(t.equipment.assetId) + ' → ' + assetName(t.to) }); }).join('') + '</div>';
    }
    if (m.status !== 'complete' && m.status !== 'cancelled') html += '<div class="wx" data-wx-mission="' + m.id + '">' + wxMissionHtml(m) + '</div>';
    if (m.checklist && m.checklist.length) {
      html += '<div><div class="panel-head" style="margin-bottom:6px"><h3>Pre-launch checklist</h3><span class="spacer"></span><span class="muted">' + checklistProgress(m) + '%</span></div>' +
        '<div class="progress" style="margin-bottom:8px"><div style="width:' + checklistProgress(m) + '%"></div></div><ul class="checklist">' +
        m.checklist.map(function (c, i) {
          return '<li class="' + (c.done ? 'done' : '') + '"><input type="checkbox" data-action="toggle-check" data-id="' + m.id + '" data-idx="' + i + '"' + (c.done ? ' checked' : '') + '><span>' + esc(c.text) + '</span></li>';
        }).join('') + '</ul></div>';
    }
    if (m.notes) html += '<div class="muted" style="font-size:13px">' + esc(m.notes) + '</div>';
    html += '<div class="card-actions"><button class="btn sm" data-action="edit-mission" data-id="' + m.id + '">Edit</button>' +
      (transfers.length ? '<button class="btn sm accent" data-action="exec-transfers" data-id="' + m.id + '">Execute ' + transfers.length + ' transfer' + (transfers.length > 1 ? 's' : '') + '</button>' : '') +
      (m.status === 'planned' ? '<button class="btn sm" data-action="mission-status" data-status="active" data-id="' + m.id + '">Launch</button>' : '') +
      (m.status === 'active' ? '<button class="btn sm" data-action="mission-status" data-status="complete" data-id="' + m.id + '">Complete</button>' : '') +
      '<button class="btn sm ghost" data-action="duplicate-mission" data-id="' + m.id + '">Duplicate</button></div></section>';
    return html;
  }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }

  views.timeline = function () {
    var N = ui.timelineDays, start = today(), startIso = iso(start);
    var endIso = iso(new Date(start.getTime() + (N - 1) * DAY));
    var html = '<div class="section-head"><h2>Deployment timeline</h2><span class="spacer"></span><div class="filters">' +
      '<select data-bind="timelineDays">' + [30, 60, 90, 180].map(function (n) { return '<option value="' + n + '"' + (N === n ? ' selected' : '') + '>Next ' + n + ' days</option>'; }).join('') + '</select>' +
      '<button class="btn primary" data-action="new-mission">+ New mission</button></div></div>';
    html += '<section class="panel gantt"><div class="gantt-inner"><div class="g-row g-head"><div class="g-label muted">ASSET</div><div class="g-track">';
    var labelEvery = N > 90 ? 7 : N > 45 ? 2 : 1;
    for (var i = 0; i < N; i++) {
      var d = new Date(start.getTime() + i * DAY);
      var wk = d.getDay() === 0 || d.getDay() === 6;
      html += '<div class="g-day' + (wk ? ' weekend' : '') + (i === 0 ? ' today' : '') + '">' + (i % labelEvery === 0 ? d.getDate() + (d.getDate() === 1 || i === 0 ? '<br>' + d.toLocaleDateString(undefined, { month: 'short' }) : '') : '') + '</div>';
    }
    html += '</div></div>';
    var conflictIds = {};
    analyse().forEach(function (al) { if (al.kind === 'conflict') al.missions.forEach(function (id) { conflictIds[id] = 1; }); });
    function pos(s, e) {
      var a = Math.max(0, daysBetween(startIso, s)), b = Math.min(N - 1, daysBetween(startIso, e));
      return 'left:' + (a / N * 100) + '%;width:calc(' + ((b - a + 1) / N * 100) + '% - 2px)';
    }
    state.assets.forEach(function (as) {
      html += '<div class="g-row"><div class="g-label"><span style="color:var(--primary);width:18px;display:inline-block">' + (ICONS[as.type] || '') + '</span>' + esc(as.name) + '</div><div class="g-track">';
      state.missions.forEach(function (m) {
        if (m.status === 'cancelled' || m.assetIds.indexOf(as.id) < 0 || m.end < startIso || m.start > endIso) return;
        html += '<div class="g-bar' + (conflictIds[m.id] ? ' conflict' : '') + '" style="' + pos(m.start, m.end) + '" data-action="open-mission" data-id="' + m.id + '" title="' + esc(m.name) + '">' + esc(m.name) + '</div>';
      });
      if (as.nextService && as.nextService >= startIso && as.nextService <= endIso) {
        html += '<div class="g-bar service" style="' + pos(as.nextService, as.nextService) + ';min-width:22px" title="Service: ' + esc(fmtDate(as.nextService)) + '" data-action="edit-asset" data-id="' + as.id + '">⚙</div>';
      }
      html += '<div class="g-now" style="left:' + (0.5 / N * 100) + '%"></div></div></div>';
    });
    html += '</div></section><p class="muted" style="font-size:13px">Bars in red share an asset or equipment with an overlapping mission. ⚙ marks scheduled service.</p>';
    return html;
  };

  views.map = function () {
    return '<div class="section-head"><h2>Global tracking</h2><span class="spacer"></span><div class="filters">' +
      '<button class="btn" data-action="wx-refresh">Refresh weather</button>' +
      '<button class="btn primary" data-action="new-mission">+ New mission</button></div></div>' +
      '<section class="panel map-panel"><div class="map-host full" data-map="full"></div></section>' +
      '<p class="muted" style="font-size:13px">Click a marker for status and weather. Switch between Tactical, Satellite and Street maps, or add the OpenSeaMap sea-marks overlay, from the layer control (top right). Dashed lines run from each asset to its mission target.</p>';
  };

  views.system = function () {
    var html = '<div class="section-head"><h2>System</h2></div><div class="grid g-bridge">';
    html += '<section class="panel"><div class="panel-head"><h2>Data core</h2></div>' +
      '<p class="muted">Everything is stored locally in this browser. Export regularly to back up or move to another device.</p>' +
      '<div class="card-actions"><button class="btn" data-action="export">Export JSON</button>' +
      '<label class="btn" style="display:inline-flex;flex-direction:row">Import JSON<input type="file" accept="application/json" data-action="import" hidden></label>' +
      '<button class="btn ghost" data-action="reset-demo">Load demo data</button>' +
      '<button class="btn danger" data-action="wipe">Wipe all data</button></div>' +
      '<dl class="kv" style="margin-top:16px"><dt>Assets</dt><dd>' + state.assets.length + '</dd><dt>Equipment</dt><dd>' + state.equipment.length + '</dd><dt>Missions</dt><dd>' + state.missions.length + '</dd></dl></section>';
    html += '<section class="panel"><div class="panel-head"><h2>Captain\'s log</h2></div><div class="list" style="max-height:420px;overflow-y:auto">' +
      (state.log.length ? state.log.slice(0, 100).map(function (l) {
        return '<div class="alert s-info"><div><div class="a-text">' + esc(l.text) + '</div><div class="a-sub">' + new Date(l.at).toLocaleString() + '</div></div></div>';
      }).join('') : '<div class="empty">Log empty.</div>') + '</div></section></div>';
    return html;
  };

  // ---------------------------------------------------------------- render
  function render() {
    var el = $('#view');
    destroyMaps();
    el.innerHTML = views[ui.view]();
    mountMaps();
    $$('#tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === ui.view); });
  }
  function go(view, focusId) {
    ui.view = view; render(); window.scrollTo(0, 0);
    if (focusId) {
      var n = document.getElementById(focusId);
      if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.style.boxShadow = '0 0 0 2px var(--accent), 0 0 24px var(--accent)'; setTimeout(function () { n.style.boxShadow = ''; }, 1800); }
    }
  }

  // ---------------------------------------------------------------- forms
  var modal = $('#modal');
  var modalCtx = null;

  function field(f, val) {
    var id = 'f-' + f.key, cls = f.full ? ' class="full"' : '';
    var lab = '<label' + cls + ' for="' + id + '"><span>' + esc(f.label) + '</span>';
    if (f.type === 'select') {
      return lab + '<select id="' + id + '" name="' + f.key + '">' + f.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></label>';
    }
    if (f.type === 'textarea') return lab + '<textarea id="' + id + '" name="' + f.key + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(val) + '</textarea></label>';
    if (f.type === 'geo') {
      return '<div class="full geo-field"><div class="panel-head" style="margin-bottom:6px">' +
        '<button type="button" class="btn sm accent" id="geoBtn">⌖ Locate from ' + esc(f.sourceLabel) + '</button>' +
        '<span class="muted" id="geoStatus" style="font-size:13px">or click / drag on the map</span></div>' +
        '<div id="pickMap" class="pick-map"></div></div>';
    }
    if (f.type === 'multi') {
      val = val || [];
      return '<div class="full"><label><span>' + esc(f.label) + '</span></label><div class="transfer-pick">' + f.options.map(function (o) {
        return '<label><input type="checkbox" name="' + f.key + '" value="' + esc(o[0]) + '"' + (val.indexOf(o[0]) >= 0 ? ' checked' : '') + '>' + esc(o[1]) + '</label>';
      }).join('') + '</div></div>';
    }
    return lab + '<input id="' + id + '" name="' + f.key + '" type="' + (f.type || 'text') + '"' + (f.required ? ' required' : '') +
      (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') +
      ' value="' + esc(val == null ? '' : val) + '" placeholder="' + esc(f.placeholder || '') + '"></label>';
  }

  function openForm(opts) {
    modalCtx = opts;
    $('#modalTitle').textContent = opts.title;
    $('#modalBody').innerHTML = (opts.intro || '') + '<div class="form-grid">' + opts.fields.map(function (f) { return field(f, opts.values[f.key]); }).join('') + '</div>';
    $('#modalDelete').classList.toggle('hidden', !opts.onDelete);
    $('#modalSave').textContent = opts.saveLabel || 'Engage';
    modal.showModal();
    var geo = opts.fields.filter(function (f) { return f.type === 'geo'; })[0];
    if (geo) initPickMap(geo.source);
    var first = $('#modalBody input, #modalBody select'); if (first) first.focus();
  }
  function initPickMap(srcKey) {
    var host = $('#pickMap'), latEl = $('#f-lat'), lonEl = $('#f-lon'), status = $('#geoStatus');
    var marker = null;
    function setInputs(lat, lon) {
      latEl.value = lat.toFixed(4);
      lonEl.value = ((((lon + 180) % 360) + 360) % 360 - 180).toFixed(4);
    }
    function place(lat, lon, pan) {
      if (!pickMap) return;
      if (!marker) {
        marker = L.marker([lat, lon], { draggable: true, icon: hudIcon('mission') }).addTo(pickMap);
        marker.on('dragend', function () { var p = marker.getLatLng(); setInputs(p.lat, p.lng); });
      } else marker.setLatLng([lat, lon]);
      if (pan) pickMap.setView([lat, lon], Math.max(pickMap.getZoom() || 0, 9));
    }
    $('#geoBtn').addEventListener('click', function () {
      var src = $('#modalBody [name="' + srcKey + '"]');
      status.textContent = 'Scanning…'; status.className = 'muted';
      geocode(src ? src.value : '').then(function (g) {
        setInputs(g.lat, g.lon); place(g.lat, g.lon, true);
        status.textContent = 'Locked: ' + g.label; status.className = 's-ok';
      }).catch(function (e) { status.textContent = e.message || 'Geocoding unavailable'; status.className = 's-warn'; });
    });
    if (!window.L) { host.classList.add('hidden'); return; }
    pickMap = L.map(host, { worldCopyJump: true });
    baseLayers().Tactical.addTo(pickMap);
    if (latEl.value !== '' && lonEl.value !== '') { pickMap.setView([+latEl.value, +lonEl.value], 9); place(+latEl.value, +lonEl.value); }
    else pickMap.setView([45, 10], 3);
    pickMap.on('click', function (e) { setInputs(e.latlng.lat, e.latlng.lng); place(+latEl.value, +lonEl.value); });
    [latEl, lonEl].forEach(function (el) {
      el.addEventListener('change', function () {
        if (latEl.value !== '' && lonEl.value !== '' && isFinite(+latEl.value) && isFinite(+lonEl.value)) place(+latEl.value, +lonEl.value, true);
      });
    });
    setTimeout(function () { if (pickMap) pickMap.invalidateSize(); }, 60);
  }
  modal.addEventListener('close', function () { if (pickMap) { pickMap.remove(); pickMap = null; } });

  function readForm(fields) {
    var out = {}, body = $('#modalBody');
    fields.forEach(function (f) {
      if (f.type === 'multi') { out[f.key] = $$('input[name="' + f.key + '"]:checked', body).map(function (i) { return i.value; }); return; }
      var el = body.querySelector('[name="' + f.key + '"]'); if (!el) return;
      var v = el.value.trim();
      out[f.key] = f.type === 'number' ? (v === '' ? null : +v) : v;
    });
    return out;
  }
  $('#modalForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!modalCtx) return;
    var vals = readForm(modalCtx.fields);
    var err = modalCtx.validate && modalCtx.validate(vals);
    if (err) { alert(err); return; }
    modal.close();
    modalCtx.onSave(vals);
  });
  $('#modalDelete').addEventListener('click', function () {
    if (modalCtx && modalCtx.onDelete && confirm('Confirm: ' + (modalCtx.deleteConfirm || 'delete this record') + '?')) { modal.close(); modalCtx.onDelete(); }
  });
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { modal.close(); }); });

  function assetOptions(includeNone) {
    var o = state.assets.map(function (a) { return [a.id, a.name]; });
    return includeNone ? [['', '— Unassigned —']].concat(o) : o;
  }
  function mapOpts(map) { return Object.keys(map).map(function (k) { return [k, typeof map[k] === 'string' ? map[k] : map[k].label]; }); }

  function editAsset(id) {
    var a = id ? byId(state.assets, id) : null;
    var fields = [
      { key: 'name', label: 'Designation', required: true, full: true, placeholder: 'e.g. M/Y Aurora' },
      { key: 'type', label: 'Class', type: 'select', options: mapOpts(ASSET_TYPES) },
      { key: 'status', label: 'Status', type: 'select', options: mapOpts(ASSET_STATUS) },
      { key: 'location', label: 'Location', full: true, placeholder: 'Marina, city, country' },
      { key: 'lat', label: 'Latitude', type: 'number', step: 'any', placeholder: '43.50' },
      { key: 'lon', label: 'Longitude', type: 'number', step: 'any', placeholder: '16.44' },
      { key: '_geo', type: 'geo', source: 'location', sourceLabel: 'location' },
      { key: 'fuel', label: 'Fuel / heating %', type: 'number', min: 0, max: 100 },
      { key: 'battery', label: 'Battery / storage %', type: 'number', min: 0, max: 100 },
      { key: 'water', label: 'Water %', type: 'number', min: 0, max: 100 },
      { key: 'nextService', label: 'Next service', type: 'date' },
      { key: 'registration', label: 'Registration / ID', full: true },
      { key: 'notes', label: 'Notes', type: 'textarea', full: true }
    ];
    openForm({
      title: a ? 'Configure ' + a.name : 'Commission new asset', fields: fields,
      values: a || { type: 'yacht', status: 'operational' },
      onSave: function (v) {
        if (a) { Object.assign(a, v); commit('Asset updated: ' + a.name); }
        else { v.id = uid('ast'); state.assets.push(v); commit('Asset commissioned: ' + v.name); }
      },
      onDelete: a ? function () {
        state.assets = state.assets.filter(function (x) { return x.id !== a.id; });
        state.equipment.forEach(function (e) { if (e.assetId === a.id) e.assetId = ''; });
        state.missions.forEach(function (m) { m.assetIds = m.assetIds.filter(function (x) { return x !== a.id; }); });
        commit('Asset decommissioned: ' + a.name);
      } : null, deleteConfirm: 'decommission this asset (equipment becomes unassigned)'
    });
  }

  function editEquipment(id, presetAsset) {
    var e = id ? byId(state.equipment, id) : null;
    var fields = [
      { key: 'name', label: 'Item', required: true, full: true },
      { key: 'category', label: 'Category', type: 'select', options: EQ_CATEGORIES.map(function (c) { return [c, c]; }) },
      { key: 'qty', label: 'Quantity', type: 'number', min: 0 },
      { key: 'assetId', label: 'Stowed at', type: 'select', options: assetOptions(true) },
      { key: 'condition', label: 'Condition', type: 'select', options: mapOpts(EQ_CONDITION) },
      { key: 'lastCheck', label: 'Last inspection', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea', full: true }
    ];
    openForm({
      title: e ? 'Edit ' + e.name : 'Register equipment', fields: fields,
      values: e || { category: 'Other', qty: 1, condition: 'ok', assetId: presetAsset || ui.eqAsset || '', lastCheck: iso(today()) },
      onSave: function (v) {
        if (!v.qty && v.qty !== 0) v.qty = 1;
        if (e) {
          if (e.assetId !== v.assetId) log('Transfer: ' + e.name + ' ' + assetName(e.assetId) + ' → ' + assetName(v.assetId));
          Object.assign(e, v); commit('Equipment updated: ' + e.name);
        } else { v.id = uid('eq'); state.equipment.push(v); commit('Equipment registered: ' + v.name + ' at ' + assetName(v.assetId)); }
      },
      onDelete: e ? function () {
        state.equipment = state.equipment.filter(function (x) { return x.id !== e.id; });
        state.missions.forEach(function (m) { m.equipmentIds = m.equipmentIds.filter(function (x) { return x !== e.id; }); });
        commit('Equipment removed: ' + e.name);
      } : null, deleteConfirm: 'remove this equipment'
    });
  }

  function editMission(id, presetAsset, copyFrom) {
    var m = id ? byId(state.missions, id) : null;
    var src = m || copyFrom;
    var fields = [
      { key: 'name', label: 'Mission name', required: true, full: true },
      { key: 'start', label: 'Launch', type: 'date', required: true },
      { key: 'end', label: 'Return', type: 'date', required: true },
      { key: 'status', label: 'Status', type: 'select', options: mapOpts(MISSION_STATUS) },
      { key: 'crew', label: 'Crew / guests' },
      { key: 'destination', label: 'Route / destination', full: true },
      { key: 'lat', label: 'Target latitude', type: 'number', step: 'any' },
      { key: 'lon', label: 'Target longitude', type: 'number', step: 'any' },
      { key: '_geo', type: 'geo', source: 'destination', sourceLabel: 'route (last stop)' },
      { key: 'assetIds', label: 'Assets deployed (first = equipment destination)', type: 'multi', options: assetOptions(false) },
      { key: 'equipmentIds', label: 'Equipment load-out', type: 'multi', options: state.equipment.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (e) { return [e.id, e.name + ' · ' + assetName(e.assetId)]; }) },
      { key: 'checklist', label: 'Checklist (one item per line, prefix [x] when done)', type: 'textarea', full: true },
      { key: 'notes', label: 'Notes', type: 'textarea', full: true }
    ];
    var values = src ? Object.assign({}, src, {
      checklist: (src.checklist || []).map(function (c) { return (c.done ? '[x] ' : '') + c.text; }).join('\n')
    }) : { status: 'planned', start: addDays(7), end: addDays(10), assetIds: presetAsset ? [presetAsset] : [], equipmentIds: [], checklist: '' };
    if (copyFrom) { values.name = copyFrom.name + ' (copy)'; values.status = 'planned'; values.checklist = (copyFrom.checklist || []).map(function (c) { return c.text; }).join('\n'); }
    openForm({
      title: m ? 'Mission: ' + m.name : 'Plan new mission', fields: fields, values: values, saveLabel: m ? 'Update' : 'Engage',
      validate: function (v) { if (v.end < v.start) return 'Return date must be after launch.'; },
      onSave: function (v) {
        v.checklist = v.checklist.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
          var done = /^\[x\]\s*/i.test(l); return { text: l.replace(/^\[[x ]?\]\s*/i, ''), done: done };
        });
        if (m) { Object.assign(m, v); commit('Mission updated: ' + m.name); }
        else { v.id = uid('msn'); state.missions.push(v); commit('Mission planned: ' + v.name); }
        var conf = missionConflicts(m || v);
        if (conf.length) toast('Conflict detected', '<div class="list">' + conf.map(function (o) { return alertHtml({ level: 'crit', text: 'Overlaps with "' + o.name + '"', sub: 'Shared asset or equipment', missions: [o.id] }); }).join('') + '</div>');
      },
      onDelete: m ? function () { state.missions = state.missions.filter(function (x) { return x.id !== m.id; }); commit('Mission scrubbed: ' + m.name); } : null,
      deleteConfirm: 'scrub this mission'
    });
  }

  function transferForm(ids) {
    var preset = ids || [];
    openForm({
      title: 'Equipment transfer', saveLabel: 'Execute transfer',
      intro: '<p class="muted" style="margin-top:0">Select items and a destination. Transfers are logged in the captain\'s log.</p>',
      fields: [
        { key: 'to', label: 'Destination', type: 'select', options: assetOptions(true), full: true },
        { key: 'items', label: 'Items', type: 'multi', options: state.equipment.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (e) { return [e.id, e.name + ' · ' + assetName(e.assetId)]; }) }
      ],
      values: { to: '', items: preset },
      validate: function (v) { if (!v.items.length) return 'Select at least one item.'; },
      onSave: function (v) {
        v.items.forEach(function (id) {
          var e = byId(state.equipment, id); if (!e || e.assetId === v.to) return;
          log('Transfer: ' + e.name + ' ' + assetName(e.assetId) + ' → ' + assetName(v.to));
          e.assetId = v.to;
        });
        commit();
      }
    });
  }

  // ---------------------------------------------------------------- toast / command console
  var toastTimer;
  function toast(title, html, sticky) {
    var o = $('#cmdOut');
    o.innerHTML = '<div class="cmd-title">' + esc(title) + '<button class="btn sm ghost" data-action="close-toast">✕</button></div>' + html;
    o.classList.remove('hidden');
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(function () { o.classList.add('hidden'); }, 9000);
  }

  function runCommand(raw) {
    var cmd = raw.trim(); if (!cmd) return;
    var lc = cmd.toLowerCase().replace(/^(computer|jarvis)[,:]?\s*/, '');
    var m;
    if (lc === 'help' || lc === '?') {
      return toast('COMMAND REFERENCE', '<dl class="kv">' +
        '<dt>status</dt><dd>Fleet &amp; alert summary</dd><dt>where is &lt;item&gt;</dt><dd>Locate equipment</dd>' +
        '<dt>find &lt;text&gt;</dt><dd>Search everything</dd><dt>go &lt;view&gt;</dt><dd>bridge, map, assets, equipment, missions, timeline, system</dd><dt>weather</dt><dd>Mission weather briefing</dd>' +
        '<dt>new mission|asset|item</dt><dd>Open a form</dd><dt>red alert</dt><dd>Show critical alerts</dd></dl>', true);
    }
    if (lc === 'status' || lc === 'report') {
      var al = analyse(), c = al.filter(function (a) { return a.level === 'crit'; }).length;
      var next = activeMissions().sort(function (a, b) { return a.start < b.start ? -1 : 1; })[0];
      return toast('STATUS REPORT', '<p>' + state.assets.length + ' assets, ' + state.equipment.length + ' equipment items, ' + activeMissions().length + ' active missions.</p>' +
        '<p>' + (al.length ? '<span class="s-' + (c ? 'crit' : 'warn') + '">' + al.length + ' alerts (' + c + ' critical).</span>' : '<span class="s-ok">All systems nominal.</span>') + '</p>' +
        (next ? '<p>Next mission: <b>' + esc(next.name) + '</b>, launching ' + fmtDate(next.start) + '.</p>' : ''), true);
    }
    if (lc === 'weather' || lc === 'wx' || lc === 'forecast') {
      fetchWeather();
      var ms = activeMissions().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      var wa = weatherAlerts();
      return toast('WEATHER BRIEFING', (wa.length ? '<div class="list" style="margin-bottom:10px">' + wa.map(alertHtml).join('') + '</div>' : '<p class="s-ok">No adverse weather on mission dates.</p>') +
        ms.map(function (m) { return '<div style="margin-bottom:10px"><div class="a-text">' + esc(m.name) + '</div>' + wxMissionHtml(m).replace(/<div class="panel-head".*?<\/div>/, '') + '</div>'; }).join(''), true);
    }
    if (lc === 'red alert' || lc === 'alerts') {
      var crit = analyse().filter(function (a) { return a.level === 'crit'; });
      return toast('RED ALERT', crit.length ? '<div class="list">' + crit.map(alertHtml).join('') + '</div>' : '<p class="s-ok">No critical alerts.</p>', true);
    }
    if ((m = lc.match(/^go\s+(?:to\s+)?(\w+)/))) { if (views[m[1]]) return go(m[1]); }
    if ((m = lc.match(/^new\s+(mission|asset|item|equipment)/))) {
      return m[1] === 'mission' ? editMission() : m[1] === 'asset' ? editAsset() : editEquipment();
    }
    var q = lc;
    if ((m = lc.match(/^(?:where\s+is|where's|locate|find|search|show)\s+(?:the\s+|my\s+)?(.+)$/))) q = m[1];
    q = q.replace(/[?.!]+$/, '');
    var words = q.split(/\s+/).filter(Boolean);
    function hit(s) { s = s.toLowerCase(); return words.every(function (w) { return s.indexOf(w) >= 0; }); }
    var eqs = state.equipment.filter(function (e) { return hit(e.name + ' ' + e.category + ' ' + e.notes); });
    var ass = state.assets.filter(function (a) { return hit(a.name + ' ' + a.location + ' ' + a.type + ' ' + a.notes); });
    var mis = state.missions.filter(function (x) { return hit(x.name + ' ' + x.destination + ' ' + x.crew); });
    if (!eqs.length && !ass.length && !mis.length) return toast('NO MATCH', '<p class="muted">Unable to comply — nothing matches "' + esc(q) + '". Type <b>help</b>.</p>');
    var html = '<div class="list">';
    eqs.forEach(function (e) {
      var use = activeMissions().filter(function (x) { return x.equipmentIds.indexOf(e.id) >= 0; });
      html += '<div class="alert s-info" data-action="edit-equipment" data-id="' + e.id + '" style="cursor:pointer"><div><div class="a-text">' + esc(e.name) + (e.qty > 1 ? ' ×' + e.qty : '') + '</div>' +
        '<div class="a-sub">Located at <b style="color:var(--primary)">' + esc(assetName(e.assetId)) + '</b> · ' + esc(EQ_CONDITION[e.condition].label) + (use.length ? ' · reserved for ' + esc(use.map(function (u) { return u.name; }).join(', ')) : '') + '</div></div></div>';
    });
    ass.forEach(function (a) { html += '<div class="alert s-ok" data-action="goto-asset" data-id="' + a.id + '" style="cursor:pointer"><div><div class="a-text">' + esc(a.name) + '</div><div class="a-sub">' + esc(a.location) + ' · ' + esc(ASSET_STATUS[a.status].label) + '</div></div></div>'; });
    mis.forEach(function (x) { html += '<div class="alert s-warn" data-action="open-mission" data-id="' + x.id + '" style="cursor:pointer"><div><div class="a-text">' + esc(x.name) + '</div><div class="a-sub">' + fmtDate(x.start) + ' – ' + fmtDate(x.end) + '</div></div></div>'; });
    toast('SCAN RESULTS: ' + (eqs.length + ass.length + mis.length), html + '</div>', true);
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-action]');
    var tab = ev.target.closest('#tabs button');
    if (tab) { go(tab.getAttribute('data-view')); return; }
    if (!t) return;
    var a = t.getAttribute('data-action'), id = t.getAttribute('data-id');
    if (t.tagName === 'A') ev.preventDefault();
    switch (a) {
      case 'new-asset': editAsset(); break;
      case 'edit-asset': editAsset(id); break;
      case 'new-equipment': editEquipment(); break;
      case 'edit-equipment': editEquipment(id); break;
      case 'new-mission': editMission(null, t.getAttribute('data-asset')); break;
      case 'edit-mission': editMission(id); break;
      case 'duplicate-mission': editMission(null, null, byId(state.missions, id)); break;
      case 'open-mission': {
        var ms = byId(state.missions, id);
        if (ms && (ms.status === 'complete' || ms.status === 'cancelled')) ui.missionFilter = 'all';
        go('missions', 'mission-' + id); break;
      }
      case 'goto-asset': go('assets', 'asset-' + id); break;
      case 'goto-equipment': ui.eqAsset = id; ui.eqFilter = ''; go('equipment'); break;
      case 'transfer': transferForm([id]); break;
      case 'bulk-transfer': transferForm([]); break;
      case 'toggle-check': {
        var m = byId(state.missions, id), i = +t.getAttribute('data-idx');
        if (m && m.checklist[i]) { m.checklist[i].done = t.checked; save(); render(); }
        break;
      }
      case 'exec-transfers': {
        var mm = byId(state.missions, id);
        transfersFor(mm).forEach(function (tr) {
          log('Transfer: ' + tr.equipment.name + ' ' + assetName(tr.equipment.assetId) + ' → ' + assetName(tr.to) + ' (for ' + mm.name + ')');
          tr.equipment.assetId = tr.to;
        });
        commit(); break;
      }
      case 'mission-status': {
        var m2 = byId(state.missions, id), st = t.getAttribute('data-status');
        m2.status = st;
        if (st === 'active') m2.assetIds.forEach(function (aid) { var as = byId(state.assets, aid); if (as && as.status !== 'maintenance') as.status = 'deployed'; });
        if (st === 'complete') m2.assetIds.forEach(function (aid) { var as = byId(state.assets, aid); if (as && as.status === 'deployed') as.status = 'operational'; });
        commit('Mission ' + (st === 'active' ? 'launched' : 'completed') + ': ' + m2.name); break;
      }
      case 'wx-refresh': fetchWeather(true); break;
      case 'close-toast': $('#cmdOut').classList.add('hidden'); break;
      case 'export': {
        var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = 'asset-command-' + iso(today()) + '.json'; link.click();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
        break;
      }
      case 'reset-demo': if (confirm('Replace all data with demo data?')) { state = seed(); commit(); } break;
      case 'wipe': if (confirm('Wipe ALL assets, equipment and missions? Export first if unsure.')) { state = { version: 1, assets: [], equipment: [], missions: [], log: [] }; commit('Data core wiped.'); } break;
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.getAttribute('data-action') === 'import' && t.files[0]) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var s = JSON.parse(r.result);
          if (!s.assets || !s.equipment || !s.missions) throw new Error('Missing collections');
          s.log = s.log || [];
          state = s; commit('Data imported from file.');
        } catch (e) { alert('Import failed: ' + e.message); }
      };
      r.readAsText(t.files[0]);
    }
    var bind = t.getAttribute('data-bind');
    if (bind && t.tagName === 'SELECT') { ui[bind] = bind === 'timelineDays' ? +t.value : t.value; render(); }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target, bind = t.getAttribute('data-bind');
    if (bind && t.tagName === 'INPUT') {
      ui[bind] = t.value; render();
      var n = $('[data-bind="' + bind + '"]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    }
  });

  $('#cmdForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var i = $('#cmdInput'); runCommand(i.value); i.value = '';
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { ev.preventDefault(); $('#cmdInput').focus(); }
    if (ev.key === 'Escape') $('#cmdOut').classList.add('hidden');
  });

  // Theme
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('#themeBtn').textContent = t === 'jarvis' ? 'LCARS' : 'JARVIS';
    try { localStorage.setItem(STORAGE_KEY + '.theme', t); } catch (e) { /* ignore */ }
  }
  $('#themeBtn').addEventListener('click', function () {
    setTheme(document.documentElement.getAttribute('data-theme') === 'jarvis' ? 'lcars' : 'jarvis');
  });
  try { setTheme(localStorage.getItem(STORAGE_KEY + '.theme') || 'jarvis'); } catch (e) { setTheme('jarvis'); }

  // Clock + stardate
  function tick() {
    var n = new Date();
    $('#clockTime').textContent = n.toLocaleTimeString(undefined, { hour12: false });
    var start = new Date(n.getFullYear(), 0, 1), end = new Date(n.getFullYear() + 1, 0, 1);
    var sd = n.getFullYear() + (n - start) / (end - start);
    $('#clockDate').textContent = 'STARDATE ' + sd.toFixed(3);
  }
  setInterval(tick, 1000); tick();

  $('#wxPill').addEventListener('click', function () { fetchWeather(true); });
  if (wx.at) setWxStatus(Date.now() - wx.at < WX_TTL ? 'ok' : 'err', 'WX ' + new Date(wx.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }));
  setInterval(fetchWeather, 10 * 60000);

  save();
  render();
  fetchWeather();
})();
