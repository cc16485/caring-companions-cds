// The CDS Coordinator's three jobs of 2026-11-18: phones found by name, packets it sends, sign-in asks. Made-up people only.
//   node tests/coordinator_jobs_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = await import(ROOT + '/supabase/functions/_shared/office/coordinator-jobs.js');
const H = await import(ROOT + '/supabase/functions/_shared/office/coordinator-hands.js');
const C = await import(ROOT + '/supabase/functions/_shared/office/coordinator.js');
let pass = 0, failN = 0;
const ok = (c, m, x) => { if (c) pass++; else { failN++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } };
const today = '2026-11-18';
const verified = { checks: [{ at: '2026-11-10T15:00:00Z', status: 'active', pdf: 'x', result: { k: 'ok', label: 'ok' } }] };
const consumers = [
  // like Karen: nothing to reach her by, the lead was saved under the caller
  { id: 'C1', name: 'Pat Sample', status: 'starting', starting: { leadId: 'L1', attendantName: 'Lee Sample', at: '2026-11-15' } },
  { id: 'C2', name: 'Robin Sample', status: 'starting', phone: '(417) 555-0143', starting: { attendantName: 'Ann Sample', referralSent: '2026-11-10' }, medicaid: verified },
  { id: 'C3', name: 'Dana Sample', status: 'starting', phone: '4175550144', starting: { attendantName: 'Andrea', kind: 'move' }, medicaid: verified },
  { id: 'C4', name: 'Morgan Sample', status: 'starting', email: 'morgan@example.com', starting: {} },
  { id: 'C5', name: 'Example CDS Consumer', status: 'starting' },
  { id: 'C6', name: 'Jo Sample', status: 'active', phone: '4175550146' }];
const pipeline = [
  { id: 'L1', name: 'Pat Sample', phone: '', email: '', relatedPeople: [{ name: 'Iris Sample', phone: '417-555-0199' }] },
  { id: 'L9', name: 'Casey Sample', status: 'new' }];
const packets = [{ lead_id: 'consumer-C3', consumer_id: 'C3', sent_at: '2026-11-12T10:00:00Z', signed_at: null, office_signed_at: null, first: 'Dana', last: 'Sample' }];
const onboarding = [];
const heard = [{ id: 7, kind: 'attendant', person_kind: 'consumer', person_id: 'C2', status: 'suggested', data: { name: 'Ann Sample', phone: '4175550160', email: '' } }];
const rows = J.trackRows({ consumers, pipeline, packets, onboarding, roster: [], auths: {}, today });
ok(rows.length === 4 && !rows.some(r => /Example/.test(r.c.name)) && !rows.some(r => r.c.id === 'C6'), 'Starting consumers only, practice records left out', rows.map(r => r.c.name));
const row = id => rows.find(r => r.c.id === id);
ok(row('C1').t.cells.packet.t === 'Send the packet' && row('C3').t.cells.packet.t !== 'Send the packet', 'a sent packet is found the way the profile finds it');
ok(J.leadFor(consumers[0], pipeline).id === 'L1' && J.leadFor(consumers[1], pipeline).id === 'consumer-C2', 'the lead the hub packet card would use');

// Job 2: packets
const P = J.planPackets({ rows, heard });
const keys = P.drafts.map(d => d.key).sort();
ok(keys.includes('packet:C2') && keys.includes('packet:C4') && keys.length === 3, 'packets for the ones with a phone or email', keys);
ok(keys.includes('apppacket:C2:annsample') && P.drafts.find(d => d.kind === 'apppacket').phone === '4175550160', 'the attendant application, with the phone heard on a call', P.drafts);
const p2 = P.drafts.find(d => d.key === 'packet:C2');
ok(p2.data.lead.name === 'Robin Sample' && p2.data.lead.phone === '(417) 555-0143' && p2.data.lead.id === 'consumer-C2' && p2.data.consumer_id === 'C2', 'sent with the consumer record when there is no lead', p2.data);
ok(P.drafts.find(d => d.key === 'packet:C4').data.lead.email === 'morgan@example.com', 'email only is enough for the consumer packet');
ok(J.packetLead({ id: 'X', name: 'Karen Real' }, { id: 'L', name: 'Caller Name', phone: '4175550111' }).name === 'Karen Real', 'the packet always carries the consumer\'s own name, never the caller\'s');
const needs = P.needs.map(n => n.person_id + ':' + n.who).sort();
ok(needs.includes('C1:Pat Sample') && needs.includes('C3:Andrea') && !needs.some(n => n.startsWith('C2')), 'need a phone: Pat for the packet, Andrea for the application', needs);
ok(/last name/.test(P.needs.find(n => n.who === 'Andrea').what), 'one name only: ask for the last name too');
ok(J.planPackets({ rows, heard: [] }).needs.some(n => n.who === 'Ann Sample'), 'no phone heard: a need, not a draft');
ok(!/[—–]/.test(P.drafts.map(d => d.body).join(' ')), 'no em dashes');

// Job 1: phones found by name
const W = J.wantedContacts({ consumers, pipeline, rows, needs: P.needs });
const wk = W.map(w => w.person_kind + ':' + w.person_id + ':' + w.for).sort();
ok(wk.includes('consumer:C1:consumer') && wk.includes('lead:L9:lead') && !wk.includes('consumer:C3:attendant') && !wk.some(w => w.includes('C4')), 'who needs a phone: no phone and no email; one-word attendants cannot be looked up', wk);
const found = J.findContacts({ wanted: W,
  comms: [{ phone10: '4175550199', contact_name: 'Pat Sample', n: 3, last: '2026-11-17' }, { phone10: '4175550177', contact_name: 'Casey Sample', n: 1, last: '2026-11-01' }, { phone10: '4172182888', contact_name: 'Casey Sample', n: 9 }],
  cc: [{ name: 'Pat Sample', people: 1, phones: [{ phone10: '4174502666', calls: 4, last_at: '2026-11-16T20:00:00Z' }], email: 'pat@example.com' },
       { name: 'Casey Sample', people: 2, phones: [{ phone10: '4175550188', calls: 2 }], email: '' }],
  taken: ['4175550199'] });
const fk = found.map(f => f.key).sort();
ok(fk.includes('consumer:C1:contact:4174502666') && found.find(f => f.data.phone === '4174502666').data.where === 'the Caring Companions line', 'Karen\'s case: her own phone, found on the Caring Companions line', found);
ok(!fk.some(k => k.endsWith('4175550199')), 'never the phone of someone else we watch (the caller)');
ok(fk.includes('consumer:C1:contact:pat@example.com'), 'and the email on the Caring Companions record');
ok(fk.includes('lead:L9:contact:4175550177') && !fk.some(k => k.endsWith('4175550188')) && !fk.some(k => k.endsWith('4172182888')), 'a lead from the CDS line; two Caring Companions people with one name: no guess; never our own line', fk);
ok(found.every(f => f.status === 'suggested' && f.kind === 'contact'), 'only suggested, never written to a record');

// Job 3: sign-ins
const S = J.planSignIns(rows);
ok(S.emomed.map(x => x.id).sort().join() === 'C1,C4', 'eMOMED for the ones not verified', S.emomed);
ok(S.fusion.map(x => x.id + (x.transfer ? 't' : '')).sort().join() === 'C1,C3t,C4', 'Fusion: referral, and the transfer for a move', S.fusion);
const w = J.signInWords('fusion', S.fusion, today);
ok(/^Sign-in needed: Fusion/.test(w.subject) && w.html.includes(J.PORTALS.fusion.url) && w.html.includes(J.PORTALS.fusion.transferUrl), 'the email: subject, both clickable links', w.subject);
ok(/after Medicaid is verified/.test(w.text) && /Dana Sample: enter the transfer/.test(w.text), 'says what each one needs');
ok(!/\d{6,}/.test(w.text.replace(/https?:\S+/g, '')) && !/DCN \d|dob|date of birth/i.test(w.text), 'names only, no numbers');
ok(J.signInWords('emomed', S.emomed, today).html.includes('https://www.emomed.com'), 'eMOMED link');

// The 15-minute run against a fake database
const D = { items: [], msgs: [], cal: new Map(), audit: [], settings: { coordinator: { live: true }, packet_sends: { live: false } }, mail: [], packetCalls: [] };
let nid = 1;
const db = { async query(t, p = []) {
  if (/from agency_data/.test(t)) return { rows: [{ data_value: { consumers, pipeline, attendants: [], authorizations: { records: {} } }[p[1]] }] };
  if (/from cds_enroll_packets/.test(t)) return { rows: packets };
  if (/from cds_packets k join attendant_pool/.test(t)) return { rows: onboarding };
  if (/from cds_coord_items where kind in \('attendant','contact'\)/.test(t)) return { rows: heard.concat(D.items) };
  if (/from cds_comms/.test(t)) return { rows: [{ phone10: '4175550177', contact_name: 'Casey Sample', n: 1, last: '2026-11-01' }] };
  if (/select value from cds_match_settings where key = \$1/.test(t)) return { rows: D.settings[p[0]] ? [{ value: D.settings[p[0]] }] : [] };
  if (/insert into cds_coord_items .*'contact'/s.test(t)) { if (D.items.some(i => i.key === p[0])) return { rows: [] }; const it = { id: nid++, key: p[0], kind: 'contact', person_id: p[2], data: JSON.parse(p[4]), status: 'suggested' }; D.items.push(it); return { rows: [{ id: it.id }] }; }
  if (/insert into cds_coord_items .*'need_contact'/s.test(t)) { const x = D.items.find(i => i.key === p[0]); if (x) { if (x.decided_by === 'coordinator') { x.status = 'open'; x.decided_by = null; } return { rows: [] }; } D.items.push({ id: nid++, key: p[0], kind: 'need_contact', person_id: p[1], data: JSON.parse(p[3]), status: 'open' }); return { rows: [] }; }
  if (/from cds_coord_items where kind = 'need_contact' and status = 'open'/.test(t)) return { rows: D.items.filter(i => i.kind === 'need_contact' && i.status === 'open') };
  if (/update cds_coord_items set status = 'done', decided_by = 'coordinator'/.test(t)) { Object.assign(D.items.find(i => i.id === p[0]), { status: 'done', decided_by: 'coordinator' }); return { rows: [] }; }
  if (/insert into cds_coord_msgs/.test(t)) { if (D.msgs.some(m => m.key === p[0])) return { rows: [] }; const m = { id: nid++, key: p[0], kind: p[1], person_id: p[2], to_name: p[4], phone: p[5], body: p[6], status: 'draft', data: JSON.parse(p[7]) }; D.msgs.push(m); return { rows: [{ id: m.id }] }; }
  if (/select id from cds_coord_msgs where status = 'draft' and kind in \('packet','apppacket'\)/.test(t)) return { rows: D.msgs.filter(m => m.status === 'draft').map(m => ({ id: m.id })) };
  if (/select \* from cds_coord_msgs where id/.test(t)) return { rows: D.msgs.filter(m => m.id === p[0]) };
  if (/update cds_coord_msgs set status = 'sent'/.test(t)) { Object.assign(D.msgs.find(m => m.id === p[0]), { status: 'sent', sent_by: p[1] }); return { rows: [] }; }
  if (/update cds_coord_msgs set status = 'skipped'/.test(t)) { Object.assign(D.msgs.find(m => m.id === p[0]), { status: 'skipped', error: p[1] }); return { rows: [] }; }
  if (/update cds_coord_msgs set status = 'failed'/.test(t)) { Object.assign(D.msgs.find(m => m.id === p[0]), { status: 'failed', error: p[1] }); return { rows: [] }; }
  if (/insert into cds_audit/.test(t)) { D.audit.push(p); return { rows: [] }; }
  if (/insert into owner_calendar/.test(t)) { D.cal.set(p[0], JSON.parse(p[1])); return { rows: [] }; }
  if (/delete from owner_calendar/.test(t)) { D.cal.delete(p[0]); return { rows: [] }; }
  if (/from owner_reminders/.test(t)) return { rows: [{ email: 'owner@example.com' }] };
  if (/update cds_match_settings set value = value/.test(t)) { Object.assign(D.settings.coordinator, JSON.parse(p[0])); return { rows: [] }; }
  throw new Error('unexpected query: ' + t.slice(0, 120));
} };
let clock = Date.parse('2026-11-18T15:00:00Z');   // Wednesday 9 AM Central
const send = async m => { D.mail.push(m); };
const packetSend = async (kind, data) => { D.packetCalls.push([kind, data]); return D.packetAnswer || { ok: true, status: 'sent' }; };
const ccNames = async names => ({ found: names.includes('Pat Sample') ? [{ name: 'Pat Sample', people: 1, phones: [{ phone10: '4174502666', calls: 4 }], email: '' }] : [] });
const jobs = J.createJobs({ db, send, packetSend, ccNames, nowMs: () => clock });
let r = await jobs.run(D.settings.coordinator);
ok(!r.contacts.error && !r.packets.error && !r.signins.error, 'one run, no errors', r);
ok(r.contacts.added === 2 && D.items.some(i => i.kind === 'contact' && i.data.phone === '4174502666'), 'found Pat\'s phone (Caring Companions) and Casey\'s (CDS line)', D.items);
ok(D.msgs.length === 3 && D.msgs.every(m => m.status === 'draft') && D.packetCalls.length === 0, 'switch off: three drafts wait for Send, nothing sent', D.msgs);
ok(D.items.filter(i => i.kind === 'need_contact' && i.status === 'open').length === 3, 'need a phone: Pat, Lee and Andrea, on My Week and the 4:30 email', D.items.filter(i => i.kind === 'need_contact'));
ok(D.mail.length === 2 && D.mail.every(m => /^Sign-in needed: /.test(m.subject)) && D.cal.has('i:coordsign-emomed') && D.cal.has('i:coordsign-fusion'), 'one sign-in email per portal, and My Week', D.mail.map(m => m.subject));
ok(D.cal.get('i:coordsign-fusion').t.startsWith('Sign in to Fusion (DSDS): ') && /Katlin/.test(D.cal.get('i:coordsign-fusion').note), 'My Week line names them and Katlin');
r = await jobs.run(D.settings.coordinator);
ok(D.mail.length === 2 && D.msgs.length === 3 && r.contacts.added === 0, 'the next run: nothing twice (no new email, drafts or suggestions)', r);
// Katlin gets the email too
clock += 864e5; D.settings.coordinator.signin_also = ['katlin@example.com', 'bad'];
await jobs.run(D.settings.coordinator);
ok(D.mail.length === 6 && D.mail.slice(2).filter(m => m.email === 'katlin@example.com').length === 2, 'the next day: again, to her and to Katlin (also list)', D.mail.map(m => m.email));
// Weekends and night: no sign-in email
D.settings.coordinator.signin_day = {}; clock = Date.parse('2026-11-21T16:00:00Z');   // Saturday
const before = D.mail.length; await jobs.run(D.settings.coordinator);
ok(D.mail.length === before, 'no sign-in email on a Saturday');
clock = Date.parse('2026-11-19T12:00:00Z');   // Thursday 6 AM Central
await jobs.run(D.settings.coordinator);
ok(D.mail.length === before, 'none before 8 AM');
// Switch on: sent within hours, through the packet code, and never twice
D.settings.packet_sends = { live: true }; clock = Date.parse('2026-11-19T18:00:00Z');
r = await jobs.run(D.settings.coordinator);
ok(r.packets.sent === 3 && D.packetCalls.length === 3 && D.msgs.every(m => m.status === 'sent'), 'switch on: the waiting drafts are sent', r.packets);
ok(D.packetCalls.some(([k, d]) => k === 'packet' && d.lead && d.lead.name === 'Robin Sample') && D.packetCalls.some(([k, d]) => k === 'apppacket' && d.phone === '4175550160' && d.consumer === 'Robin Sample'), 'what the hub buttons send', D.packetCalls);
await jobs.run(D.settings.coordinator);
ok(D.packetCalls.length === 3, 'never twice');
// The hub sent it meanwhile: nothing again, said so
D.msgs.push({ id: 900, key: 'packet:X', kind: 'packet', status: 'draft', data: {} }); D.packetAnswer = { ok: true, already: true };
let x = await jobs.sendPacket(900, 'someone@example.com');
ok(x.ok && D.msgs.find(m => m.id === 900).status === 'skipped' && /Already sent/.test(D.msgs.find(m => m.id === 900).error), 'already sent from the hub: skipped, not sent again');
D.msgs.push({ id: 901, key: 'packet:Y', kind: 'packet', status: 'draft', data: {} }); D.packetAnswer = { ok: true, status: 'held' };
x = await jobs.sendPacket(901, 'someone@example.com');
ok(!x.ok && /switch is off/.test(D.msgs.find(m => m.id === 901).error), 'held by the Enrollment packet texts switch: said out loud');
// Out of hours with the switch on: drafts wait
D.msgs.length = 0; D.packetCalls.length = 0; clock = Date.parse('2026-11-20T03:00:00Z'); delete D.packetAnswer;   // 9 PM Central
await jobs.run(D.settings.coordinator);
ok(D.packetCalls.length === 0 && D.msgs.length === 3 && D.msgs.every(m => m.status === 'draft'), 'at night: drafts wait for the morning');
// A need closes by itself when the phone arrives
consumers[0].phone = '4174502666';
await jobs.run(D.settings.coordinator);
ok(D.items.find(i => i.kind === 'need_contact' && i.person_id === 'C1').status === 'done', 'Pat has a phone now: the need closes by itself');
consumers[0].phone = '';

// The hub's Send on a packet draft goes through the packet code, not as a text
let routed = null;
const hands = H.createHands({ db: { query: async (t, p) => /select \* from cds_coord_msgs where id/.test(t) ? { rows: [{ id: 5, kind: 'packet', status: 'draft', body: 'x' }] } : { rows: [] } }, ai: null, send: async () => { throw new Error('must not text'); }, model: 'm', sendPacket: async (id, by) => { routed = [id, by]; return { ok: true }; } });
x = await hands.sendOne(5, 'office@example.com', 'typed words');
ok(x.ok && routed && routed[0] === 5, 'Send on a packet draft uses the packet code');
// My Week lines
ok(C.weekLine({ kind: 'need_contact', person_name: 'Robin Sample', data: { who: 'Ann Sample', what: 'the attendant application' }, due: today }, today).t === "Need a phone for Ann Sample (Robin Sample's attendant) to send the attendant application", 'My Week: need a phone for X');
ok(/found a phone for Pat Sample/.test(C.weekLine({ kind: 'contact', person_name: 'Pat Sample', data: { name: 'Pat Sample', phone: '4174502666' }, due: today }, today).t), 'My Week: found a phone');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
