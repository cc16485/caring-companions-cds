// The automatic OIG exclusion check for CDS attendants (2026-10-21, Samantha: "OIG should run
// itself"). OIG's LEIE file (UPDATED.csv, free, refreshed by the 10th of each month) lists every
// person and business excluded from Medicaid and Medicare. It has no SSNs, so we match by name
// and birth date, and a possible match always goes to a person. This file never clears or fails
// anyone on its own: 'possible_match' means "a person must look", nothing more.
//
// The rules (pure, unit tested):
//   importLeie(csvText)            -> { rows, people }   the people on the list, normalized
//   checkPerson(person, rows)      -> { result, matches } person = { first, last, middle, dob, state }
//     same last name AND (same first name, OR same first initial AND same birth date)
//     a birth date on both sides that is the same makes it 'strong'
//     anything else with the same last and first name is still a possible match
// The database side (createOig): import, checkPerson (same shape, reads the list itself), check, recheckAll.
// Practice: while setting oig_check.live is false nothing becomes an office to-do.
// No em dashes in anything a person reads (her rule).

export const AGENCY_ID = 'caring-companions-cds';
export const LEIE_URL = 'https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv';
export const MIN_PEOPLE = 50000;   // the real file has about 80,000 people; fewer means a bad download
const HEADER = ['LASTNAME', 'FIRSTNAME', 'MIDNAME', 'BUSNAME', 'GENERAL', 'SPECIALTY', 'UPIN', 'NPI', 'DOB',
  'ADDRESS', 'CITY', 'STATE', 'ZIP', 'EXCLTYPE', 'EXCLDATE', 'REINDATE', 'WAIVERDATE', 'WVRSTATE'];
const SUFFIX = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);

// ---------- names and dates ----------
function words(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[’'`.]/g, '').replace(/[^A-Z]+/g, ' ').trim().split(' ').filter(Boolean);
}
// "O'Brien" = OBRIEN, "De La Cruz" = DELACRUZ, "Smith Jr" = SMITH. Hyphenated or two-word last
// names also match on each longer part, so "Smith-Jones" finds SMITH and JONES.
export function lastKeys(last) {
  const w = words(last);
  while (w.length > 1 && SUFFIX.has(w[w.length - 1])) w.pop();
  if (!w.length) return [];
  const keys = new Set([w.join('')]);
  if (w.length > 1) w.filter(x => x.length >= 3).forEach(x => keys.add(x));
  return [...keys];
}
// "Mary Ann" and "MARY" are the same first name; only the first word counts.
export const firstKey = first => words(first)[0] || '';

// 'YYYY-MM-DD' from '1966-02-04', '02/04/1966', '2/4/1966', '19660204' or a Date. Empty or OIG's 0 -> null.
export function isoDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  const s = String(v || '').trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return valid(m[1], m[2], m[3]);
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return valid(m[1], m[2], m[3]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return valid(m[3], m[1].padStart(2, '0'), m[2].padStart(2, '0'));
  return null;
}
function valid(y, mo, d) {
  if (+y < 1900 || +mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return y + '-' + mo + '-' + d;
}

// "Mary Smith", "Smith, Mary J." -> { first, last, middle }
export function splitName(name) {
  const s = String(name || '').trim().replace(/\s+/g, ' ');
  const c = /^([^,]+),\s*(.+)$/.exec(s);
  if (c) { const r = c[2].split(' '); return { first: r[0], middle: r.slice(1).join(' '), last: c[1] }; }
  const p = s.split(' ');
  while (p.length > 2 && SUFFIX.has(words(p[p.length - 1])[0])) p.pop();
  return p.length < 2 ? { first: '', middle: '', last: s } : { first: p[0], middle: p.slice(1, -1).join(' '), last: p[p.length - 1] };
}

// ---------- the file ----------
// A CSV line reader that handles "quoted, fields" and "" inside quotes.
function* csvRows(text) {
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; yield row; row = [];
    } else f += ch;
  }
  if (f || row.length) { row.push(f); yield row; }
}

export function importLeie(csvText) {
  const it = csvRows(String(csvText || '').replace(/^﻿/, ''));
  const head = (it.next().value || []).map(h => h.trim().toUpperCase());
  if (HEADER.some((h, i) => head[i] !== h)) throw new Error('This is not the OIG exclusion file (the column names are different)');
  const rows = [];
  for (const r of it) {
    const last = (r[0] || '').trim();
    if (!last) continue;   // a business, not a person
    const keys = lastKeys(last);
    if (!keys.length) continue;
    rows.push({ last_name: last, first_name: (r[1] || '').trim(), middle_name: (r[2] || '').trim(), dob: isoDate(r[8]),
      city: (r[10] || '').trim(), state: (r[11] || '').trim().toUpperCase(), specialty: (r[5] || '').trim(),
      excl_type: (r[13] || '').trim(), excl_date: isoDate(r[14]), reinstate_date: isoDate(r[15]),
      last_keys: keys, first_key: firstKey(r[1]) });
  }
  return { rows, people: rows.length };
}

// ---------- the match ----------
const titleCase = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const shortDate = iso => iso ? +iso.slice(5, 7) + '/' + +iso.slice(8, 10) + '/' + iso.slice(0, 4) : '';

export function checkPerson(person, rows) {
  const p = person || {};
  const keys = lastKeys(p.last), fk = firstKey(p.first), dob = isoDate(p.dob), state = String(p.state || '').trim().toUpperCase();
  if (!keys.length || !fk) throw new Error('A first and last name are needed to check the OIG list');
  const matches = [];
  for (const r of rows || []) {
    const rk = r.last_keys || lastKeys(r.last_name);
    if (!rk.some(k => keys.includes(k))) continue;
    const rf = r.first_key != null ? r.first_key : firstKey(r.first_name);
    const rdob = r.dob ? isoDate(r.dob) : null;
    const sameFirst = rf === fk;
    const sameDob = !!(dob && rdob && dob === rdob);
    if (!sameFirst && !(sameDob && rf && rf[0] === fk[0])) continue;
    const strength = sameDob ? 'strong' : (dob && rdob) ? 'dob_differs' : 'name';
    const why = sameDob ? (sameFirst ? 'Same name and same birth date' : 'Same last name, first initial and birth date')
      : strength === 'dob_differs' ? 'Same name, different birth date (' + shortDate(rdob) + ')'
      : 'Same name, no birth date to compare';
    matches.push({ strength, why, name: titleCase([r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')),
      dob: rdob, city: titleCase(r.city), state: r.state || '', same_state: !!(state && r.state === state),
      specialty: titleCase(r.specialty), excl_type: r.excl_type || '', excl_date: r.excl_date ? isoDate(r.excl_date) : null,
      reinstate_date: r.reinstate_date ? isoDate(r.reinstate_date) : null });
  }
  const rank = { strong: 0, name: 1, dob_differs: 2 };
  matches.sort((a, b) => rank[a.strength] - rank[b.strength] || (b.same_state - a.same_state) || a.name.localeCompare(b.name));
  return { result: matches.length ? 'possible_match' : 'clear', matches };
}

export class OigError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

// ---------- the database side ----------
// deps: { db: { query(text, params) -> { rows } }, now?: () => ms, fetchList?: () => { text, lastModified }, minPeople?: number }
export function createOig(deps) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const now = () => new Date(deps.now ? deps.now() : Date.now()).toISOString();
  const live = async () => { const r = await one(`select value from cds_match_settings where key='oig_check'`); return !!(r && r.value && r.value.live === true); };
  const latest = () => one(`select id, file_month, finished_at, row_count from cds_oig_runs where status='done' order by finished_at desc limit 1`);

  // A to-do for the office, only when live. One per person per list month (or per failure per day).
  async function todo(title, dedupe) {
    if (!(await live())) return false;
    await q(`insert into cds_tasks (kind, title, due_at, dedupe_key) values ('oig_check', $1, $2, $3) on conflict (dedupe_key) do nothing`, [title, now(), dedupe]);
    return true;
  }
  async function failed(id, error) {
    await q(`update cds_oig_runs set status='failed', finished_at=$2, error=$3 where id=$1`, [id, now(), String(error).slice(0, 500)]);
    await todo('The OIG list did not download this month. Check exclusions.oig.hhs.gov by hand until it is fixed. (' + String(error).slice(0, 120) + ')', 'oig:failed:' + now().slice(0, 10));
  }

  // Load a new list (the text of UPDATED.csv). The old list stays in use until the new one is complete.
  async function importList({ text, fileMonth, force = false } = {}) {
    const month = fileMonth || now().slice(0, 7);
    if (!force) {
      const have = await latest();
      if (have && have.file_month === month) return { ok: true, skipped: 'the ' + month + ' list is already loaded', run_id: have.id, people: have.row_count };
    }
    const run = await one(`insert into cds_oig_runs (started_at, file_month) values ($1, $2) returning id`, [now(), month]);
    let parsed;
    try {
      parsed = importLeie(text);
      if (parsed.people < (deps.minPeople ?? MIN_PEOPLE)) throw new Error('The file has only ' + (parsed.people === 1 ? '1 person' : parsed.people + ' people') + ' on it, so it looks cut off');
      for (let i = 0; i < parsed.rows.length; i += 5000) {
        await q(`insert into cds_oig_leie (run_id, last_name, first_name, middle_name, dob, city, state, specialty, excl_type, excl_date, reinstate_date, last_keys, first_key)
                 select $1, last_name, first_name, middle_name, dob, city, state, specialty, excl_type, excl_date, reinstate_date, last_keys, first_key
                 from jsonb_to_recordset($2::jsonb) as x(last_name text, first_name text, middle_name text, dob date, city text, state text, specialty text,
                   excl_type text, excl_date date, reinstate_date date, last_keys text[], first_key text)`, [run.id, JSON.stringify(parsed.rows.slice(i, i + 5000))]);
      }
    } catch (e) {
      await q(`delete from cds_oig_leie where run_id=$1`, [run.id]);
      await failed(run.id, (e && e.message) || e);
      return { ok: false, run_id: run.id, error: String((e && e.message) || e) };
    }
    await q(`update cds_oig_runs set status='done', finished_at=$2, row_count=$3 where id=$1`, [run.id, now(), parsed.people]);
    await q(`delete from cds_oig_leie where run_id <> $1`, [run.id]);
    return { ok: true, run_id: run.id, file_month: month, people: parsed.people };
  }

  // The scheduled import: download, then load. A failed download is recorded, never silent.
  async function download({ force = false } = {}) {
    let got;
    try { got = await deps.fetchList(); }
    catch (e) {
      const run = await one(`insert into cds_oig_runs (started_at, file_month) values ($1, $2) returning id`, [now(), now().slice(0, 7)]);
      await failed(run.id, (e && e.message) || e);
      return { ok: false, run_id: run.id, error: String((e && e.message) || e) };
    }
    const lm = got.lastModified ? new Date(got.lastModified) : null;
    return importList({ text: got.text, fileMonth: lm && !isNaN(lm) ? lm.toISOString().slice(0, 7) : undefined, force });
  }

  // Same shape as the pure checkPerson, but reads the loaded list itself.
  async function checkPersonDb(person) {
    const run = await latest();
    if (!run) throw new Error('The OIG list is not loaded yet');
    const keys = lastKeys(person && person.last);
    const rows = keys.length ? await q(`select last_name, first_name, middle_name, dob::text dob, city, state, specialty, excl_type, excl_date::text excl_date,
      reinstate_date::text reinstate_date, last_keys, first_key from cds_oig_leie where run_id=$1 and last_keys && $2::text[]`, [run.id, keys]) : [];
    return { ...checkPerson(person, rows), run };
  }

  // people: [{ ref, first, last, middle, dob, state }] (or { ref, name } for "First Last").
  async function check({ people, source = 'check' } = {}) {
    const run = await latest();
    if (!run) {
      await todo('The OIG check could not run: the OIG list is not loaded yet.', 'oig:nolist:' + now().slice(0, 10));
      return { ok: false, error: 'The OIG list is not loaded yet' };
    }
    const isLive = await live();
    const out = [];
    for (const raw of people || []) {
      const p = raw && raw.name && !raw.last ? { ...raw, ...splitName(raw.name) } : (raw || {});
      const ref = String(p.ref || '').trim();
      const name = String(p.name || [p.first, p.last].filter(Boolean).join(' ')).trim();
      if (!ref) { out.push({ ref, name, ok: false, error: 'Each person needs a ref' }); continue; }
      let r;
      try { r = await checkPersonDb(p); }
      catch (e) { out.push({ ref, name, ok: false, error: String((e && e.message) || e) }); continue; }
      const person = { first: p.first || '', middle: p.middle || '', last: p.last || '', dob: isoDate(p.dob), state: String(p.state || '').toUpperCase() };
      await q(`insert into cds_oig_results (person_ref, person, source, run_id, file_month, checked_at, result, matches)
               values ($1, $2::jsonb, $3, $4, $5, $6, $7, $8::jsonb)`,
        [ref, JSON.stringify(person), source, run.id, run.file_month, now(), r.result, JSON.stringify(r.matches)]);
      if (r.result === 'possible_match' && isLive) {
        const strong = r.matches.some(m => m.strength === 'strong');
        await todo('Check the OIG list for ' + name + ': ' + (strong ? 'same name and birth date as someone excluded' : 'same name as someone excluded')
          + '. Look at the OIG entry and decide if it is them.', 'oig:' + ref + ':' + run.file_month);
      }
      out.push({ ref, name, ok: true, result: r.result, matches: r.matches });
    }
    const failedN = out.filter(x => !x.ok).length;
    if (failedN) await todo('The OIG check could not check ' + failedN + (failedN === 1 ? ' person' : ' people') + '. Check them by hand at exclusions.oig.hhs.gov.', 'oig:errors:' + now().slice(0, 10));
    return { ok: true, live: isLive, file_month: run.file_month, checked: out.length, possible: out.filter(x => x.result === 'possible_match').length, failed: failedN, people: out };
  }

  // Every attendant not marked inactive on the hub's Attendants list (read, never written), and
  // everyone who signed Step 1 of the new application (caringcds.com/apply), by their legal name.
  async function recheckAll() {
    const r = await one(`select data_value from agency_data where agency_id=$1 and data_key='attendants'`, [AGENCY_ID]);
    const list = (r && Array.isArray(r.data_value) ? r.data_value : []).filter(a => a && a.status !== 'inactive' && String(a.name || '').trim());
    const pools = await q(`select p.id, p.first_name, p.last_name, s.legal_first, s.legal_middle, s.legal_last, s.dob::text dob, k.answers->>'state' state
      from cds_packets k join attendant_pool p on p.id = k.pool_id left join cds_screening s on s.pool_id = p.id
      where k.step1_signed_at is not null and not coalesce(p.archived, false) order by p.last_name, p.first_name`);
    return check({ source: 'recheck', people: [
      ...list.map(a => ({ ref: 'attendant:' + a.id, name: a.name, ...splitName(a.name), dob: a.dob, state: a.state })),
      ...pools.map(p => ({ ref: 'pool:' + p.id, first: p.legal_first || p.first_name, middle: p.legal_middle || '', last: p.legal_last || p.last_name,
        name: [p.legal_first || p.first_name, p.legal_last || p.last_name].join(' '), dob: p.dob, state: p.state || 'MO' }))] });
  }

  // ---------- the hub (signed-in office) ----------
  // Who may decide a possible match: the Caregiver Match staff list and the switch owners.
  async function staffList() {
    const rows = await q(`select key, value from cds_match_settings where key in ('staff_emails','switch_owners')`);
    return [...new Set(rows.flatMap(r => Array.isArray(r.value) ? r.value : []).map(e => String(e).trim().toLowerCase()))];
  }
  async function mustBeStaff(email) {
    if (!(await staffList()).includes(String(email || '').toLowerCase())) throw new OigError('This sign-in is not on the CDS office staff list.', 403);
  }

  // What the hub card shows: the list month, the last recheck, possible matches nobody has decided,
  // and each person's latest result (so the Roster can count an automatic clear as this month's OIG).
  const ts = v => v == null ? null : new Date(v).toISOString();
  async function officeList(email) {
    await mustBeStaff(email);
    const run = await latest();
    const lastFail = await one(`select started_at, error from cds_oig_runs where status='failed' order by started_at desc limit 1`);
    const recheck = await one(`select max(checked_at) at from cds_oig_results where source='recheck'`);
    const latestRows = await q(`select distinct on (person_ref) id, person_ref, person, result, matches, checked_at, file_month, source, review, reviewed_by, reviewed_at
      from cds_oig_results order by person_ref, checked_at desc`);
    latestRows.forEach(r => { r.checked_at = ts(r.checked_at); r.reviewed_at = ts(r.reviewed_at); });
    const open = latestRows.filter(r => r.result === 'possible_match' && !r.review)
      .sort((a, b) => String(a.checked_at).localeCompare(String(b.checked_at)));
    const people = {};
    for (const r of latestRows) people[r.person_ref] = { result: r.result, review: r.review || null, checked_at: r.checked_at, file_month: r.file_month };
    return { live: await live(),
      list: run ? { file_month: run.file_month, loaded_at: ts(run.finished_at), people: run.row_count } : null,
      failed: lastFail && (!run || ts(lastFail.started_at) > ts(run.finished_at)) ? { at: ts(lastFail.started_at), error: lastFail.error } : null,
      last_recheck: recheck && ts(recheck.at),
      open: open.map(r => ({ id: r.id, ref: r.person_ref, person: r.person, checked_at: r.checked_at, file_month: r.file_month, source: r.source, matches: r.matches })),
      people };
  }

  // A person decides: 'not_them' or 'is_them'. Closes the to-do. For someone from the new
  // application, the decision is also their OIG check (clear or not clear), recorded as that person.
  async function review(email, { id, decision } = {}) {
    await mustBeStaff(email);
    email = String(email).toLowerCase();
    if (!['not_them', 'is_them'].includes(decision)) throw new OigError('Pick Not them or This is them.');
    const r = await one(`select id, person_ref, person, file_month, review from cds_oig_results where id::text=$1 and result='possible_match'`, [String(id || '')]);
    if (!r) throw new OigError('That OIG match was not found. Refresh and try again.', 404);
    if (r.review) throw new OigError('Someone already decided this one. Refresh to see it.', 409);
    const at = now();
    const done = await one(`update cds_oig_results set review=$2, reviewed_by=$3, reviewed_at=$4 where id=$1 and review is null returning id`, [r.id, decision, email, at]);
    if (!done) throw new OigError('Someone already decided this one. Refresh to see it.', 409);
    await q(`update cds_tasks set done_at=$2, done_by=$3 where dedupe_key=$1 and done_at is null`, ['oig:' + r.person_ref + ':' + r.file_month, at, email]);
    const name = [r.person && r.person.first, r.person && r.person.last].filter(Boolean).join(' ');
    if (r.person_ref.startsWith('pool:')) {
      await q(`insert into cds_screening_checks (pool_id, check_key, result, checked_on, note, recorded_by)
               values ($1::uuid, 'oig', $2, (($3::timestamptz) at time zone 'America/Chicago')::date, $4, $5)`,
        [r.person_ref.slice(5), decision === 'not_them' ? 'clear' : 'not_clear', at,
         (decision === 'not_them' ? 'Not them: reviewed the OIG possible match (' : 'This is them: on the OIG exclusion list (') + r.file_month + ')', email]);
    }
    await q(`insert into cds_audit (actor, action, target, detail) values ($1, 'oig_review', $2, $3::jsonb)`,
      [email, r.person_ref, JSON.stringify({ decision, result_id: r.id, file_month: r.file_month })]);
    return { ok: true, decision, ref: r.person_ref, message: decision === 'not_them'
      ? 'Saved. ' + name + ' is not the person on the OIG list.'
      : 'Saved as a match. Someone on the OIG list cannot be paid with Medicaid money, so ' + name + ' cannot work CDS shifts.' };
  }

  async function office(email, body) {
    const action = String((body && body.action) || 'list');
    if (action === 'list') return officeList(email);
    if (action === 'review') return review(email, body);
    throw new OigError('Unknown request');
  }

  return { importList, download, checkPerson: checkPersonDb, check, recheckAll, live, office };
}
