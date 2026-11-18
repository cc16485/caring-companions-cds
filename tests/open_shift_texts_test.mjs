// node tests/open_shift_texts_test.mjs
import { plan, texts, createOpenShiftTexts, keyOf, longKeyOf, joinSplits, isLong, OPEN_HOURS, LONG_FROM } from '../supabase/functions/_shared/office/open-shift-texts.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// 2026-11-17 15:00 UTC = 9:00 AM Central
const NOW = Date.parse('2026-11-17T15:00:00Z');
const consumers = [{ name: 'Mary Smith', phone: '(417) 555-0101', status: 'active' }, { name: 'Old Person', phone: '4175550199', status: 'inactive' }];
const attendants = [{ name: 'Jane Doe', phone: '417-555-0202', status: 'active' }];
const authLogs = { at: '2026-11-17T12:20:00Z', shifts: [
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-16T09:05:00', clockOut: null },     // open 24h: text
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-16T09:05:00', clockOut: null },     // duplicate row
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-17T06:00:00', clockOut: null },     // 3h: still working
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-15T09:00:00', clockOut: '2026-11-15T12:00:00' }, // done
  { consumer: 'Person, Old', attendant: 'Jane Doe', clockIn: '2026-11-15T09:00:00', clockOut: null },     // inactive consumer
  { consumer: 'Nobody, Here', clockIn: '2026-11-15T10:00:00', clockOut: null },                           // unknown, no attendant
] };

const P = plan({ authLogs, consumers, attendants, marks: {}, nowMs: NOW });
ok(P.due.length === 2, 'two shifts due (Mary yesterday, unknown consumer)');
const m = P.due.find(d => d.consumerName === 'Mary Smith');
ok(m && m.to.length === 1 && m.to[0].who === 'consumer' && m.to[0].phone10 === '4175550101', 'consumer only (the consumer is the boss)');
ok(m.to[0].text.includes('Sun, Nov 16') === false && m.to[0].text.includes('Mon, Nov 16'), 'right weekday (Mon Nov 16)');
ok(m.to[0].text.includes('9:05 AM') && m.to[0].text.includes('hub.caringcds.com/evv-form'), 'time and form link');
ok(m.to[0].text.startsWith("Caring Companions CDS: Jane Doe's shift with you"), 'consumer wording');
ok(m.to.every(r => !/[—–]/.test(r.text)), 'no em dashes');
ok(m.to.every(r => r.text.length <= 306), 'short (' + m.to[0].text.length + ' chars)');
const u = P.due.find(d => d.consumerName === 'Here Nobody');
ok(u && u.to.every(r => r.missing), 'unknown consumer: nothing sent, reason kept');
ok(P.skipped.some(s => s.why.includes('8 hours')) && P.skipped.some(s => s.why.includes('not active')), 'still working and inactive skipped');
ok(plan({ authLogs, consumers, attendants, marks: { [keyOf(authLogs.shifts[0])]: { at: 'x' } }, nowMs: NOW }).due.length === 1, 'already texted shift skipped');

// the job
function fakeDb(live, logsAt = authLogs.at) {
  const data = { wellskyCheck: { analytics: { authLogs: Object.assign({}, authLogs, { at: logsAt }) } }, consumers, attendants };
  return { data, query: async (t, p) => {
    if (/from cds_match_settings/.test(t)) return { rows: [{ value: { live } }] };
    if (/select data_key/.test(t)) return { rows: Object.entries(data).filter(([k]) => p[1].includes(k)).map(([k, v]) => ({ data_key: k, data_value: v })) };
    if (/insert into agency_data/.test(t)) { data[p[1]] = JSON.parse(p[2]); return { rows: [] }; }
    throw new Error('unexpected ' + t);
  } };
}
const sent = [];
let db = fakeDb(false);
let J = createOpenShiftTexts({ db, sms: async (...a) => sent.push(a), now: () => NOW });
let r = await J.run();
ok(r.ok && r.practice === 1 && r.sent === 0 && sent.length === 0, 'practice: nothing sent, 1 written');
ok(db.data.openShiftTexts && Object.keys(db.data.openShiftTexts.shifts).length === 2, 'practice marks saved');
r = await J.run(); ok(r.shifts === 0, 'second run texts nothing again');

db = fakeDb(true); J = createOpenShiftTexts({ db, sms: async (...a) => sent.push(a), now: () => NOW });
r = await J.run(); ok(r.sent === 1 && sent.length === 1 && sent[0][0] === '4175550101', 'live: only Mary texted');
db = fakeDb(true); J = createOpenShiftTexts({ db, sms: async () => { throw new Error('boom'); }, now: () => NOW });
r = await J.run(); ok(r.failed === 1 && db.data.openShiftTexts.lastRun.failed === 1, 'failures counted, not silent');

// hours
const NIGHT = Date.parse('2026-11-17T04:00:00Z'); // 10pm Central
db = fakeDb(true); J = createOpenShiftTexts({ db, sms: async (...a) => sent.push(a), now: () => NIGHT });
r = await J.run({ force: true }); ok(r.skipped && /9am/.test(r.skipped), 'live never texts at night, even forced');
db = fakeDb(false); J = createOpenShiftTexts({ db, sms: async (...a) => sent.push(a), now: () => NIGHT });
r = await J.run({ force: true }); ok(r.practice === 1, 'practice can be forced at night');
// stale email
db = fakeDb(true, '2026-11-14T12:00:00Z'); J = createOpenShiftTexts({ db, sms: async (...a) => sent.push(a), now: () => NOW });
r = await J.run(); ok(!r.ok && /too old/.test(r.error), 'old WellSky email: no texts');
ok(texts({ clockIn: '2026-11-16T21:30:00', consumerName: 'A B', attendantName: '' }).consumer.includes('The shift with you') , 'no attendant name wording');

// no attendant column: the roster's one attendant for that consumer
const R = plan({ authLogs: { shifts: [{ consumer: 'Smith, Mary', clockIn: '2026-11-16T09:05:00', clockOut: null }] }, consumers,
  attendants: [{ name: 'Jane Doe', phone: '4175550202', consumer: 'Mary Smith' }], marks: {}, nowMs: NOW });
ok(R.due[0].to.length === 1 && R.due[0].to[0].text.includes("Jane Doe's"), 'attendant name from the roster, in the consumer text');
const R2 = plan({ authLogs: { shifts: [{ consumer: 'Smith, Mary', clockIn: '2026-11-16T09:05:00', clockOut: null }] }, consumers,
  attendants: [{ name: 'Jane Doe', phone: '1', consumer: 'Mary Smith' }, { name: 'Ann Roe', phone: '4175550303', consumer: 'Mary Smith' }], marks: {}, nowMs: NOW });
ok(R2.due[0].to[0].phone10 && R2.due[0].to[0].text.startsWith('Caring Companions CDS: The shift with you'), 'two attendants on the roster: consumer texted without a name');

// her rule: EVV form by Saturday at midnight (NOW = Tue Nov 17 -> Sat, Nov 21)
ok(m.to[0].text.includes('by Sat, Nov 21 at midnight for payroll'), 'names the coming Saturday deadline');
ok(texts({ clockIn: '2026-11-20T09:00:00', consumerName: 'A', attendantName: 'B', sendNaive: '2026-11-21T10:00:00' }).consumer.includes('by Sat, Nov 21 at midnight'), 'sent on a Saturday: that same Saturday');
ok(texts({ clockIn: '2026-11-21T09:00:00', consumerName: 'A', attendantName: 'B', sendNaive: '2026-11-22T10:00:00' }).consumer.includes('by Sat, Nov 28 at midnight'), 'sent on a Sunday: the next Saturday');

// HER RULE 2026-11-17: overnight or over 8 hours = treated like a no clock-out: not paid, consumer texted for the real hours
ok(OPEN_HOURS === 8, 'no clock out: texted after 8 hours (was 12)');
const NOW2 = Date.parse('2026-11-24T15:00:00Z');   // Tue Nov 24, 9 AM Central (after the rule started)
const split = [
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-22T10:51:50', clockOut: '2026-11-22T23:59:59' },
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-23T00:00:00', clockOut: '2026-11-23T09:51:50' },
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-23T13:00:00', clockOut: '2026-11-23T16:00:00' },   // normal
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-21T06:00:00', clockOut: '2026-11-21T15:30:00' },   // 9.5 h same day
  { consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-20T08:00:00', clockOut: '2026-11-20T16:00:00' },   // exactly 8 h: fine
];
const J2 = joinSplits(split);
ok(J2.length === 4 && J2.some(x => x.joined && x.clockIn === '2026-11-22T10:51:50' && x.clockOut === '2026-11-23T09:51:50'), 'midnight halves joined into one 23 h shift');
ok(J2.filter(isLong).length === 2, 'overnight and 9.5 h are long; 3 h and exactly 8 h are not');
const L = plan({ authLogs: { shifts: split }, consumers, attendants, marks: {}, nowMs: NOW2 });
ok(L.due.length === 2 && L.due.every(d => d.kind === 'long'), 'two long-shift texts');
const ov = L.due.find(d => d.clockIn === '2026-11-22T10:51:50');
ok(ov && ov.to[0].text.includes('from 10:51 AM to 9:51 AM on Mon, Nov 23') && ov.to[0].text.includes('(23 hours)'), 'overnight wording with both days and hours: ' + (ov && ov.to[0].text));
ok(ov.to[0].text.includes("aren't paid until we know the real hours worked") && ov.to[0].text.includes('EVV form by Sat, Nov 28 at midnight'), 'asks for the real hours on the EVV form by Saturday');
ok(ov.to.every(r => !/[—–]/.test(r.text)) && ov.to[0].text.length <= 306, 'no em dashes, short (' + ov.to[0].text.length + ' chars)');
const nine = L.due.find(d => d.clockIn === '2026-11-21T06:00:00');
ok(nine && nine.to[0].text.includes('from 6:00 AM to 3:30 PM (9.5 hours)'), 'same-day long shift wording');
ok(plan({ authLogs: { shifts: split }, consumers, attendants, marks: { [longKeyOf(J2.find(x => x.joined))]: { at: 'x' } }, nowMs: NOW2 }).due.length === 1, 'long shift texted once');
ok(plan({ authLogs: { shifts: split }, consumers, attendants, marks: { [keyOf(split[0])]: { at: 'x' } }, nowMs: NOW2 }).due.length === 1, 'already texted as a no clock-out while open: no second text');
// the form link of a long shift is not closed just because it now has a clock out
{ const closed = []; const fixes = { closeFixed: async k => { closed.push(...k); return k.length; }, register: async () => 'https://hub.caringcds.com/evv-form?fix=abc', textResult: async () => {} };
  const db2 = fakeDb(false); db2.data.wellskyCheck.analytics.authLogs.shifts = split;
  db2.data.wellskyCheck.analytics.authLogs.at = '2026-11-24T12:20:00Z';
  const r2 = await createOpenShiftTexts({ db: db2, sms: async () => {}, now: () => NOW2, fixes }).run();
  ok(r2.practice === 2 && !closed.includes(keyOf(split[0])) && !closed.includes(keyOf(split[3])) && closed.includes(keyOf(split[2])), 'long shifts keep their form link open; normal shifts close theirs');
  const rec = db2.data.openShiftTexts.shifts[longKeyOf(J2.find(x => x.joined))];
  ok(rec && rec.kind === 'long' && rec.to[0].text.includes('evv-form?fix=abc'), 'practice record keeps kind and the private link'); }
ok(LONG_FROM === '2026-11-18' && plan({ authLogs: { shifts: [{ consumer: 'Smith, Mary', attendant: 'Jane Doe', clockIn: '2026-11-11T04:26:37', clockOut: '2026-11-11T19:26:37' }] }, consumers, attendants, marks: {}, nowMs: NOW }).due.length === 0, 'long shifts before Nov 18 (already paid and billed) get no text: her word "in the future"');

console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
