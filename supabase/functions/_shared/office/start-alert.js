// The start-date alert (2026-11-26, Samantha: "big alerts to Katlin and Samantha when a start date from the state is
// put in after state calls us"). Runs inside cds-lead-alert, every 2 minutes.
//
// What it watches: each Starting consumer's "Start date from the state" (consumers[].cdsStartDate, set on the Starting
// profile). A start date that is NEW, or CHANGED, since the last look is one alert. The first run only remembers what is
// there now (no alert for dates already on file).
// Who hears, and how (setting start_alerts):
//   email   to every recipient, any hour
//   text    to recipients with a phone, 7 AM to 8 PM Missouri time (her quiet-hours rule); a date set at night is texted
//           at 7 AM, unless it was already seen in the hub by then (the email and lists still went out)
//   lists   a one-time item at the top of each recipient's CDS to-do that has one (Katlin), and on Samantha's My Week
// Every message is recorded in cds_outbox (practice, sent or failed). Nothing fails silently. Practice while
// start_alerts.live is false: recorded, not sent. Office only: never contacts a consumer, family or attendant.
// No em dashes in anything a person reads.
export const HUB = 'https://hub.caringcds.com/#starting';
const lc = (s) => String(s || '').trim().toLowerCase();
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(d + 'T12:00:00Z'));
export const moDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
export const moHour = (ms) => Number(new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })) % 24;
export const longDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const shortName = (n) => { const w = String(n || '').trim().split(/\s+/); return w.length > 1 ? w[0] + ' ' + w[w.length - 1].charAt(0) + '.' : (w[0] || 'Someone'); };
export const textHours = (ms, from = 7, until = 20) => { const h = moHour(ms); return h >= from && h < until; };

/* What changed: Starting consumers whose start date is new or different from what was seen. Pure. */
export function changes(consumers, seen) {
  const out = [];
  for (const c of consumers || []) {
    if (!c || String(c.status || '').toLowerCase() !== 'starting' || !isDay(c.cdsStartDate)) continue;
    if (/^(example|test)\b/i.test(String(c.name || '').trim())) continue;   // practice records stay quiet
    const was = (seen || {})[String(c.id)] || '';
    if (was === c.cdsStartDate) continue;
    const log = ((c.medicaid && c.medicaid.log) || []).filter((l) => /^Start date from the state/.test(String(l.text || ''))).slice(-1)[0] || null;
    out.push({ id: String(c.id), name: c.name || '', date: c.cdsStartDate, was, by: log ? String(log.by || '') : '', county: c.county || '',
      attendant: (c.starting && c.starting.attendantName) || '' });
  }
  return out;
}

export function words(ch) {
  const when = longDay(ch.date);
  const verb = ch.was ? 'changed to ' + when + ' (was ' + longDay(ch.was) + ')' : when;
  const subject = 'CDS start date: ' + ch.name + (ch.was ? ' start date changed' : ' starts ' + when);
  const next = [
    'Put the authorization in WellSky',
    'Set up ' + (ch.name.split(' ')[0] || 'their') + "'s profile and tasks in WellSky",
    ch.attendant ? 'Make sure ' + ch.attendant + ' has the packet done and the background checks back' : 'Make sure the attendant is chosen, the packet is done and the background checks are back',
    'Clock-in call before the first shift',
  ];
  const heard = !!ch.heard;
  const text = 'CDS START DATE: ' + shortName(ch.name) + ' starts ' + (heard ? when : verb) + '. ' + (heard ? 'The state called the CDS line. Check it and press Use it on Starting. ' : 'The state set it. ') + 'Next: WellSky authorization, profile and tasks. ' + HUB.replace('https://', '');
  const body = [
    heard ? 'The state called the CDS line with a start date for ' + ch.name + ': ' + when + '.' + (ch.was && ch.was !== ch.date ? ' The profile says ' + longDay(ch.was) + ' now.' : '') : 'The state gave a start date for ' + ch.name + ': ' + verb + '.',
    heard ? 'The Coordinator heard it on the call' + (ch.caller ? ' with ' + ch.caller : '') + '. It is not on the profile yet: open their Starting profile, check the call, and press Use it.' + (ch.summary ? '\nWhat was said: ' + ch.summary : '') : '',
    [ch.by ? 'Put in the hub by ' + ch.by + '.' : '', ch.county ? 'County: ' + ch.county + '.' : '', ch.attendant ? 'Attendant: ' + ch.attendant + '.' : ''].filter(Boolean).join('\n'),
    '',
    'What is next:',
    ...next.map((n) => '- ' + n),
    '',
    'Open the Starting page: ' + HUB,
  ].join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2a37">'
    + '<div style="background:#9C6410;color:#fff;border-radius:10px;padding:14px 16px;font-size:18px;font-weight:bold">Start date from the state: ' + esc(ch.name) + '</div>'
    + '<p style="font-size:17px"><b>' + esc(heard ? 'Starts ' + when : verb.charAt(0).toUpperCase() + verb.slice(1)) + '</b></p>'
    + (heard ? '<p style="background:#FEF3C7;border-radius:8px;padding:10px 12px">The state called the CDS line' + (ch.caller ? ' (' + esc(ch.caller) + ')' : '') + ' and the Coordinator heard this date. <b>It is not on the profile yet.</b> Open the Starting profile, check the call, and press <b>Use it</b>.' + (ch.summary ? '<br><br>What was said: ' + esc(ch.summary) : '') + '</p>' : '')
    + (ch.by ? '<p>Put in the hub by ' + esc(ch.by) + '.</p>' : '')
    + (ch.county || ch.attendant ? '<p>' + [ch.county ? 'County: ' + esc(ch.county) : '', ch.attendant ? 'Attendant: ' + esc(ch.attendant) : ''].filter(Boolean).join('<br>') + '</p>' : '')
    + '<p><b>What is next</b></p><ul>' + next.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>'
    + '<p><a href="' + HUB + '" style="background:#1F7A8C;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Open the Starting page</a></p></div>';
  const item = 'START DATE: ' + ch.name + ' starts ' + (heard ? when + ' (the state called; press Use it on Starting)' : verb) + '. WellSky: authorization, profile and tasks.';
  return { subject, text, body, html, item, next };
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// deps: { db: { query(text, params) -> { rows } }, send({ channel, to, subject, text, html }), now?: () => ms }
export function createStartAlert(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p = []) => (await deps.db.query(t, p)).rows;
  const one = async (t, p = []) => (await q(t, p))[0] || null;
  async function save(cfg) { await q(`update cds_match_settings set value = $1::jsonb, updated_by = 'cds-start-alert' where key = 'start_alerts'`, [JSON.stringify(cfg)]); }
  async function deliver(live, channel, to, toName, subject, text, html) {
    let status, error = null;
    if (!to) { status = 'failed'; error = 'No ' + (channel === 'sms' ? 'phone' : 'email') + ' on file for ' + toName; }
    else if (!live) status = 'practice';
    else { try { await deps.send({ channel, to, subject, text, html }); status = 'sent'; } catch (e) { status = 'failed'; error = String((e && e.message) || e).slice(0, 300); } }
    const masked = !to ? toName : channel === 'sms' ? '…' + String(to).replace(/\D/g, '').slice(-4) : to.replace(/^(.).*(@.*)$/, '$1…$2');
    await q(`insert into cds_outbox (audience, channel, template, to_display, body, status, error, automatic, created_by)
      values ('office', $1, 'start_alert', $2, $3, $4, $5, true, 'cds-start-alert')`, [channel, masked, (subject ? subject + '\n\n' : '') + text, status, error]);
    return { channel, toName, status, error };
  }

  async function run() {
    const row = await one(`select value from cds_match_settings where key = 'start_alerts'`);
    if (!row) return { ok: true, skipped: 'no start_alerts setting yet' };
    const cfg = Object.assign({ live: false, recipients: [], seen: {}, pending: [] }, row.value || {});
    const d = await one(`select data_value from agency_data where agency_id = 'caring-companions-cds' and data_key = 'consumers'`);
    const consumers = (d && Array.isArray(d.data_value)) ? d.data_value : [];
    const t = now(), today = moDay(t);
    const found = changes(consumers, cfg.seen);
    // first look: remember what is on file, say nothing
    if (!cfg.seeded) {
      cfg.seen = Object.fromEntries(consumers.filter((c) => c && isDay(c.cdsStartDate)).map((c) => [String(c.id), c.cdsStartDate]));
      cfg.seeded = new Date(t).toISOString();
      await save(cfg);
      return { ok: true, seeded: Object.keys(cfg.seen).length };
    }
    // 2026-11-26: a start date the Coordinator heard on a call from the state (state-calls.js), not on the profile yet
    const alerted = new Set(cfg.items_alerted || []);
    const heardRows = await q(`select id, person_kind, person_id, person_name, data, source from cds_coord_items
      where kind = 'start_date' and data->>'saidBy' = 'state' and status = 'suggested' and created_at >= $1::timestamptz order by id`, [cfg.seeded]);
    for (const it of heardRows) {
      if (alerted.has(String(it.id)) || !isDay(it.data && it.data.date)) continue;
      const c = it.person_kind === 'consumer' ? consumers.find((x) => String(x.id) === String(it.person_id)) : null;
      found.push({ id: String(it.person_id), name: it.person_name || '', date: it.data.date, was: (c && c.cdsStartDate) || '', heard: true, itemId: String(it.id),
        caller: String((it.source && it.source.who) || '').replace(/^The state \(|\)$/g, ''), summary: (it.source && it.source.summary) || '', kind: it.person_kind,
        county: (c && c.county) || '', attendant: (c && c.starting && c.starting.attendantName) || '', by: '' });
    }
    const results = [];
    for (const ch of found) {
      const w = words(ch);
      for (const r of cfg.recipients || []) {
        if (r.email !== false) results.push(await deliver(!!cfg.live, 'email', r.email, r.name, w.subject, w.body, w.html));
        if (r.phone) {
          if (textHours(t, cfg.text_from, cfg.text_until)) results.push(await deliver(!!cfg.live, 'sms', r.phone, r.name, '', w.text));
          else (cfg.pending = cfg.pending || []).push({ id: ch.id, date: ch.date, name: r.name, phone: r.phone, text: w.text, at: new Date(t).toISOString() });
        }
        // the lists: Katlin's to-do (anyone with a CDS to-do), Samantha's My Week (owners)
        if (r.todo) {
          await q(`insert into cds_todo (id, kind, data, updated_by) values ($1, 'item', $2::jsonb, 'cds-start-alert') on conflict (id) do update set data = excluded.data, updated_at = now()`,
            ['i:sa' + (String(ch.id).replace(/[^a-z0-9]/gi, '').toLowerCase() + ch.date.replace(/-/g, '')).slice(-20).padStart(8, '0'),
              JSON.stringify({ who: lc(r.email), n: 0, when: 'once', date: today, by: 'samantha@mo-care.com', t: w.item.slice(0, 160), how: w.next.map((n, i) => (i + 1) + '. ' + n).join('\n') })]);
        }
      }
      if (cfg.my_week !== false) {
        await q(`insert into owner_calendar (id, kind, data, updated_at, updated_by) values ($1, 'item', $2::jsonb, now(), 'cds-start-alert')
          on conflict (id) do update set data = excluded.data, updated_at = now()`,
        ['i:start-' + String(ch.id).replace(/[^a-z0-9-]/gi, '').slice(0, 30) + '-' + ch.date, JSON.stringify({ t: w.item.slice(0, 160), date: today, every: 'once', time: '', cat: 'cds', note: w.next.join('. ') + '.' })]);
      }
      if (ch.heard) { alerted.add(ch.itemId); if (ch.kind === 'consumer') cfg.seen[ch.id] = ch.date; }   // pressing Use it later is not a second alert
      else cfg.seen[ch.id] = ch.date;
    }
    // night texts wait for 7 AM; a date changed again since then sends only the newest
    if ((cfg.pending || []).length && textHours(t, cfg.text_from, cfg.text_until)) {
      const keep = [];
      for (const p of cfg.pending) {
        if (cfg.seen[p.id] !== p.date) continue;   // changed again: the newer alert has its own text
        results.push(await deliver(!!cfg.live, 'sms', p.phone, p.name, '', p.text));
      }
      cfg.pending = keep;
    }
    cfg.items_alerted = [...alerted].slice(-300);
    cfg.last_run = new Date(t).toISOString();
    if (found.length || results.length) cfg.last_alert = { at: cfg.last_run, people: found.map((f) => f.name), results: results.map((r) => r.channel + ' ' + r.toName + ' ' + r.status) };
    await save(cfg);
    return { ok: true, found: found.length, sent: results.filter((r) => r.status === 'sent').length, practice: results.filter((r) => r.status === 'practice').length,
      failed: results.filter((r) => r.status === 'failed').length, waiting_texts: (cfg.pending || []).length };
  }
  return { run };
}
