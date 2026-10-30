// Call notes from recorded calls (2026-10-29, her approved mockup 6CxaqzDSJABjRYnGxc6tZg): end to end on a
// local Postgres copy with a fake GoHighLevel, a fake Claude and a fake clock. Nothing leaves this machine.
//   PGLITE=/path/to/pglite/dist/index.js node tests/call_notes_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const C = await import(ROOT + '/supabase/functions/_shared/office/comms.js');
const SW = await import(ROOT + '/supabase/functions/_shared/office/switches.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

// ---------- pure parts ----------
{
  ok(C.transcriptText([{ sentenceIndex: 1, mediaChannel: 2, transcript: 'Hi' }, { sentenceIndex: 0, mediaChannel: 1, transcript: 'CDS, this is Krystal.' }]) ===
    'Speaker 1: CDS, this is Krystal.\nSpeaker 2: Hi', 'transcript pieces in order with speakers');
  ok(C.transcriptText({ transcription: [] }) === '' && C.transcriptText(null) === '', 'no transcript is empty');
  const req = C.noteRequest({ who: 'Ruth Ellis', role: 'Family', detail: 'son, family for Ruth Ellis', day: '2026-10-29', weekday: 'Thursday', direction: 'inbound', staff: 'Krystal', minutes: 6, transcript: 'Speaker 1: hi' });
  ok(req.model === 'claude-opus-5-5' && req.fallbacks === 'default' && req.output_config.effort === 'low' && req.output_config.format.type === 'json_schema', 'model, stand-in, low effort, fixed answer shape');
  ok(!req.tool_choice && !req.thinking && !('temperature' in req), 'no forced tool, no thinking setting, no temperature (all refused by this model)');
  ok(/Thursday, 2026-10-29/.test(req.messages[0].content) && /<transcript>\nSpeaker 1: hi\n<\/transcript>/.test(req.messages[0].content) && /son, family for Ruth Ellis/.test(req.messages[0].content), 'the request carries the day, who, and the transcript');
  ok(/Never use em dashes/.test(req.system) && !/\bAI\b/.test(req.system), 'no em dashes asked for');
  const txt = j => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(j) }] });
  let r = C.cleanNote(txt({ about_person: true, note: 'Mark called for his mom Ruth — she fell twice.', call_back: '2026-10-31', people: [{ name: 'Ana', relation: 'sister', phone: '(816) 555-0140' }] }), '2026-10-29');
  ok(r.note === 'Mark called for his mom Ruth, she fell twice.' && r.followup === '2026-10-31' && r.people[0].phone === '8165550140' && r.about, 'note cleaned: no em dash, date kept, phone digits');
  ok(C.cleanNote(txt({ about_person: true, note: 'x', call_back: '2026-10-01', people: [] }), '2026-10-29').followup === '', 'a call back before the call is dropped');
  ok(C.cleanNote(txt({ about_person: true, note: 'x', call_back: 'Friday', people: [] }), '2026-10-29').followup === '', 'a call back that is not a date is dropped');
  ok(C.cleanNote(txt({ about_person: false, note: 'Wrong number.', call_back: '', people: [] }), '2026-10-29').about === false, 'not about them');
  ok(/declined/.test(C.cleanNote({ stop_reason: 'refusal', content: [] }, '2026-10-29').error), 'a refusal is an error, never a note');
  ok(/could not be read/.test(C.cleanNote({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }, '2026-10-29').error), 'unreadable answer is an error');
  ok(/empty/.test(C.cleanNote(txt({ about_person: true, note: ' ', call_back: '', people: [] }), '2026-10-29').error), 'empty note is an error');
  ok(SW.SWITCHES.some(s => s.key === 'call_notes' && /until someone presses OK/.test(s.does({}))), 'a Call notes switch on the Switches page');
}

// ---------- database ----------
const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));`);
await pg.exec(strip(readFileSync(ROOT + '/comm_center.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/comm_center_step2.sql', 'utf8')));
const NOTES_SQL = strip(readFileSync(ROOT + '/call_notes.sql', 'utf8'));
await pg.exec(NOTES_SQL); await pg.exec(NOTES_SQL);
ok(true, 'call_notes.sql runs twice');
const s0 = (await pg.query(`select value from cds_match_settings where key='call_notes'`)).rows[0].value;
ok(s0.live === false && s0.min_seconds === 60 && !!s0.since, 'starts off, 60 seconds, only calls from now on');
for (const role of ['anon', 'authenticated']) {
  const g = (await pg.query(`select has_table_privilege($1, 'public.cds_call_notes', 'select') s, has_table_privilege($1, 'public.cds_call_notes', 'insert') i`, [role])).rows[0];
  ok(!g.s && !g.i, role + ' cannot read or write call notes');
}
const AG = 'caring-companions-cds';
const put = (k, v) => pg.query(`insert into agency_data (agency_id, data_key, data_value) values ($1,$2,$3::jsonb) on conflict (agency_id, data_key) do update set data_value=excluded.data_value`, [AG, k, JSON.stringify(v)]);
// Ruth's lead: her son Mark called first and is on her Contacts (family calls first, 10-29)
await put('pipeline', [{ id: 'l1', name: 'Ruth Ellis', phone: '', status: 'nurturing', relatedPeople: [{ id: 'rp1', name: 'Mark Ellis', phone: '4175550123', role: 'family', relation: 'son' }] }]);
await put('consumers', [{ id: 'c1', name: 'Walter Briggs', phone: '4175550102', status: 'Active' }]);
await pg.query(`insert into cds_match_settings (key, value) values ('lead_alerts', $1::jsonb) on conflict (key) do update set value=excluded.value`,
  [JSON.stringify({ recipients: [{ name: 'Krystal', email: 'krystal@mo-care.com', phone: '4175550100' }] })]);

const T0 = Date.parse('2026-10-29T15:00:00Z');   // 10am Central
let NOW = T0;
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{since}', to_jsonb($1::text)) where key='call_notes'`, [new Date(T0 - 3600000).toISOString()]);
const convs = new Map(); let n = 0;
const at = mins => new Date(T0 + mins * 60000).toISOString();
function call(phone, mins, secs, status = 'completed', dir = 'inbound') {
  const id = 'cv-' + phone;
  if (!convs.has(id)) convs.set(id, { conv: { id, phone, contactId: 'ct-' + phone }, messages: [] });
  const c = convs.get(id), m = { id: 'k' + (++n), messageType: 'TYPE_CALL', direction: dir, dateAdded: at(mins), userId: 'u-k', meta: { call: { duration: secs, status } } };
  c.messages.push(m); c.conv.lastMessageDate = Math.max(c.conv.lastMessageDate || 0, Date.parse(m.dateAdded));
  return m.id;
}
const TRANSCRIPTS = {}; const aiCalls = []; let aiFail = 0;
const comms = C.createComms({
  db: { query: async (t, p) => ({ rows: (await pg.query(t, p)).rows }) }, now: () => NOW,
  ghl: {
    async users() { return [{ id: 'u-k', name: 'Krystal Smith' }]; },
    async conversations(since) { return [...convs.values()].map(c => c.conv).filter(c => c.lastMessageDate >= since); },
    async messages(id, since) { return convs.get(id).messages.filter(m => Date.parse(m.dateAdded) >= since && Date.parse(m.dateAdded) <= NOW); },
    async transcript(id) { if (!(id in TRANSCRIPTS)) throw new Error('GoHighLevel 404 on /transcription'); return TRANSCRIPTS[id]; },
  },
  ai: async req => {
    aiCalls.push(req);
    if (aiFail > 0) { aiFail--; throw new Error('Claude 529: overloaded'); }
    const wrong = /wrong number/i.test(req.messages[0].content);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ about_person: !wrong, note: wrong ? 'Wrong number.' : 'Mark called for his mom Ruth. She fell twice in October and has Medicaid. Mark will be her attendant. Call back Friday with her DCN.',
      call_back: '2026-10-31', people: wrong ? [] : [{ name: 'Ana Ellis', relation: 'daughter', phone: '' }] }) }] };
  },
});
const rows = async () => (await pg.query(`select * from cds_call_notes order by comm_id`)).rows;
const tick = async mins => { NOW = T0 + mins * 60000; return comms.run(); };
const say = (id, words) => { TRANSCRIPTS[id] = [{ sentenceIndex: 0, mediaChannel: 1, transcript: words }]; };

const mark = call('4175550123', 5, 360);          // Mark, 6 minutes
say(mark, 'Hi, this is Mark, calling about my mom Ruth.');
const short = call('4175550123', 6, 40);          // 40 seconds: too short for a note
say(short, 'Hi again.');
const staff = call('4175550100', 7, 300);         // Krystal from her cell
say(staff, 'Team call.');
const quiet = call('4175550102', 8, 200);         // Walter: no transcript yet
const missed = call('4175550102', 9, 0, 'no-answer');

let r = await tick(20);
ok(r.ok && !('notes' in r) && (await rows()).length === 0, 'switch off: no notes, nothing sent to Claude');
ok(aiCalls.length === 0, 'Claude was not asked');

await pg.query(`update cds_match_settings set value = jsonb_set(value, '{live}', 'true') where key='call_notes'`);
r = await tick(21);
let all = await rows();
const m = all.find(x => x.comm_id === mark);
ok(r.notes === 1 && m && m.status === 'waiting' && m.person_ref === 'family:lead:l1', 'Mark\'s call: a note waiting, filed under Ruth\'s lead');
ok(/Mark called for his mom Ruth/.test(m.note) && String(m.followup).startsWith('2026-10-31') || (m.followup instanceof Date && m.followup.toISOString().startsWith('2026-10-31')), 'note and call back date saved');
ok(m.people[0].name === 'Ana Ellis' && /Hi, this is Mark/.test(m.transcript), 'people heard and the transcript kept');
ok(/Mark Ellis, Family \(son, family for Ruth Ellis\)/.test(aiCalls[0].messages[0].content), 'Claude is told who the caller is to Ruth: ' + aiCalls[0].messages[0].content.split('\n')[2]);
ok(/Thursday, 2026-10-29/.test(aiCalls[0].messages[0].content) && /Krystal Smith for the office/.test(aiCalls[0].messages[0].content), 'call day in Missouri time and who answered');
ok(!all.some(x => x.comm_id === short) && !all.some(x => x.comm_id === missed), 'too short or missed: no note');
ok(all.find(x => x.comm_id === staff).status === 'skipped', 'a call with our own team is never sent to Claude');
ok(!all.some(x => x.comm_id === quiet) && aiCalls.length === 1, 'no transcript yet: waits for the next run');

r = await tick(40);   // 32 minutes after Walter's call, still no transcript
ok((await rows()).find(x => x.comm_id === quiet).status === 'no_transcript', 'no transcript after 30 minutes says so (never quietly missing)');
const st = (await pg.query(`select value->'state' s from cds_match_settings where key='call_notes'`)).rows[0].s;
ok(st.last_no_transcript === 1 && st.last_run, 'the run is counted on the setting');

// Claude down: failed, tried again next run, at most 3 times
const flaky = call('4175550102', 41, 120); say(flaky, 'Walter here, wrong number actually.');
aiFail = 5;
await tick(45); await tick(50); await tick(55); await tick(60);
const f = (await rows()).find(x => x.comm_id === flaky);
ok(f.status === 'failed' && f.attempts === 3 && /529/.test(f.error), 'Claude failing: tried 3 times, then left as failed with the reason');
aiFail = 0;
const wrong = call('4175550102', 61, 120); say(wrong, 'Sorry, wrong number.');
await tick(65);
ok((await rows()).find(x => x.comm_id === wrong).status === 'not_about', 'a wrong number is not about them and never waits');

// ---------- what the hub asks for ----------
const w = await comms.notesWaiting();
ok(w.notes.length === 1 && w.notes[0].comm_id === mark && w.notes[0].ref === 'family:lead:l1' && w.notes[0].who === 'Mark Ellis' && !('transcript' in w.notes[0]), 'waiting list: who it is about now, no transcript in it');
ok(/Hi, this is Mark/.test((await comms.noteTranscript(mark)).transcript), 'the whole call on request');
let threw = ''; try { await comms.noteTranscript(missed); } catch (e) { threw = e.message; }
ok(/no transcript/.test(threw), 'no transcript for a missed call');
const h = await comms.history(['lead:l1'], []);
const hm = h.items.find(i => i.id === mark);
ok(hm && hm.note_status === 'waiting' && /Mark called/.test(hm.note) && hm.has_transcript, 'Calls and texts shows the note is waiting');
threw = ''; try { await comms.noteDecide('krystal@mo-care.com', { id: mark, decision: 'maybe' }); } catch (e) { threw = e.message; }
ok(/Unknown choice/.test(threw), 'only OK or Not about');
ok((await comms.noteDecide('krystal@mo-care.com', { id: mark, decision: 'ok', note: 'Mark called for Ruth — fell twice.', followup: '2026-11-03' })).ok, 'OK with her own words');
const done = (await rows()).find(x => x.comm_id === mark);
ok(done.status === 'ok' && done.final_note === 'Mark called for Ruth, fell twice.' && done.decided_by === 'krystal@mo-care.com', 'saved as OK, her words kept, by whom');
threw = ''; try { await comms.noteDecide('zach@mo-care.com', { id: mark, decision: 'not_about' }); } catch (e) { threw = e.message; }
ok(/already answered/.test(threw), 'two people cannot both answer it');
const h2 = (await comms.history(['lead:l1'], [])).items.find(i => i.id === mark);
ok(h2.note === 'Mark called for Ruth, fell twice.' && h2.note_by === 'krystal@mo-care.com', 'Calls and texts shows the OK\'d words');
ok((await pg.query(`select count(*)::int n from cds_audit where action='call_note_ok'`)).rows[0].n === 1, 'the OK is in the audit log');
ok((await comms.notesWaiting()).notes.length === 0, 'nothing left waiting');

// ---------- the server function and the page ----------
{
  const fn = readFileSync(ROOT + '/supabase/functions/cds-comms/index.ts', 'utf8');
  ok(/'anthropic-beta': 'server-side-fallback-2026-07-01'/.test(fn) && /env\('ANTHROPIC_API_KEY'\)/.test(fn), 'Claude with the stand-in header and the covered key');
  ok(/select 1 from cds_comms where id = \$\{id\} and channel = 'call'/.test(fn) && fn.indexOf("action === 'recording'") > fn.indexOf('admin.auth.getUser'), 'recordings only for signed-in staff, only calls already saved');
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  const a = html.indexOf('// CALL NOTES (2026-10-29'), b = html.indexOf('async function commLoad()');
  ok(a > 0 && b > a && !/—/.test(html.slice(a, b)), 'call note page code: no em dashes');
  ok(/action: 'note_decide', id: commId, decision, note, followup/.test(html) && /fromCall: commId/.test(html), 'OK answers the server first, then puts the note on the lead');
  ok(/cnPanelHtml\(notes\[0\], 'lead', p\)/.test(html) && /cnFor\('consumer', c\.id\)/.test(html), 'the panel on Leads rows, lead profiles and consumer profiles');
  ok(/Nothing is saved until someone presses OK/.test(html) && /call notes are' : ' call notes are|call notes are/.test(html), 'says nothing is saved before OK');
}

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
