// The CDS Coordinator, part 1 (2026-11-17): it listens on both lines and turns calls into promises and suggestions.
// Fake database, fake Claude, fake Caring Companions feed. Made-up people only.   node tests/coordinator_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import(ROOT + '/supabase/functions/_shared/office/coordinator.js');
let pass = 0, failN = 0;
const ok = (c, m, x) => { if (c) pass++; else { failN++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const NOW = Date.parse('2026-11-17T18:00:00Z');   // the fake calls below are from this week

// watch list
const consumers = [{ id: 'C1', name: 'Pat Example', status: 'starting', phone: '(417) 555-0142', cdsStartDate: '2026-11-18', starting: { leadId: 'L1' }, relatedPeople: [{ phone: '417-555-0150' }] },
                   { id: 'C2', name: 'Morgan Active', status: 'active', phone: '4175550111' }];
const pipeline = [{ id: 'L1', name: 'Pat Example', phone: '4175550142', startingId: 'C1' }, { id: 'L2', name: 'Lee Sample', phone: '4175550188', status: 'new' },
                  { id: 'L3', name: 'Gone Lead', phone: '4175550177', status: 'closed_ni' }];
const W = C.watchList(consumers, pipeline, [{ phone: '417-555-0160', consumer_name: 'Pat Example' }]);
ok(W.length === 2 && W[0].id === 'C1' && W[1].id === 'L2', 'watches Starting consumers and open leads only', W.map(x => x.id));
ok(W[0].phones.join() === '4175550142,4175550150,4175550160', 'all of Pat\'s phones: hers, a contact, her attendant', W[0].phones);

// clean extract
const resp = o => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(o) }] });
const good = { about_person: true, summary: 'Pat—moving.', promises: [{ what: 'Text Lee the application', due: '' }], their_word: [{ what: 'Call with the new address', check_on: '2026-11-21' }],
  start_date: { date: '', said_by: 'consumer', note: 'Moving by December 1, will call with the date' }, attendant: { name: 'Lee Example', phone: '(417) 555-0160', email: 'Lee.Example@Example.com', relation: 'son' }, questions: ['Do I need to buy anything?'] };
const x = C.cleanExtract(resp(good), '2026-11-16');
ok(x.summary === 'Pat, moving.', 'no em dashes', x.summary);
ok(x.promises[0].due === '2026-11-16', 'a promise with no day is due the call day');
ok(x.attendant.phone === '4175550160' && x.attendant.email === 'lee.example@example.com', 'attendant phone digits, email lower case', x.attendant);
ok(x.startDate && !x.startDate.date && /December 1/.test(x.startDate.note), 'a start date that is changing, without a new date');
ok(C.cleanExtract(resp(Object.assign({}, good, { attendant: { name: 'Lee', phone: '', email: 'not-an-email', relation: '' } })), '2026-11-16').attendant === null, 'one-word name is not an attendant');
ok(C.cleanExtract({ stop_reason: 'refusal', content: [] }).error, 'refusal is an error');
const items = C.itemsFrom(W[0], { line: 'cc', kind: 'call', id: 'cc:c_1', at: '2026-11-16T17:40:00Z' }, x);
ok(items.map(i => i.kind).join() === 'promise,their_word,start_date,attendant,question', 'items from one call', items.map(i => i.kind));
ok(items.find(i => i.kind === 'promise').status === 'open' && items.find(i => i.kind === 'attendant').status === 'suggested', 'promises open, suggestions wait for the office');
ok(new Set(items.map(i => i.key)).size === items.length && items[0].key.startsWith('consumer:C1:'), 'unique keys, per person');
ok(C.weekLine(items[2], '2026-11-17').t === 'Pat Example: start date is changing, confirm it', 'My Week line', C.weekLine(items[2], '2026-11-17'));

// 2026-11-17 tune: practice records, the person as their own attendant, "Iris D." = "Iris Dorsey", old items off My Week
ok(C.watchList([{ id: 'X', name: 'Example CDS Consumer', status: 'starting' }], [{ id: 'Y', name: 'Test Lead', phone: '4175550101' }], []).length === 0, 'practice records are not watched');
const self = C.itemsFrom(W[0], { line: 'cc', kind: 'call', id: 's', at: '2026-11-16T17:40:00Z' }, Object.assign({}, x, { attendant: { name: 'Pat E.', phone: '', email: '', relation: '' } }));
ok(!self.some(i => i.kind === 'attendant'), 'the person is never their own attendant');
const a1 = C.itemsFrom(W[0], { line: 'cc', kind: 'call', id: 'a', at: '2026-11-16T17:40:00Z' }, Object.assign({}, x, { attendant: { name: 'Iris Dorsey', phone: '', email: '', relation: '' } })).find(i => i.kind === 'attendant');
const a2 = C.itemsFrom(W[0], { line: 'cc', kind: 'call', id: 'b', at: '2026-11-16T17:40:00Z' }, Object.assign({}, x, { attendant: { name: 'Iris D.', phone: '', email: '', relation: '' } })).find(i => i.kind === 'attendant');
ok(a1.key === a2.key, 'Iris D. and Iris Dorsey are one suggestion', [a1.key, a2.key]);
ok(C.weekLine({ kind: 'promise', person_name: 'Pat', data: { what: 'x' }, due: '2026-10-19' }, '2026-11-17') === null, 'a month-old promise stays off My Week');
ok(C.weekLine({ kind: 'promise', person_name: 'Pat', data: { what: 'x' }, due: '2026-11-12' }, '2026-11-17').date === '2026-11-12', 'a promise from this week is on My Week');
ok(/Caring Companions In-Home Senior Care work/.test(C.extractRequest(W[0], { line: 'cc', kind: 'call', id: 'z', at: '2026-11-16T00:00:00Z', summary: 'x' }, '2026-11-17').system), 'Caring Companions shift calls are not CDS');

// a run against a fake database
const DB = { settings: { coordinator: { live: true, per_run: 10 } }, agency: { consumers, pipeline }, packets: [{ phone: '417-555-0160', consumer_name: 'Pat Example' }],
  comms: [{ id: 'm1', channel: 'call', direction: 'inbound', at: '2026-11-17T15:00:00Z', phone10: '4175550142', contact_name: 'Pat', transcript: 'Speaker 1: hi' },
          { id: 'm2', channel: 'sms', direction: 'inbound', at: '2026-11-17T16:00:00Z', phone10: '4175550188', body: 'Lee here, my DCN is coming', contact_name: 'Lee' },
          { id: 'm3', channel: 'call', direction: 'inbound', at: '2026-11-17T15:30:00Z', phone10: '4175559999', transcript: 'not ours' }],
  seen: new Map(), items: [], cal: new Map(), audit: [] };
let nextId = 1;
const db = { async query(t, p = []) {
  if (/from cds_match_settings where key = 'coordinator'/.test(t)) return { rows: [{ value: DB.settings.coordinator }] };
  if (/update cds_match_settings/.test(t)) { Object.assign(DB.settings.coordinator, JSON.parse(p[0])); return { rows: [] }; }
  if (/from agency_data/.test(t)) return { rows: [{ data_value: DB.agency[p[1]] }] };
  if (/from cds_packets/.test(t)) return { rows: DB.packets };
  if (/select source_id from cds_coord_seen/.test(t)) return { rows: [...DB.seen.entries()].filter(([, v]) => v.ok || v.tries >= 3).map(([k]) => ({ source_id: k })) };
  if (/insert into cds_coord_seen/.test(t)) { const cur = DB.seen.get(p[0]); const okv = /values \(\$1, now\(\), true/.test(t); DB.seen.set(p[0], { ok: okv || (cur && cur.ok), tries: (cur ? cur.tries : 0) + 1 }); return { rows: [] }; }
  if (/from cds_comms c/.test(t)) return { rows: DB.comms.filter(r => r.at > p[0] && r.at < p[1] && p[2].includes(r.phone10)) };
  if (/insert into cds_coord_items/.test(t)) { if (DB.items.some(i => i.key === p[0])) return { rows: [] }; const it = { id: nextId++, key: p[0], person_kind: p[1], person_id: p[2], person_name: p[3], kind: p[4], data: JSON.parse(p[5]), source: JSON.parse(p[6]), status: p[7], due: p[8] }; DB.items.push(it); return { rows: [{ id: it.id }] }; }
  if (/from cds_coord_items where status in/.test(t)) return { rows: DB.items.filter(i => ['open', 'suggested'].includes(i.status)) };
  if (/select id from owner_calendar where id like 'i:coord-%'/.test(t)) return { rows: [...DB.cal.keys()].filter(k => k.startsWith('i:coord-')).map(id => ({ id })) };
  if (/insert into owner_calendar/.test(t)) { if (DB.cal.has(p[0])) return { rows: [] }; DB.cal.set(p[0], JSON.parse(p[1])); return { rows: [{ id: p[0] }] }; }
  if (/delete from owner_calendar where id = \$1/.test(t)) { DB.cal.delete(p[0]); return { rows: [] }; }
  if (/delete from owner_calendar/.test(t)) return { rows: [] };
  if (/update cds_coord_items set status/.test(t)) { const it = DB.items.find(i => i.id === p[0]); if (!it) return { rows: [] }; it.status = p[1] === 'open' && ['start_date', 'attendant'].includes(it.kind) ? 'suggested' : p[1]; return { rows: [{ id: it.id, status: it.status }] }; }
  if (/insert into cds_audit/.test(t)) { DB.audit.push(p); return { rows: [] }; }
  if (/from cds_coord_items\s+where/.test(t)) return { rows: DB.items };
  throw new Error('unexpected query ' + t.slice(0, 80));
} };
const asked = [];
const ai = async req => { asked.push(req.messages[0].content); return resp(/Lee here/.test(req.messages[0].content) ? Object.assign({}, good, { promises: [], their_word: [{ what: 'Text the DCN', check_on: '' }], start_date: { date: '', said_by: '', note: '' }, attendant: { name: '', phone: '', email: '', relation: '' }, questions: [] }) : good); };
const ccFeed = async ({ phones, since }) => ({ calls: [{ id: 'c_1', at: '2026-11-14T15:52:00Z', phone10: '4175550142', who: 'Pat E.', summary: 'Gave her son Lee as the caregiver.' }, { id: 'x', at: '2026-11-17T10:00:00Z', phone10: '4175559999', summary: 'not ours' }] });
const coord = C.createCoordinator({ db, ai, ccFeed, nowMs: () => NOW });
let r = await coord.run({ backfill: true });
ok(r.ok && r.read === 3, 'read 3 sources: the CC call, the CDS call, Lee\'s texts', r);
ok(asked.some(a => /Caring Companions line/.test(a)) && asked.some(a => /<summary>/.test(a)) && asked.some(a => /<transcript>/.test(a)), 'both lines, summary and transcript');
ok(!asked.some(a => /not ours/.test(a)), 'never reads numbers not on the list');
ok(DB.items.filter(i => i.person_id === 'C1' && i.kind === 'attendant').length === 1, 'the attendant heard on two calls is one suggestion', DB.items.map(i => i.key));
ok([...DB.cal.values()].some(v => /we promised Text Lee/.test(v.t)), 'promise on My Week', [...DB.cal.values()]);
const before = DB.items.length; r = await coord.run({});
ok(r.read === 0 && DB.items.length === before, 'a second run reads nothing new', r);
const prom = DB.items.find(i => i.kind === 'promise');
await coord.decide('samantha@caringcds.com', { id: prom.id, answer: 'done' });
ok(!DB.cal.has('i:coord-' + prom.id), 'done takes it off My Week');
await coord.decide('samantha@caringcds.com', { id: prom.id, answer: 'undo' });
ok(DB.cal.has('i:coord-' + prom.id) && prom.status === 'open', 'undo puts it back');
const att = DB.items.find(i => i.kind === 'attendant');
await coord.decide('x@y.z', { id: att.id, answer: 'undo' });
ok(att.status === 'suggested', 'undo on a suggestion waits for the office again');
ok(DB.audit.length === 3, 'every answer audited');
DB.settings.coordinator.live = false;
r = await coord.run({});
ok(/off/.test(r.note), 'off does nothing');
DB.settings.coordinator.live = true;
const failing = C.createCoordinator({ db, ai: async () => { throw new Error('Claude 500'); }, ccFeed: async () => { throw new Error('down'); }, nowMs: () => NOW + 864e5 });
DB.comms.push({ id: 'm4', channel: 'call', direction: 'inbound', at: '2026-11-18T15:00:00Z', phone10: '4175550188', transcript: 'x' });
for (let i = 0; i < 4; i++) r = await failing.run({});
ok(r.failed === 0 && DB.seen.get('cds:m4').tries === 3, 'a failing reading is tried 3 times, then left alone', [r, DB.seen.get('cds:m4')]);
ok(/not read/.test(r.cc), 'Caring Companions line failure is said, not silent', r.cc);
ok(!/[—–]/.test(JSON.stringify(DB.items)), 'no em dashes saved');
console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
