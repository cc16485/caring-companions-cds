// CDS Communication & Follow-Up Center, step 1 (2026-10-22, her approved design, mockup
// artifact 6DTNtZDFccu8i3ZbJZhmee).
//
// Every 5 minutes: read new calls and texts from GoHighLevel (both CDS lines live in the one
// CDS sub-account), save each once (cds_comms, keyed by the GoHighLevel message id), work out who
// it is from the phone book, and keep follow-ups on the hub's task list (cds_tasks area 'followup'):
//   - a missed call or voicemail opens a follow-up, or adds to the open one for that number;
//   - texts nobody answered for 10 minutes do the same ("ok" and "thanks" do not);
//   - an unknown number, or one on two different people, opens a "Who is this?" follow-up;
//   - it closes itself when someone on the team texts that number, or a call with them connects.
//     A call back that does not connect is added to the card and the card stays open.
// It only READS GoHighLevel. It never calls, texts or emails anyone, and never changes a contact.
// Owners come from setting comm_center.owners (the hub picks the owner, never the AI); until she
// sets them every card is "Nobody yet". Calls never count as monthly check-ins.
// No em dashes in anything a person reads (her rule).

export const ten = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const normName = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const TRIVIAL = /^(ok|okay|k|kk|thanks|thank you|thank u|thx|ty|sounds good|great|perfect|got it|will do|you too|yw|welcome|bye)[.! ]*$/i;
export const TEXT_QUIET_MIN = 10;

// Words for the kinds of people (cards and profiles).
export const KIND_LABEL = { lead: 'Lead', consumer: 'Consumer', family: 'Family', attendant: 'Attendant', pool: 'Attendant',
  applicant: 'Applicant', staff: 'Our team', ignore: 'Not for CDS' };

// ---------- one GoHighLevel message, made plain ----------
// Calls: messageType TYPE_CALL (and IVR/custom calls), TYPE_VOICEMAIL. Duration and status sit in
// meta.call (seen live by the Caring Companions hub) or meta.callDuration / meta.callStatus (the docs).
export function plainMessage(m, conv) {
  const type = String(m.messageType || m.type || '');
  const call = /CALL|VOICEMAIL/i.test(type);
  const sms = /SMS/i.test(type);
  if (!call && !sms) return null;
  const direction = m.direction === 'outbound' ? 'outbound' : m.direction === 'inbound' ? 'inbound' : null;
  if (!direction || !m.id || !m.dateAdded) return null;
  const meta = m.meta || {};
  const seconds = Math.max(0, Math.round(+(meta.call?.duration ?? meta.callDuration ?? 0) || 0));
  const status = String(meta.call?.status ?? meta.callStatus ?? m.status ?? '').toLowerCase();
  const voicemail = call && (status === 'voicemail' || /VOICEMAIL/i.test(type));
  const answered = call && !voicemail && (status === 'completed' || status === 'answered') && seconds > 0;
  return {
    id: String(m.id), channel: call ? 'call' : 'sms', direction, at: new Date(m.dateAdded).toISOString(),
    phone10: ten(conv?.phone || m.phone || ''), ghl_contact_id: String(m.contactId || conv?.contactId || '') || null,
    conversation_id: String(m.conversationId || conv?.id || '') || null,
    contact_name: String(conv?.fullName || conv?.contactName || '').slice(0, 120) || null,
    status: status || null, seconds, answered, voicemail,
    user_id: m.userId ? String(m.userId) : null,
    body: sms ? String(m.body || '').slice(0, 1000) : null,
  };
}

// ---------- the phone book ----------
// agency = { pipeline, consumers, attendants } (agency_data), pool = attendant_pool rows, staff = [{name, phone}].
export function phoneBookRows({ pipeline = [], consumers = [], attendants = [], pool = [], staff = [] }) {
  const rows = [];
  const add = (phone, ref, kind, name, detail) => { const p = ten(phone); if (p) rows.push({ phone10: p, ref, kind, name: name || '', detail: detail || '' }); };
  const consumerByName = new Map(consumers.filter(c => c && c.name).map(c => [normName(c.name), c]));
  for (const c of consumers) if (c && c.id) add(c.phone, 'consumer:' + c.id, 'consumer', c.name, c.status && c.status !== 'Active' ? c.status : '');
  for (const p of pipeline) {
    if (!p || !p.id) continue;
    // A lead already on Consumers is that consumer, so their numbers point there.
    const asConsumer = consumerByName.get(normName(p.name));
    const ref = asConsumer ? 'consumer:' + asConsumer.id : 'lead:' + p.id;
    const kind = asConsumer ? 'consumer' : 'lead';
    const name = asConsumer ? asConsumer.name : p.name;
    add(p.phone, ref, kind, name, '');
    const R = p.referral || {};
    add(R.altPhone, ref, kind, name, '');
    for (const ph of [R.responsiblePartyPhone, R.responsiblePartyAltPhone])
      add(ph, 'family:' + ref, 'family', R.responsiblePartyName || 'Family', (R.responsiblePartyRelationship ? R.responsiblePartyRelationship + ' of ' : 'Family of ') + name);
    if (p.attendant && p.attendant.phone) add(p.attendant.phone, 'attendant:lead-' + p.id, 'attendant', p.attendant.name || 'Attendant', 'Attendant for ' + name);
  }
  // Attendants: the old roster and Active Attendants (attendant_pool) can hold the same person.
  // Same phone and same name is one attendant; the pool record wins.
  const poolByPhoneName = new Set();
  for (const a of pool) {
    if (!a || !a.id || a.archived) continue;
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
    const hired = ['active', 'placed', 'hired', 'working'].includes(String(a.status || '').toLowerCase()) || !!a.placed_with;
    add(a.phone, 'pool:' + a.id, hired ? 'attendant' : 'applicant', name, a.placed_with ? 'Attendant for ' + a.placed_with : hired ? '' : 'Attendant applicant');
    poolByPhoneName.add(ten(a.phone) + '|' + normName(name));
  }
  for (const a of attendants) {
    if (!a || !a.id) continue;
    if (poolByPhoneName.has(ten(a.phone) + '|' + normName(a.name))) continue;
    add(a.phone, 'attendant:' + a.id, 'attendant', a.name, a.consumer ? 'Attendant for ' + a.consumer : '');
  }
  for (const s of staff) add(s.phone, 'staff:' + String(s.email || s.name || '').toLowerCase(), 'staff', s.name, 'Our team');
  // one row per number per person
  const seen = new Set();
  return rows.filter(r => { const k = r.phone10 + '|' + r.ref; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Who is this number? book = rows for that number. A staff answer wins. One person = known.
export function resolve(book) {
  const mine = book.filter(r => r.source === 'staff');
  const use = mine.length ? mine : book;
  if (use.some(r => r.kind === 'staff')) return { state: 'staff', person: use.find(r => r.kind === 'staff') };
  if (use.some(r => r.kind === 'ignore')) return { state: 'ignore', person: null };
  const people = [...new Map(use.map(r => [r.ref, r])).values()];
  if (people.length === 1) return { state: 'known', person: people[0] };
  if (!people.length) return { state: 'unknown', person: null };
  return { state: 'several', person: null, candidates: people };
}

// ---------- follow-ups for one number ----------
// comms = every saved call and text for this number since cards_from (oldest first), open = the
// open follow-up or null. Returns what to do: { open: { events, last }, close: { reason, by, at } | null }.
export function decide(comms, open, nowMs) {
  const events = open ? (Array.isArray(open.events) ? open.events.slice() : []) : [];
  const have = new Set(events.map(e => e.id));
  let lastWant = events.filter(e => e.kind !== 'tried').reduce((m, e) => Math.max(m, Date.parse(e.at) || 0), 0);
  let close = null;
  const want = (c, text, kind) => { if (have.has(c.id)) return; events.push({ id: c.id, at: c.at, kind, text }); have.add(c.id); lastWant = Math.max(lastWant, Date.parse(c.at)); close = null; };
  // inbound texts wait for 10 quiet minutes before they count
  const lastIn = comms.filter(c => c.channel === 'sms' && c.direction === 'inbound').map(c => Date.parse(c.at)).sort((a, b) => b - a)[0] || 0;
  const textsSettled = nowMs - lastIn >= TEXT_QUIET_MIN * 60000;
  for (const c of comms) {
    const t = Date.parse(c.at);
    if (c.channel === 'call' && c.direction === 'inbound' && !c.answered) {
      want(c, c.voicemail ? 'Missed call. Voicemail' + (c.seconds ? ', ' + c.seconds + ' seconds.' : '.') + ' Listen in GoHighLevel.' : 'Missed call. No voicemail.', c.voicemail ? 'voicemail' : 'missed');
    } else if (c.channel === 'sms' && c.direction === 'inbound') {
      if (!textsSettled && t > nowMs - TEXT_QUIET_MIN * 60000) continue;
      // only texts nobody has answered yet
      const answeredLater = comms.some(o => o.direction === 'outbound' && Date.parse(o.at) > t && (o.channel === 'sms' || o.answered))
        || comms.some(o => o.channel === 'call' && o.direction === 'inbound' && o.answered && Date.parse(o.at) > t);
      if (answeredLater || TRIVIAL.test(String(c.body || '').trim())) continue;
      want(c, 'Texted: "' + String(c.body || '').trim().slice(0, 240) + '"', 'text');
    } else if (lastWant && t > lastWant) {
      // something after the last thing that needed us
      if (c.direction === 'outbound' && c.channel === 'sms') close = { reason: 'texted', by: c.staff_name || '', at: c.at };
      else if (c.channel === 'call' && c.answered) close = { reason: c.direction === 'outbound' ? 'called' : 'talked', by: c.staff_name || '', at: c.at };
      else if (c.channel === 'call' && c.direction === 'outbound' && !have.has(c.id)) {
        events.push({ id: c.id, at: c.at, kind: 'tried', text: 'Called back' + (c.staff_name ? ' (' + c.staff_name + ')' : '') + '. No answer.' }); have.add(c.id);
      }
    }
  }
  if (!events.some(e => e.kind !== 'tried')) return { open: null, close: null };
  return { open: { events, last: new Date(lastWant).toISOString() }, close };
}

// deps: { db: { query(text, params) -> { rows } }, ghl: { users(), conversations(sinceMs), messages(conversationId, sinceMs), contact(id) }, now?: () => ms }
export function createComms(deps) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const nowMs = () => deps.now ? deps.now() : Date.now();
  const iso = ms => new Date(ms).toISOString();

  async function settings() {
    const r = await one(`select value from cds_match_settings where key='comm_center'`);
    return r && r.value && typeof r.value === 'object' ? r.value : null;
  }
  async function saveState(patch) {
    await q(`update cds_match_settings set value = value || jsonb_build_object('state', coalesce(value->'state','{}'::jsonb) || $1::jsonb), updated_at=now() where key='comm_center'`, [JSON.stringify(patch)]);
  }
  async function agency(key) {
    const r = await one(`select data_value from agency_data where agency_id='caring-companions-cds' and data_key=$1`, [key]);
    return r && Array.isArray(r.data_value) ? r.data_value : [];
  }

  async function rebuildBook() {
    const staff = [];
    for (const key of ['lead_alerts', 'packet_alerts']) {
      const r = await one(`select value from cds_match_settings where key=$1`, [key]);
      for (const x of (r && r.value && r.value.recipients) || []) staff.push({ name: x.name, phone: x.phone, email: x.email });
    }
    const pool = await q(`select id, first_name, last_name, phone, status, placed_with, archived from attendant_pool where agency_id='caring-companions-cds'`);
    const rows = phoneBookRows({ pipeline: await agency('pipeline'), consumers: await agency('consumers'), attendants: await agency('attendants'), pool, staff });
    await q(`delete from cds_phone_book where source='sync'`);
    for (let i = 0; i < rows.length; i += 200) {
      const part = rows.slice(i, i + 200);
      await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source)
               select x->>'phone10', x->>'ref', x->>'kind', x->>'name', x->>'detail', 'sync' from jsonb_array_elements($1::jsonb) x
               on conflict (phone10, ref) do nothing`, [JSON.stringify(part)]);
    }
    return rows.length;
  }

  async function bookFor(phone10) { return q(`select * from cds_phone_book where phone10=$1`, [phone10]); }

  // Read GoHighLevel and save what is new. Overlaps the last run by 15 minutes; ids make it safe.
  // rescan: read the whole history window again (ids make it safe), e.g. after a fix.
  async function pull(s, { rescan = false } = {}) {
    const st = s.state || {};
    const since = st.read_until && !rescan ? Date.parse(st.read_until) - 15 * 60000 : nowMs() - (s.history_days || 60) * 86400000;
    const users = new Map((await deps.ghl.users().catch(() => [])).map(u => [String(u.id), u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')]));
    let saved = 0, seen = 0, skipped = 0, partial = false, fromContact = 0;
    // Some GoHighLevel conversations carry no phone number (seen live 2026-10-22: 8 of 55).
    // Then the number is read from the contact itself, once per contact per run. Read only.
    // Why a number is missing is counted, never swallowed (1042 could not tell; her rule).
    const noNumber = { no_contact: 0, contact_no_phone: 0, lookup_failed: {}, kinds: {} };
    const contactPhone = new Map();
    const phoneOf = async id => {
      if (!id) return { phone: '', why: 'no_contact' };
      if (!deps.ghl.contact) return { phone: '', why: 'contact_no_phone' };
      if (!contactPhone.has(id)) {
        let got;
        try { const c = await deps.ghl.contact(id); const ph = ten(c && c.phone); got = { phone: ph, why: ph ? '' : 'contact_no_phone' }; }
        catch (e) { const m = String(e && e.message || e).match(/GoHighLevel (\d{3})/); got = { phone: '', why: 'lookup_failed', status: m ? m[1] : 'error' }; }
        contactPhone.set(id, got);
      }
      return contactPhone.get(id);
    };
    const started = nowMs();
    // A long first read must never get stuck: after the time budget it keeps what it has,
    // says so (history_partial), and the next run carries on from now.
    const budget = deps.budgetMs ?? 100000;
    const t0 = Date.now();
    for (const conv of await deps.ghl.conversations(since)) {
      if (Date.now() - t0 > budget) { partial = true; break; }
      for (const m of await deps.ghl.messages(conv.id, since)) {
        const c = plainMessage(m, conv);
        if (!c) continue;
        seen++;
        if (Date.parse(c.at) < since) continue;
        if (!c.phone10) {
          const got = await phoneOf(c.ghl_contact_id);
          if (got.phone) { c.phone10 = got.phone; fromContact++; }
          else {
            // Still saved (phone10 empty) so a missed call from a hidden number is never dropped.
            skipped++;
            if (got.why === 'lookup_failed') noNumber.lookup_failed[got.status] = (noNumber.lookup_failed[got.status] || 0) + 1;
            else noNumber[got.why]++;
            const k = c.channel + ' ' + c.direction;
            noNumber.kinds[k] = (noNumber.kinds[k] || 0) + 1;
          }
        }
        const r = await one(`insert into cds_comms (id, channel, direction, at, phone10, ghl_contact_id, conversation_id, contact_name, status, seconds, answered, voicemail, staff_name, body)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (id) do nothing returning id`,
          [c.id, c.channel, c.direction, c.at, c.phone10 || null, c.ghl_contact_id, c.conversation_id, c.contact_name, c.status, c.seconds, c.answered, c.voicemail,
           c.user_id ? (users.get(c.user_id) || null) : null, c.body]);
        if (r) saved++;
      }
    }
    await saveState(Object.assign({ read_until: iso(started), last_run: iso(nowMs()), last_saved: saved, last_skipped_no_number: skipped, last_no_number: noNumber, last_error: null },
      partial ? { history_partial: true } : {}));
    return { seen, saved, skipped, partial, fromContact, noNumber };
  }

  // Keep follow-ups right for every number with calls or texts since cards_from.
  async function cards(s) {
    const from = s.cards_from ? s.cards_from : iso(nowMs());
    const owners = s.owners || {};
    const phones = (await q(`select distinct phone10 from cds_comms where at >= $1 and phone10 is not null`, [from])).map(r => r.phone10);
    let opened = 0, updated = 0, closed = 0;
    for (const phone10 of phones) {
      const comms = await q(`select * from cds_comms where phone10=$1 and at >= $2 order by at`, [phone10, from]);
      const open = await one(`select * from cds_tasks where area='followup' and phone10=$1 and done_at is null order by created_at desc limit 1`, [phone10]);
      // after a close, only what came later counts
      const lastDone = await one(`select done_at from cds_tasks where area='followup' and phone10=$1 and done_at is not null order by done_at desc limit 1`, [phone10]);
      const after = lastDone ? comms.filter(c => Date.parse(c.at) > Date.parse(lastDone.done_at)) : comms;
      const who = resolve(await bookFor(phone10));
      if (who.state === 'staff' || who.state === 'ignore') continue;
      const d = decide(after, open, nowMs());
      if (!d.open) continue;
      const person = who.person;
      const title = person ? person.name : 'Unknown number';
      const ref = person ? person.ref : null;
      const owner = owners.not_sure || null;
      if (!open) {
        const id = (await one(`insert into cds_tasks (kind, title, area, phone10, person_ref, owner, events, due_at, dedupe_key, updated_at)
          values ($1, $2, 'followup', $3, $4, $5, $6::jsonb, $7, $8, $9) on conflict (dedupe_key) do nothing returning id`,
          [who.state === 'known' ? 'followup' : 'who_is_this', title, phone10, ref, owner, JSON.stringify(d.open.events), d.open.events[0].at,
           'fu:' + phone10 + ':' + d.open.events[0].id, d.open.last]))?.id;
        if (id) opened++;
        if (id && d.close) { await closeTask(id, d.close.reason, d.close.by || 'GoHighLevel', d.close.at); closed++; }
      } else {
        if (JSON.stringify(open.events) !== JSON.stringify(d.open.events) || open.person_ref !== ref) {
          await q(`update cds_tasks set events=$2::jsonb, updated_at=$3, title=$4, person_ref=$5, kind=$6 where id=$1`,
            [open.id, JSON.stringify(d.open.events), d.open.last, title, ref, who.state === 'known' ? 'followup' : 'who_is_this']);
          updated++;
        }
        if (d.close) { await closeTask(open.id, d.close.reason, d.close.by || 'GoHighLevel', d.close.at); closed++; }
      }
    }
    // Hidden numbers: a missed call or a text with no number anywhere still gets a card, one per
    // call or text, so nobody is dropped. It cannot be called back; Done closes it, and an answered
    // call or a reply in the same GoHighLevel conversation closes it too.
    const hidden = await q(`select * from cds_comms where phone10 is null and at >= $1 and direction='inbound' and at <= $2
      and ((channel='call' and not answered) or channel='sms') order by at`, [from, iso(nowMs() - TEXT_QUIET_MIN * 60000)]);
    for (const c of hidden) {
      if (c.channel === 'sms' && TRIVIAL.test(String(c.body || '').trim())) continue;
      const text = c.channel === 'call'
        ? (c.voicemail ? 'Missed call from a hidden number. Voicemail' + (c.seconds ? ', ' + c.seconds + ' seconds.' : '.') : 'Missed call from a hidden number. No voicemail.')
        : 'Text with no number: "' + String(c.body || '').trim().slice(0, 240) + '"';
      const ev = [{ id: c.id, at: c.at, kind: c.channel === 'call' ? (c.voicemail ? 'voicemail' : 'missed') : 'text', text, contactId: c.ghl_contact_id || null, conversationId: c.conversation_id || null }];
      const id = (await one(`insert into cds_tasks (kind, title, area, phone10, owner, events, due_at, dedupe_key, updated_at)
        values ('hidden_number', 'Hidden number', 'followup', null, $1, $2::jsonb, $3, $4, $3) on conflict (dedupe_key) do nothing returning id`,
        [owners.not_sure || null, JSON.stringify(ev), c.at, 'fu:hidden:' + c.id]))?.id;
      if (id) opened++;
      const later = c.conversation_id ? await one(`select at, staff_name, channel, direction from cds_comms where conversation_id=$1 and at > $2
        and ((direction='outbound' and channel='sms') or (channel='call' and answered)) order by at limit 1`, [c.conversation_id, c.at]) : null;
      if (later) {
        const t = await one(`select id from cds_tasks where dedupe_key=$1 and done_at is null`, ['fu:hidden:' + c.id]);
        if (t) { await closeTask(t.id, later.channel === 'sms' ? 'texted' : later.direction === 'outbound' ? 'called' : 'talked', later.staff_name || 'GoHighLevel', later.at); closed++; }
      }
    }
    return { opened, updated, closed };
  }

  async function closeTask(id, reason, by, at) {
    await q(`update cds_tasks set done_at=$2, done_by=$3, closed_reason=$4 where id=$1 and done_at is null`, [id, at || iso(nowMs()), by, reason]);
  }

  // The 5-minute job. Errors are saved so the page and the 8am email can say the job stopped.
  async function run(opts = {}) {
    const s = await settings();
    if (!s) return { ok: false, error: 'comm_center setting missing (run comm_center.sql)' };
    try {
      const book = await rebuildBook();
      const read = await pull(s, { rescan: opts.rescan === true });
      const c = await cards(await settings());
      return { ok: true, phoneBook: book, ...read, ...c };
    } catch (e) {
      await saveState({ last_error: String(e && e.message || e).slice(0, 300), last_error_at: iso(nowMs()) }).catch(() => {});
      throw e;
    }
  }

  // ---------- what signed-in staff can ask for ----------
  function cardView(t, book) {
    const who = resolve(book);
    const p = who.person;
    return {
      id: t.id, kind: t.kind, phone10: t.phone10, ref: t.person_ref,
      name: p ? p.name : 'Unknown number', role: p ? (KIND_LABEL[p.kind] || p.kind) : '', detail: p ? p.detail : '',
      candidates: who.state === 'several' ? who.candidates.map(c => ({ ref: c.ref, name: c.name, role: KIND_LABEL[c.kind] || c.kind, detail: c.detail })) : [],
      owner: t.owner || null, need: t.need || null, events: t.events || [], since: t.due_at, updated: t.updated_at,
      contactId: null,
    };
  }
  async function queue() {
    const s = await settings() || {};
    const open = await q(`select * from cds_tasks where area='followup' and done_at is null order by due_at`);
    const out = [];
    for (const t of open) {
      if (t.kind === 'hidden_number') {
        const e = (t.events || [])[0] || {};
        out.push({ id: t.id, kind: t.kind, phone10: null, ref: null, name: 'Hidden number', role: '', detail: '', candidates: [],
          owner: t.owner || null, need: t.need || null, events: t.events || [], since: t.due_at, updated: t.updated_at,
          contactId: e.contactId || null, conversationId: e.conversationId || null });
        continue;
      }
      const v = cardView(t, await bookFor(t.phone10));
      const c = await one(`select ghl_contact_id from cds_comms where phone10=$1 and ghl_contact_id is not null order by at desc limit 1`, [t.phone10]);
      v.contactId = c ? c.ghl_contact_id : null;
      out.push(v);
    }
    const today = iso(nowMs()).slice(0, 10);
    const closedToday = await q(`select id, title, done_by, done_at, closed_reason from cds_tasks where area='followup' and done_at >= $1 order by done_at desc`, [today + 'T05:00:00Z']);
    const match = await one(`select count(*)::int n from cds_tasks where area='match' and done_at is null`);
    return { live: !!s.live, state: s.state || {}, cardsFrom: s.cards_from || null, cards: out, closedToday, caregiverListTodos: match ? match.n : 0 };
  }
  // Calls and texts for a person: every number whose phone book row points at one of these refs.
  // phones: numbers on the record itself, so history shows even before the phone book is rebuilt.
  async function history(refs, extraPhones) {
    refs = (Array.isArray(refs) ? refs : []).map(String).filter(r => /^(lead|consumer|attendant|pool|family):/.test(r)).slice(0, 20);
    const own = [...new Set((Array.isArray(extraPhones) ? extraPhones : []).map(ten).filter(Boolean))].slice(0, 10);
    if (!refs.length && !own.length) return { items: [], phones: [] };
    const fam = refs.map(r => 'family:' + r);
    const phones = (await q(`select distinct phone10, ref, kind, name from cds_phone_book where ref = any($1) or ref = any($2)`, [refs, fam]));
    for (const p of own) if (!phones.some(x => x.phone10 === p)) phones.push({ phone10: p, ref: '', kind: '', name: '' });
    if (!phones.length) return { items: [], phones: [] };
    const items = await q(`select id, channel, direction, at, phone10, status, seconds, answered, voicemail, staff_name, body from cds_comms
      where phone10 = any($1) order by at desc limit 60`, [[...new Set(phones.map(p => p.phone10))]]);
    const whoByPhone = new Map(phones.map(p => [p.phone10, p]));
    return { items: items.map(i => ({ ...i, who: (whoByPhone.get(i.phone10) || {}).name || '', family: ((whoByPhone.get(i.phone10) || {}).kind === 'family') })),
             phones: phones.map(p => ({ phone10: p.phone10, name: p.name, kind: p.kind })) };
  }
  // Phones the office has reached by call or text (the Leads page counts them as called).
  async function reached(sinceIso) {
    return (await q(`select distinct phone10 from cds_comms where at >= $1 and ((direction='outbound' and channel='sms') or (channel='call' and answered))`,
      [sinceIso || iso(nowMs() - 120 * 86400000)])).map(r => r.phone10);
  }
  // Everyone who can be picked for "Who is this?".
  async function people() {
    const rows = await q(`select distinct on (ref) ref, kind, name, detail from cds_phone_book where source='sync' and kind <> 'staff' order by ref, name`);
    const extra = [];
    for (const c of await agency('consumers')) if (c && c.id) extra.push({ ref: 'consumer:' + c.id, kind: 'consumer', name: c.name, detail: '' });
    for (const p of await agency('pipeline')) if (p && p.id) extra.push({ ref: 'lead:' + p.id, kind: 'lead', name: p.name, detail: '' });
    const all = [...new Map([...extra, ...rows].map(r => [r.ref, r])).values()];
    return { people: all.filter(r => r.name).map(r => ({ ref: r.ref, name: r.name, role: KIND_LABEL[r.kind] || r.kind, detail: r.detail || '' }))
      .sort((a, b) => a.name.localeCompare(b.name)) };
  }
  async function pick(email, { phone10, ref, family }) {
    phone10 = ten(phone10);
    if (!phone10) throw new CommsError('That is not a phone number.');
    const by = String(email || '').toLowerCase();
    if (ref === 'ignore') {
      await q(`delete from cds_phone_book where phone10=$1 and source='staff'`, [phone10]);
      await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source, set_by) values ($1, 'ignore', 'ignore', 'Not for CDS', '', 'staff', $2)`, [phone10, by]);
      await q(`update cds_tasks set done_at=now(), done_by=$2, closed_reason='not_cds' where area='followup' and phone10=$1 and done_at is null`, [phone10, by]);
      await audit(by, 'comm_pick', phone10, { ref: 'ignore' });
      return { ok: true };
    }
    if (!/^(lead|consumer|attendant|pool):[A-Za-z0-9-]+$/.test(String(ref || ''))) throw new CommsError('Pick a person from the list.');
    const all = (await people()).people;
    const p = all.find(x => x.ref === ref);
    if (!p) throw new CommsError('That person is not in the hub.');
    const finalRef = family ? 'family:' + ref : ref;
    await q(`delete from cds_phone_book where phone10=$1 and source='staff'`, [phone10]);
    await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source, set_by) values ($1,$2,$3,$4,$5,'staff',$6)`,
      [phone10, finalRef, family ? 'family' : String(ref).split(':')[0] === 'pool' ? 'attendant' : String(ref).split(':')[0], family ? 'Family' : p.name,
       family ? 'Family of ' + p.name : p.detail, by]);
    await q(`update cds_tasks set kind='followup', title=$2, person_ref=$3 where area='followup' and phone10=$1 and done_at is null`, [phone10, family ? 'Family of ' + p.name : p.name, finalRef]);
    await audit(by, 'comm_pick', phone10, { ref: finalRef });
    return { ok: true };
  }
  async function done(email, { id }) {
    email = String(email || '').toLowerCase();
    const t = await one(`select id from cds_tasks where id=$1 and area='followup' and done_at is null`, [String(id || '')]);
    if (!t) throw new CommsError('That follow-up is already closed.');
    await closeTask(t.id, 'marked_done', email, iso(nowMs()));
    await audit(email, 'comm_done', String(id), {});
    return { ok: true };
  }
  async function audit(actor, action, target, detail) {
    await q(`insert into cds_audit (actor, action, target, detail) values ($1, $2, $3, $4::jsonb)`, [actor, action, target, JSON.stringify(detail || {})]);
  }

  async function handle(email, body) {
    const a = String(body && body.action || 'queue');
    if (a === 'queue') return queue();
    if (a === 'history') return history(body.refs, body.phones);
    if (a === 'reached') return { phones: await reached(body.since) };
    if (a === 'people') return people();
    if (a === 'pick') return pick(email, body);
    if (a === 'done') return done(email, body);
    throw new CommsError('Unknown request');
  }
  return { run, rebuildBook, pull, cards, queue, history, reached, people, pick, done, handle, settings };
}

export class CommsError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
