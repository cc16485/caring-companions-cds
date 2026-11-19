// The Coordinator and paper (2026-11-18): tax form faxes out, state faxes in. Made-up people only.
//   node tests/coordinator_paper_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(ROOT + '/supabase/functions/_shared/office/coordinator-paper.js');
const C = await import(ROOT + '/supabase/functions/_shared/office/coordinator.js');
const H = await import(ROOT + '/supabase/functions/_shared/office/coordinator-hands.js');
let pass = 0, failN = 0;
const ok = (c, m, x) => { if (c) pass++; else { failN++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };
const form = k => ({ file: k, path: 'C/' + k + '.pdf', name: k + '.pdf' });
const consumers = [
  { id: 'C1', name: 'Pat Sample', status: 'starting', packetForms: [form('IRS-SS-4'), form('MO-2643A'), form('MO-2827')] },                 // no EIN: only the SS-4
  { id: 'C2', name: 'Robin Sample', status: 'active', ein: '12-3456789', packetForms: [form('IRS-SS-4'), form('MO-2643A'), form('MO-2827')] }, // EIN: the two Missouri forms
  { id: 'C3', name: 'Dana Sample', status: 'starting', taxKind: 'transfer', packetForms: [form('IRS-SS-4')] },                              // transfer, EIN not checked: nothing
  { id: 'C4', name: 'Morgan Sample', status: 'starting', ein: '98-7654321', filings: { 'MO-2827': { sentAt: '2026-11-10' } }, packetForms: [form('MO-2643A'), form('MO-2827')] },
  { id: 'C5', name: 'Example Person', status: 'starting', packetForms: [form('IRS-SS-4')] },
  { id: 'C6', name: 'Jo Sample', status: 'closed', packetForms: [form('IRS-SS-4')] }];
const faxes = [{ consumer_id: 'C4', form_key: 'MO-2643A', status: 'delivered' }, { consumer_id: 'C2', form_key: 'MO-2827', status: 'failed' }];
const F = P.planFaxes({ consumers, faxes }).map(d => d.key).sort();
ok(F.join() === 'fax:C1:IRS-SS-4,fax:C2:MO-2643A,fax:C2:MO-2827', 'only what may go: SS-4 without an EIN, Missouri forms with one; a failed fax can go again; nothing twice', F);
ok(!F.some(k => k.includes('C3')), 'a transfer waits for the IRS EIN check (same rule as the button)');
ok(!F.some(k => k.includes('C4')), 'delivered, or marked sent on Tax Setup: never again');
ok(P.faxHours(Date.parse('2026-11-19T15:00:00Z')) && !P.faxHours(Date.parse('2026-11-21T15:00:00Z')) && !P.faxHours(Date.parse('2026-11-19T23:00:00Z')), 'faxes weekdays 8 to 4');

// Reading a state fax
const txt = o => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
let x = P.cleanMail(txt({ from_state: true, kind: 'authorization', person_name: 'Pat Sample', start_date: '2026-12-01', end_date: '2027-05-31', amount: '120 units a month, DCN 12345678', summary: 'DSDS authorized CDS — 120 units.', needs_person: false, note: '' }));
ok(x.fromState && x.kind === 'authorization' && x.start === '2026-12-01' && !/12345678/.test(x.amount) && !/—/.test(x.summary), 'cleaned: dates kept, long numbers left out, no em dashes', x);
ok(P.cleanMail({ content: [{ type: 'text', text: 'junk' }] }).error && P.cleanMail({ stop_reason: 'refusal' }).error, 'unreadable: an error, tried again later');
const pipeline = [{ id: 'L1', name: 'Casey Sample', status: 'new' }];
ok(P.matchPerson('PAT SAMPLE', consumers, pipeline).id === 'C1' && P.matchPerson('Casey Sample', consumers, pipeline).kind === 'lead', 'matched by full name, consumers first, then leads');
ok(!P.matchPerson('Pat', consumers, pipeline) && !P.matchPerson('Jo Sample', consumers, pipeline), 'one name, or a closed consumer: nobody');
ok(!P.matchPerson('Sam Twin', [{ id: 'a', name: 'Sam Twin', status: 'active' }, { id: 'b', name: 'Sam Twin', status: 'starting' }], []), 'two with the same name: never guess');
const fax = { id: 'f1', requested_at: '2026-11-18T20:00:00Z' };
let items = P.mailItems({ kind: 'consumer', id: 'C1', name: 'Pat Sample', start: '' }, fax, x, '2026-11-18');
ok(items.map(i => i.kind).join() === 'start_date,state_doc' && items[0].status === 'suggested' && items[0].data.saidBy === 'state', 'authorization with a start date: Use it waits, plus a note to check', items);
items = P.mailItems({ kind: 'consumer', id: 'C1', name: 'Pat Sample', start: '' }, fax, P.cleanMail(txt({ from_state: true, kind: 'denial', person_name: 'Pat Sample', start_date: '', end_date: '', amount: '', summary: 'Not eligible.', needs_person: true, note: 'call the family, appeal by Dec 5' })), '2026-11-18');
ok(items.length === 1 && items[0].kind === 'concern' && /appeal by Dec 5/.test(items[0].data.text), 'a denial: needs you today');
ok(/a state fax came in/.test(C.weekLine({ kind: 'state_doc', person_name: 'Pat Sample', data: { kind: 'authorization' }, due: '2026-11-18' }, '2026-11-18').t), 'My Week line for a state fax');

// The runs against a fake database
const D = { msgs: [], items: [], seen: new Map(), queued: [], sw: { value: { live: false }, updated_at: '2026-11-18T00:00:00Z' } };
let nid = 1, now = Date.parse('2026-11-19T15:00:00Z'), faxAnswer = null;
const db = { async query(t, p = []) {
  if (/from agency_data/.test(t)) return { rows: [{ data_value: { consumers, pipeline }[p[1]] }] };
  if (/key = 'fax_sends'/.test(t)) return { rows: [D.sw] };
  if (/from cds_fax where direction = 'out'/.test(t)) return { rows: faxes };
  if (/insert into cds_coord_msgs/.test(t)) { if (D.msgs.some(m => m.key === p[0])) return { rows: [] }; const m = { id: nid++, key: p[0], kind: 'fax', person_id: p[1], body: p[4], data: JSON.parse(p[5]), status: 'draft', created_at: new Date(now).toISOString() }; D.msgs.push(m); return { rows: [{ id: m.id }] }; }
  if (/kind = 'fax' and status = 'draft' and created_at >= \$1/.test(t)) return { rows: D.msgs.filter(m => m.status === 'draft' && m.created_at >= p[0]).map(m => ({ id: m.id })) };
  if (/select \* from cds_coord_msgs where id/.test(t)) return { rows: D.msgs.filter(m => m.id === p[0]) };
  if (/update cds_coord_msgs set status = 'sent'/.test(t)) { D.msgs.find(m => m.id === p[0]).status = 'sent'; return { rows: [] }; }
  if (/update cds_coord_msgs set status = 'skipped'/.test(t)) { Object.assign(D.msgs.find(m => m.id === p[0]), { status: 'skipped', error: p[1] }); return { rows: [] }; }
  if (/update cds_coord_msgs set status = 'failed'/.test(t)) { Object.assign(D.msgs.find(m => m.id === p[0]), { status: 'failed', error: p[1] }); return { rows: [] }; }
  if (/insert into cds_audit/.test(t)) return { rows: [] };
  if (/from cds_fax f where f.direction = 'in'/.test(t)) return { rows: [{ id: 'f1', file_path: 'fax/incoming/f1.pdf', requested_at: '2026-11-18T20:00:00Z' }, { id: 'f2', file_path: 'fax/incoming/f2.pdf', requested_at: '2026-11-18T21:00:00Z' }].filter(r => !(D.seen.get('fax:' + r.id) || {}).ok) };
  if (/insert into cds_coord_seen/.test(t)) { D.seen.set(p[0], { ok: /values \(\$1, now\(\), true/.test(t), note: p[1] }); return { rows: [] }; }
  if (/insert into cds_coord_items/.test(t)) { if (D.items.some(i => i.key === p[0])) return { rows: [] }; D.items.push({ key: p[0], kind: p[4], data: JSON.parse(p[5]), status: p[7] }); return { rows: [{ id: 1 }] }; }
  return { rows: [] };
} };
const answers = { 'fax/incoming/f1.pdf': { from_state: true, kind: 'authorization', person_name: 'Robin Sample', start_date: '2026-12-01', end_date: '', amount: '100 units', summary: 'Authorized.', needs_person: false, note: '' },
                  'fax/incoming/f2.pdf': { from_state: false, kind: 'other', person_name: '', start_date: '', end_date: '', amount: '', summary: 'An ad for printer toner.', needs_person: false, note: '' } };
let lastPath = '';
const paper = P.createPaper({ db, model: 'm', nowMs: () => now,
  ai: async req => { ok(req.messages[0].content[0].type === 'document' && req.messages[0].content[0].source.media_type === 'application/pdf', 'the PDF goes to Claude as a document'); return txt(answers[lastPath]); },
  download: async p => { lastPath = p; return new Uint8Array([37, 80, 68, 70]); },
  faxQueue: async (cid, key) => { if (faxAnswer) throw new Error(faxAnswer); D.queued.push(cid + ':' + key); } });
let r = await paper.faxes();
ok(r.made === 3 && r.sent === 0 && D.queued.length === 0 && D.msgs.every(m => m.status === 'draft'), 'switch off: three fax drafts wait for Send', r);
r = await paper.faxes();
ok(r.made === 0, 'never twice');
D.sw = { value: { live: true }, updated_at: '2026-11-18T00:00:00Z' };
r = await paper.faxes();
ok(r.sent === 3 && D.queued.sort().join() === 'C1:IRS-SS-4,C2:MO-2643A,C2:MO-2827', 'switch on, a weekday at 9: queued through the one-click fax code', D.queued);
D.msgs.push({ id: 99, kind: 'fax', status: 'draft', data: { consumer_id: 'C2', form_key: 'MO-2827' } }); faxAnswer = 'This form is already on its way. Wait for the eFax receipt before sending it again.';
let s = await paper.sendFax(99, 'office@example.com');
ok(s.ok && D.msgs.find(m => m.id === 99).status === 'skipped', 'already on its way (the button was pressed): skipped, said so');
D.msgs.push({ id: 100, kind: 'fax', status: 'draft', data: { consumer_id: 'C2', form_key: 'MO-2827' } }); faxAnswer = 'One-click fax is switched off. Use Fax it via eFax instead.';
s = await paper.sendFax(100, 'office@example.com');
ok(!s.ok && /switched off/.test(D.msgs.find(m => m.id === 100).error), 'one-click fax off: says so, nothing sent');
r = await paper.mail();
ok(r.read === 2 && r.added === 2 && r.not_ours === 1, 'two faxes read: the state one became items, the toner ad did not', r);
ok(D.items.some(i => i.kind === 'start_date' && i.data.date === '2026-12-01') && D.items.some(i => i.kind === 'state_doc'), 'Robin: start date to Use, and a note');
r = await paper.mail();
ok(r.read === 0, 'each fax read once');
// The hub's Send on a fax draft goes through the fax code
let routed = null;
const hands = H.createHands({ db: { query: async (t, p) => /select \* from cds_coord_msgs where id/.test(t) ? { rows: [{ id: 7, kind: 'fax', status: 'draft', body: 'x' }] } : { rows: [] } }, ai: null, send: async () => { throw new Error('must not text'); }, model: 'm', sendFax: async (id) => { routed = id; return { ok: true }; } });
s = await hands.sendOne(7, 'office@example.com');
ok(s.ok && routed === 7, 'Send on a fax draft uses the fax code, never a text');
console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
