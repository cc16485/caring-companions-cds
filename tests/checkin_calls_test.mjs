// node tests/checkin_calls_test.mjs
import { parseResult, concerns, toLog, due, createCheckinCalls, pending, TAG } from '../supabase/functions/_shared/office/checkin-calls.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const R = globalThis.CDSRules;

// ---- the agent's line
const good = 'CHECKIN, who consumer, finished yes, plan yes, hours yes, happy yes, health change no, living change no, complaint no, other help no, notes none';
let p = parseResult(good);
ok(p && p.finished && p.who === 'consumer' && p.plan === 'yes' && p.health === 'no' && p.other === 'no' && p.notes === '', 'reads a clean finished call');
ok(concerns(p).length === 0, 'nothing to follow up');
p = parseResult('CHECKIN, who family, finished yes, plan no, hours unknown, happy yes, health change yes, living change no, complaint no, other help yes, notes fell last week, wants a ride to the doctor, son answered');
ok(p.who === 'family' && p.plan === 'no' && p.hours === '' && p.health === 'yes' && p.other === 'yes', 'family, no, unknown and yes answers');
ok(p.notes === 'fell last week, wants a ride to the doctor, son answered', 'notes keep their commas');
ok(concerns(p).length === 3 && concerns(p).some(x => /DSDS/.test(x)), 'three concerns, DSDS reminder on the health change');
ok(parseResult('Checkin: who: consumer, finished: no, notes: hung up after question 2').finished === false, 'colons and lower case still read; not finished');
ok(parseResult('WAITING FOR THE 2026-12 CHECK-IN CALL') === null && parseResult('') === null && parseResult(null) === null, 'WAITING or empty is not a check-in');

// ---- the saved log has the hub form's shape
const L = toLog(p, '2026-12-01', '2026-12-01T16:00:00Z');
ok(L.method === 'phone' && L.person === 'family' && L.poc === 'no' && L.util === '' && L.health === 'yes' && L.needs === 'yes', 'answers mapped to form fields');
ok(L.healthNotes === p.notes && L.needsNotes === p.notes && L.satNotes === '' && L.dhssFlag === true, 'notes on the yes answers; DHSS flag');
ok(L.auto === 'voice' && /^Automated check-in call/.test(L.notes), 'marked as the automated call');
ok(![...JSON.stringify(L)].some(ch => ch === '—' || ch === '–'), 'no em dashes');

// ---- who gets called
const consumers = [
  { id: 'c1', name: 'Mary Smith', phone: '(417) 555-0101', status: 'active' },
  { id: 'c2', name: 'Old Person', phone: '4175550199', status: 'inactive' },
  { id: 'c3', name: 'New Person', phone: '4175550133', status: 'starting' },
  { id: 'c4', name: 'No Phone', phone: '', status: 'active' },
  { id: 'c5', name: 'Bob Jones', phone: '+1 417 555 0105', status: '' },
];
let D = due(consumers, {});
ok(D.list.map(d => d.id).join() === 'c1,c5', 'active consumers with a phone only (not inactive, not starting)');
ok(D.noPhone.join() === 'No Phone', 'no phone listed');
ok(due(consumers, { c1: { state: 'called' } }).list.map(d => d.id).join() === 'c5', 'already called this month: skipped');

// ---- the job
function fakeDb(live, store = {}) {
  const data = Object.assign({ consumers: JSON.parse(JSON.stringify(consumers)) }, store), tasks = [];
  return { data, tasks, query: async (t, prm) => {
    if (/from cds_match_settings/.test(t)) return { rows: live === null ? [] : [{ value: { live } }] };
    if (/select data_key/.test(t)) return { rows: Object.entries(data).filter(([k]) => prm[1].includes(k)).map(([k, v]) => ({ data_key: k, data_value: JSON.parse(JSON.stringify(v)) })) };
    if (/insert into agency_data/.test(t)) { data[prm[1]] = JSON.parse(prm[2]); return { rows: [] }; }
    if (/insert into cds_tasks/.test(t)) { if (tasks.some(x => x.dedupe === prm[5])) return { rows: [] }; tasks.push({ title: prm[0], phone10: prm[1], ref: prm[2], events: JSON.parse(prm[3]), dedupe: prm[5] }); return { rows: [{ id: tasks.length }] }; }
    throw new Error('unexpected ' + t);
  } };
}
function fakeGhl() {
  const g = { contacts: { '4175550101': 'gh1', '4175550105': 'gh5' }, fields: {}, tags: [], calls: [] };
  g.api = {
    fieldId: async () => 'F1',
    findContact: async ph => g.contacts[ph] || null,
    setField: async (id, f, v) => { g.fields[id] = v; },
    retag: async (id, tag) => { g.tags.push([id, tag]); g.calls.push(id); },
    readField: async id => g.fields[id] || '',
  };
  return g;
}
const DEC1_11AM = Date.parse('2026-12-01T17:00:00Z');   // Tue Dec 1, 11:00 AM Central
const DEC1_8AM = Date.parse('2026-12-01T14:00:00Z');
const DEC9 = Date.parse('2026-12-09T17:00:00Z');

let db = fakeDb(null), g = fakeGhl();
let r = await createCheckinCalls({ db, ghl: g.api, now: () => DEC1_11AM }).run();
ok(!r.ok && /not set up/.test(r.error), 'no switch row: stops, says so');

db = fakeDb(false); g = fakeGhl();
r = await createCheckinCalls({ db, ghl: g.api, now: () => DEC1_11AM }).run();
ok(r.ok && !r.live && r.called === 0 && g.calls.length === 0 && Object.keys(g.fields).length === 0, 'switch off: nobody called, GoHighLevel untouched');
ok(r.wouldCall.join() === 'Mary Smith,Bob Jones', 'switch off: lists who would be called');

db = fakeDb(true); g = fakeGhl();
let J = createCheckinCalls({ db, ghl: g.api, now: () => DEC1_8AM });
r = await J.run(); ok(r.called === 0 && /10am/.test(r.skipped), 'live: not before 10am');

J = createCheckinCalls({ db, ghl: g.api, now: () => DEC1_11AM });
r = await J.run();
ok(r.called === 2 && g.calls.join() === 'gh1,gh5' && g.tags.every(x => x[1] === TAG), 'live on the 1st: Mary and Bob called (tag added)');
ok(g.fields.gh1 === pending('2026-12'), 'field set to WAITING first, so old answers never count');
ok(db.data.checkinCalls.months['2026-12'].c1.state === 'called', 'marked called');
r = await J.run(); ok(r.called === 0 && g.calls.length === 2, 'second run calls nobody again');

// Mary finishes with a concern, Bob never answers
g.fields.gh1 = 'CHECKIN, who consumer, finished yes, plan yes, hours no, happy yes, health change no, living change no, complaint no, other help no, notes attendant has missed two days';
r = await J.run();
ok(r.recorded === 1 && db.data.checkinCalls.months['2026-12'].c1.state === 'recorded', 'Mary recorded');
ok(db.tasks.length === 1 && db.tasks[0].ref === 'consumer:c1' && db.tasks[0].phone10 === '4175550101' && /hours are not on track/.test(db.tasks[0].events[0].text), 'follow-up card for the concern, on Mary');
r = await J.run(); ok(r.recorded === 0 && db.tasks.length === 1, 'recorded once, one card');

// the hub and the 8am email see it as December's call
const cs = JSON.parse(JSON.stringify(consumers));
ok(R.mergeCheckinCalls(cs, db.data.checkinCalls) === 1 && cs[0].contacts['2026-12'].util === 'no', 'merge fills December for Mary');
ok(R.ongoingRequirements(cs[0], new Date('2026-12-10T12:00:00')).monthly.doneThisMonth === true, 'Mary counts as checked in this month');
const own = JSON.parse(JSON.stringify(consumers)); own[0].contacts = { '2026-12': { date: '2026-12-02', method: 'in-person' } };
R.mergeCheckinCalls(own, db.data.checkinCalls);
ok(own[0].contacts['2026-12'].method === 'in-person', "a person's own log for the month is never replaced");

// Bob: nothing after 6 days
J = createCheckinCalls({ db, ghl: g.api, now: () => DEC9 });
r = await J.run();
ok(r.noAnswer === 1 && db.data.checkinCalls.months['2026-12'].c5.state === 'no_answer' && r.called === 0, 'no answer after 6 days: stops looking, no calls after the 7th');

// not finished
db = fakeDb(true); g = fakeGhl(); J = createCheckinCalls({ db, ghl: g.api, now: () => DEC1_11AM });
await J.run(); g.fields.gh5 = 'CHECKIN, who consumer, finished no, notes asked us to call back later';
r = await J.run();
ok(r.notFinished === 1 && db.data.checkinCalls.months['2026-12'].c5.state === 'not_finished', 'unfinished call is not counted');
ok(db.tasks.some(t => t.ref === 'consumer:c5' && /call back later/.test(t.events[0].text)), 'their request still makes a card');

// no GoHighLevel contact, and a failure
db = fakeDb(true); g = fakeGhl(); delete g.contacts['4175550105'];
g.api.retag = async id => { if (id === 'gh1') throw new Error('GoHighLevel 422'); };
r = await createCheckinCalls({ db, ghl: g.api, now: () => DEC1_11AM }).run();
ok(r.noContact === 1 && r.failed === 1 && r.errors[0].includes('Mary Smith') && db.data.checkinCalls.lastRun.failed === 1, 'missing contact and failures are counted, not silent');
ok(!db.data.checkinCalls.months['2026-12'].c1, 'a failed call is tried again next run');

// test call
g = fakeGhl(); const T = createCheckinCalls({ db: fakeDb(false), ghl: g.api, now: () => DEC1_11AM });
r = await T.test('(417) 555-0101'); ok(r.ok && g.calls.join() === 'gh1' && g.fields.gh1 === pending('test'), 'test call works even with the switch off');
g.fields.gh1 = good; r = await T.read('gh1'); ok(r.parsed && r.parsed.finished && !r.waiting, 'test read');
ok((await T.test('123')).ok === false, 'test needs a 10-digit phone');

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
