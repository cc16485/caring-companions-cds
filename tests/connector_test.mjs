// The CDS Hub connector (2026-11-26): who may use it, every tool on made-up people, nothing sent, the MCP answers.
// node tests/connector_test.mjs
import { createConnector, rpc, TOOLS, longNumber, ToolError, PROTOCOLS } from '../supabase/functions/_shared/office/connector.js';

const NOW = Date.parse('2026-11-26T23:45:00Z');   // Thursday 5:45 PM Missouri
const settings = { switch_owners: ['samantha@mo-care.com', 'samantha@caringcds.com'], staff_emails: ['samantha@caringcds.com', 'katlin@mo-care.com'] };
const agency = {
  pipeline: [
    { id: 'L1', name: 'Ruth Example', phone: '4175550111', county: 'Greene', dob: '1945-03-02', dcn: '12345678', status: 'new',
      relatedPeople: [{ name: 'Ann Example', relation: 'daughter', phone: '4175550122' }], notes: [{ date: '2026-11-24', text: 'Daughter called about CDS' }] },
    { id: 'web-9', name: 'Harold Sample', phone: '', status: 'new', notes: [] } ],
  consumers: [{ id: 'C1', name: 'Linda Testcase', phone: '4175550133', status: 'starting', cdsStartDate: '2026-11-23', starting: { attendantName: 'Marcus Fake' } },
    { id: 'C2', name: 'Joe Madeup', status: 'starting', cdsStartDate: '2026-12-08', starting: { attendantName: 'Kayla Madeup' }, firstShiftPrep: { authWellSky: { at: 'x' } } },
    { id: 'C3', name: 'Pat Nostart', status: 'starting' },
    { id: 'C9', name: 'Example Practice', status: 'starting', cdsStartDate: '2026-12-01' },
    { id: 'C4', name: 'Old Active', status: 'active', cdsStartDate: '2026-01-01' }],
  authorizations: { records: { a1: { consumer: 'Joe Madeup' } } },
  attendants: [],
};
const PACKETS = [{ lead_id: null, consumer_id: 'C2', sent_at: '2026-11-20', signed_at: '2026-11-21', office_signed_at: '2026-11-22', first: 'Joe', last: 'Madeup' }];
const ATT = { attendants: [
  { name: 'Marcus Fake', consumer: 'Linda Testcase', active: false, step1_at: '2026-11-10', next: 'Waiting on the FCSR result from the state',
    table: { cells: { fcsr: { s: 'wait', t: 'Pending at the state' }, edl: { s: 'done' }, oig: { s: 'done' }, fp: { s: 'na', t: 'Not needed' }, invite: { s: 'off' } } } },
  { name: 'Kayla Madeup', consumer: 'Joe Madeup', active: false, step1_at: '2026-11-12', next: 'Send the Empeon invite',
    table: { cells: { fcsr: { s: 'done' }, edl: { s: 'done' }, oig: { s: 'done' }, fp: { s: 'na' }, invite: { s: 'todo' } } } } ] };
let matchCalls = [], matchFail = false;
const matchApi = async (jwt, action) => { matchCalls.push([jwt, action]); if (matchFail) throw new Error('the CDS server answered 500'); return ATT; };
const T = { hub: [], todo: new Map(), items: [], seen: new Map(), msgs: [], cal: new Map(), chats: [
  { lead_id: 'web-9', name: 'Harold Sample', status: 'ready', answers: { consumer_name: 'Harold Sample', consumer_phone: '4175550144', consumer_dob: '1950-01-01', county: 'Christian' }, followup: null, note: '' } ] };
T.todo.set('i:ktcall01', { id: 'i:ktcall01', kind: 'item', data: { who: 'katlin@mo-care.com', n: 3, when: 'days', days: [1, 2, 3, 4, 5], by: 'samantha@mo-care.com', t: 'Call the leads that are ready', how: 'Talk with the consumer.' } });
T.items.push({ id: 1, key: 'consumer:C1:promise:x', person_kind: 'consumer', person_id: 'C1', person_name: 'Linda Testcase', kind: 'promise', data: { what: 'call back about clock-in' }, status: 'open', due: '2026-11-25', source: {}, created_at: '2026-11-24' });
let nextId = 2;
const db = { query: async (t, p = []) => {
  const s = t.replace(/\s+/g, ' ').trim();
  const rows = (r) => ({ rows: r });
  if (/^select key, value from cds_match_settings where key in/.test(s)) return rows(Object.entries(settings).map(([key, value]) => ({ key, value })));
  if (/^select value from cds_match_settings where key = \$1/.test(s)) return rows(p[0] in settings ? [{ value: settings[p[0]] }] : []);
  if (/^select data_value from agency_data/.test(s)) return rows(agency[p[1]] ? [{ data_value: agency[p[1]] }] : []);
  if (/^select lead_id, consumer_id, sent_at, signed_at, office_signed_at/.test(s)) return rows(PACKETS);
  if (/^select id, target_id, target_name, step, by_email, at from cds_hub_updates/.test(s)) return rows(T.hub.filter((u) => !u.applied_at));
  if (/^insert into cds_hub_updates/.test(s)) { const u = { id: T.hub.length + 1, target_id: p[0], target_name: p[1], step: p[2], by_email: p[3], at: new Date(NOW).toISOString() }; T.hub.push(u); return rows([{ id: u.id, at: u.at }]); }
  if (/^update cds_hub_updates set applied_at/.test(s)) { const r = []; T.hub.forEach((u) => { if (p[0].includes(u.id) && !u.applied_at) { u.applied_at = 'now'; u.applied_by = p[1]; r.push({ id: u.id }); } }); return rows(r); }
  if (/^select id, kind, data, updated_at from cds_todo where data->>'who'/.test(s)) return rows([...T.todo.values()].filter((r) => r.data.who === p[0]));
  if (/^select distinct data->>'who'/.test(s)) return rows([]);
  if (/^select data from cds_todo where id = \$1 and kind = 'item'/.test(s)) { const r = T.todo.get(p[0]); return rows(r && r.kind === 'item' ? [r] : []); }
  if (/^insert into cds_todo/.test(s)) { T.todo.set(p[0], { id: p[0], kind: /'item'/.test(s) ? 'item' : 'mark', data: JSON.parse(p[1]) }); return rows([]); }
  if (/^delete from cds_todo where id = \$1$/.test(s)) { T.todo.delete(p[0]); return rows([]); }
  if (/^select lead_id, name, status, answers/.test(s)) return rows(T.chats.filter((c) => ['ready', 'followup', 'handoff'].includes(c.status)));
  if (/^select status, answers, note from cds_lead_chats where lead_id/.test(s)) return rows(T.chats.filter((c) => c.lead_id === p[0]));
  if (/^select answers from cds_lead_chats where lead_id/.test(s)) return rows(T.chats.filter((c) => c.lead_id === p[0]));
  if (/^select id, person_kind, person_id, person_name, kind, data, due::text as due from cds_coord_items/.test(s)) return rows(T.items.filter((i) => ['open', 'suggested'].includes(i.status) && ['promise', 'their_word', 'question', 'concern'].includes(i.kind) && (!i.due || i.due <= p[0])));
  if (/^select kind, data, status, due::text as due, source from cds_coord_items where person_kind/.test(s)) return rows(T.items.filter((i) => i.person_kind === p[0] && i.person_id === p[1]));
  if (/^select source_id, at, summary from cds_coord_seen where person_ref/.test(s)) return rows([...T.seen.values()].filter((x) => x.person_ref === p[0]));
  if (/^insert into cds_coord_seen/.test(s)) { T.seen.set(p[0], { source_id: p[0], at: new Date(NOW).toISOString(), note: p[1], person_ref: p[2], summary: p[3] }); return rows([]); }
  if (/^insert into cds_coord_items/.test(s)) { if (T.items.some((i) => i.key === p[0])) return rows([]); const id = nextId++; T.items.push({ id, key: p[0], person_kind: p[1], person_id: p[2], person_name: p[3], kind: p[4], data: JSON.parse(p[5]), source: JSON.parse(p[6]), status: p[7], due: p[8] }); return rows([{ id }]); }
  if (/^insert into cds_coord_msgs/.test(s)) { const id = nextId++; T.msgs.push({ id, key: p[0], kind: 'check', person_kind: p[1], person_id: p[2], person_name: p[3], to_name: p[4], phone: p[5], body: p[6], status: 'draft' }); return rows([{ id }]); }
  if (/^insert into owner_calendar/.test(s)) { T.cal.set(p[0], { id: p[0], data: JSON.parse(p[1]), by: p[2] }); return rows([]); }
  throw new Error('unexpected sql ' + s);
} };
const c = createConnector({ db, now: () => NOW, matchApi });
let pass = 0, fail = 0;
const ok = (n, cond, d) => { if (cond) pass++; else fail++; console.log(cond ? 'PASS' : 'FAIL', '·', n, cond ? '' : JSON.stringify(d ?? '')); };
const refused = async (fn, status, words) => { try { await fn(); return false; } catch (e) { return e instanceof ToolError && (!status || e.status === status) && (!words || words.test(e.message)); } };
const K = 'Katlin@mo-care.com';

// who
ok('someone not on the office list is refused, and told to ask Samantha', await refused(() => c.call('krystal@mo-care.com', 'tonight', {}), 403, /Ask Samantha/));
ok('no email is refused', await refused(() => c.call('', 'tonight', {}), 401));
ok('an unknown tool is refused', await refused(() => c.call(K, 'close_lead', {}), 404));

// tonight
let r = await c.call(K, 'tonight', {}, { jwt: 'katlin-token' });
ok('tonight is the Missouri day and says so', r.day === '2026-11-26' && /Thursday/.test(r.missouri_now), r);
ok('...her to-do is there with item ids', r.todo.length === 1 && r.todo[0].item_id === 'ktcall01' && !r.todo[0].done);
ok('...the lead who texted and is ready is first, with Medicaid check first', r.calls[0].name === 'Harold Sample' && r.calls[0].medicaid_check_first && r.calls[0].call === '(417) 555-0144', r.calls);
ok('...a late promise brings Linda in', r.calls.some((x) => x.name === 'Linda Testcase' && x.due[0].what.includes('call back about clock-in')), r.calls);
ok('...no date of birth or DCN in the list', !JSON.stringify(r).includes('1950-01-01') && !JSON.stringify(r).includes('12345678'));

// find + person
r = await c.call(K, 'find_person', { search: 'ruth' });
ok('find by name, phone shown only as the last 4', r.found === 1 && r.people[0].id === 'L1' && r.people[0].phone === '…0111', r);
r = await c.call(K, 'find_person', { search: '0133' });
ok('find by the last digits of a phone', r.people.some((x) => x.id === 'C1'));
ok('find needs 2 letters', await refused(() => c.call(K, 'find_person', { search: 'r' })));
r = await c.call(K, 'person', { kind: 'lead', id: 'L1' });
ok('person: the record, family, notes and the Medicaid lookup details', r.name === 'Ruth Example' && r.for_medicaid_check.date_of_birth === '1945-03-02' && r.for_medicaid_check.dcn === '12345678' && r.family_and_contacts[0].relation === 'daughter' && r.hub_notes.length === 1, r);
ok('person: carries the call rules', /consumer themselves/.test(r.rules));
r = await c.call(K, 'person', { kind: 'lead', id: 'web-9' });
ok('person: a texting lead shows what they answered', r.texted_answers.consumer_name === 'Harold Sample' && r.text_status === 'ready' && r.for_medicaid_check.date_of_birth === '1950-01-01', r);
ok('a made-up id is refused', await refused(() => c.call(K, 'person', { kind: 'lead', id: 'nope' }), 404));
ok('a bad kind is refused', await refused(() => c.call(K, 'person', { kind: 'family', id: 'L1' })));

// save_call
r = await c.call(K, 'save_call', { kind: 'lead', id: 'L1', reached: 'talked', talked_with: 'Ruth (the consumer)', summary: 'She said yes to the referral and wants help 5 mornings a week. Granddaughter can start after Dec 8.',
  promises: [{ what: 'put the referral in', due: '2026-11-27' }], their_word: [{ what: 'send the granddaughter the application link' }], questions: ['How many hours will she get?'],
  attendant: { name: 'Kayla Example', phone: '417-555-0100', relation: 'granddaughter' } });
const saved = T.items.filter((i) => i.source && i.source.line === 'night');
ok('save_call: saved, items added', r.saved && r.added_items === 4, r);
ok('...each item marks Katlin as the source, line "night"', saved.length === 4 && saved.every((i) => i.source.who === 'Katlin' && i.source.by === 'katlin@mo-care.com'), saved);
ok('...the promise keeps its date; their word gets a check day a week out', saved.find((i) => i.kind === 'promise').due === '2026-11-27' && saved.find((i) => i.kind === 'their_word').due === '2026-12-03', saved.map((i) => [i.kind, i.due]));
ok('...the attendant is a suggestion with her phone', saved.find((i) => i.kind === 'attendant').status === 'suggested' && saved.find((i) => i.kind === 'attendant').data.phone === '4175550100');
ok('...the summary is on the profile, starting with who she talked with', [...T.seen.values()].some((x) => x.person_ref === 'lead:L1' && /^Talked with Ruth \(the consumer\)\. She said yes/.test(x.summary)), [...T.seen.values()]);
r = await c.call(K, 'save_call', { kind: 'lead', id: 'L1', summary: 'She said yes to the referral.', promises: [{ what: 'put the referral in', due: '2026-11-27' }] });
ok('...saving the same promise again does not make a second one', r.added_items === 0);
ok('save_call refuses a DCN in the words', await refused(() => c.call(K, 'save_call', { kind: 'lead', id: 'L1', summary: 'Her DCN is 12345678' }), 400, /long numbers/));
ok('...but a phone number is fine', (await c.call(K, 'save_call', { kind: 'lead', id: 'L1', summary: 'Call her back at 417-555-0111 tomorrow.' })).saved);
ok('...em dashes are turned into commas', [...T.seen.values()].every((x) => !/—/.test(x.summary)) && (await c.call(K, 'save_call', { kind: 'lead', id: 'L1', summary: 'Left word — she will call' })).saved && [...T.seen.values()].some((x) => /Left word ,/.test(x.summary)));

// medicaid
r = await c.call(K, 'medicaid_checked', { kind: 'lead', id: 'web-9', result: 'active' });
ok('Medicaid active: saved, call now, nothing for Samantha', r.call_now && !r.sent_to_samantha && [...T.seen.values()].some((x) => x.person_ref === 'lead:web-9' && /Medicaid checked by Katlin: Medicaid is active/.test(x.summary)), r);
r = await c.call(K, 'medicaid_checked', { kind: 'lead', id: 'L1', result: 'spend_down', note: 'Spend-down shown this month' });
const concern = T.items.find((i) => i.person_id === 'L1' && i.kind === 'concern');
ok('Medicaid spend-down: goes to Samantha as a concern, do not call', !r.call_now && r.sent_to_samantha && concern && /spend-down/.test(concern.data.text) && /Do not call/.test(concern.data.text), concern);
ok('Medicaid note with a DCN is refused', await refused(() => c.call(K, 'medicaid_checked', { kind: 'lead', id: 'L1', result: 'active', note: 'DCN 12345678' })));
ok('a made-up result is refused', await refused(() => c.call(K, 'medicaid_checked', { kind: 'lead', id: 'L1', result: 'maybe' })));

// draft_text
r = await c.call(K, 'draft_text', { kind: 'lead', id: 'L1', to: 'them', body: 'Hi Ruth, it was good to talk tonight. We will call you Friday about next steps. Caring Companions CDS' });
ok('draft_text: saved as a draft, NOT sent, to her own phone', r.saved_as_draft && r.sent === false && T.msgs[0].status === 'draft' && T.msgs[0].phone === '4175550111' && r.to === 'Ruth Example …0111', r);
r = await c.call(K, 'draft_text', { kind: 'lead', id: 'L1', to: 'family', body: 'Hi Ann, thank you for your help tonight. Caring Companions CDS' });
ok('...to family uses the family contact', T.msgs[1].phone === '4175550122' && T.msgs[1].to_name === 'Ann Example');
r = await c.call(K, 'draft_text', { kind: 'lead', id: 'web-9', body: 'Hi Harold, thank you for texting us back. We will call you soon. Caring Companions CDS' });
ok('...a texting lead with no phone on the record uses the phone they texted', T.msgs[2].phone === '4175550144');
ok('...money in a text is refused', await refused(() => c.call(K, 'draft_text', { kind: 'lead', id: 'L1', body: 'The pay is $16.50 an hour for the attendant.' })));
ok('...a long number in a text is refused', await refused(() => c.call(K, 'draft_text', { kind: 'lead', id: 'L1', body: 'Your DCN 123456789 is on file with us now.' })));

// to-do and end of night
r = await c.call(K, 'todo_check', { item_id: 'ktcall01', done: true });
ok('todo_check: checked off tonight (Missouri day)', r.done && T.todo.has('m:ktcall01@2026-11-26'));
r = await c.call(K, 'todo_add', { title: 'Call Harold back', day: '2026-11-27' });
ok('todo_add: a one-time item on her own list', r.ok && r.data.who === 'katlin@mo-care.com' && r.data.when === 'once');
ok('todo errors come back as tool errors', await refused(() => c.call(K, 'todo_check', { item_id: 'zzzzzzzz', done: true }), 404));
r = await c.call(K, 'end_night', { note: 'Reached Ruth (yes to referral) and Harold (Medicaid active). Need you: Ruth spend-down.' });
const cal = T.cal.get('i:night-katlin-2026-11-26');
ok('end_night: on Samantha\'s My Week for Friday morning', r.sent && cal && cal.data.date === '2026-11-27' && cal.data.t === 'Katlin\'s night (2026-11-26)' && /spend-down/.test(cal.data.note) && cal.data.every === 'once', cal);
ok('nothing was sent anywhere (no sent texts, every message a draft)', T.msgs.every((m) => m.status === 'draft'));

// 2026-11-26: Starting, who needs what (background checks, WellSky) and marking steps done
r = await c.call(K, 'tonight', {}, { jwt: 'katlin-token' });
const sm = r.starting;
ok('tonight has the Starting summary: background checks needed', sm && sm.background_checks_needed.some((x) => x.consumer === 'Linda Testcase' && x.attendant === 'Marcus Fake' && /waiting: Pending at the state/.test(x.checks.FCSR)) && sm.background_checks_needed.some((x) => x.consumer === 'Pat Nostart' && x.attendant === 'not chosen yet'), sm);
ok('...Kayla\'s checks are clear, so Joe is not on the checks list', !sm.background_checks_needed.some((x) => x.consumer === 'Joe Madeup'));
ok('...WellSky setup needed: Joe (start date, authorization in, tasks missing) and Linda', sm.wellsky_setup_needed.some((x) => x.consumer === 'Joe Madeup' && /tasks/.test(x.needs) && !/authorization/.test(x.needs)) && sm.wellsky_setup_needed.some((x) => x.consumer === 'Linda Testcase' && /authorization and tasks/.test(x.needs)), sm.wellsky_setup_needed);
ok('...Pat has no start date or authorization yet, so no WellSky line', !sm.wellsky_setup_needed.some((x) => x.consumer === 'Pat Nostart'));
ok('...the Example record is left out', !JSON.stringify(sm).includes('Example Practice') && sm.starting_count === 3);
ok('...the checks were read with Katlin\'s own sign-in', matchCalls.some(([j, a]) => j === 'katlin-token' && a === 'packetList'));
r = await c.call(K, 'starting', { id: 'C2' }, { jwt: 'katlin-token' });
const joe = r.people[0];
ok('starting: one consumer in full, every step with what, owner, due', r.people.length === 1 && joe.name === 'Joe Madeup' && joe.steps['Consumer packet'].status === 'done' && joe.steps['Referral or PCCP'].what === 'Authorized' && joe.steps['Attendant background checks'].status === 'done', joe.steps);
ok('...the attendant and each check', joe.attendant.name === 'Kayla Madeup' && joe.attendant.checks_clear === true && joe.attendant.background_checks.FCSR === 'done' && joe.attendant.next === 'Send the Empeon invite', joe.attendant);
ok('...WellSky: authorization in, tasks not', joe.wellsky.authorization_in === true && joe.wellsky.tasks_in === false, joe.wellsky);
ok('...the next step (Medicaid comes first: not verified) and days to start', /Medicaid/.test(joe.next) && joe.days_to_start === 12, [joe.next, joe.days_to_start]);
ok('starting: a made-up id is refused', await refused(() => c.call(K, 'starting', { id: 'nope' }, { jwt: 'x' }), 404));
r = await c.call(K, 'starting', {}, { jwt: 'katlin-token' });
ok('starting: soonest start date first, no start date last', r.people.map((x) => x.name).join() === 'Linda Testcase,Joe Madeup,Pat Nostart', r.people.map((x) => x.name));
matchFail = true; r = await c.call(K, 'starting', {}, { jwt: 'katlin-token' }); matchFail = false;
ok('if the checks cannot be read, it says so plainly (no guessing)', /could not be read/.test(r.attendants_note) && r.people.length === 3);
r = await c.call(K, 'mark_step', { id: 'C2', step: 'wellsky_tasks' });
ok('mark_step: saved for the hub to apply, with who', r.marked && r.step === 'WellSky: tasks are in' && T.hub.length === 1 && T.hub[0].by_email === 'katlin@mo-care.com' && T.hub[0].target_id === 'C2');
r = await c.call(K, 'starting', { id: 'C2' }, { jwt: 'katlin-token' });
ok('...and the Starting list shows it done right away (waiting to show in the hub)', r.people[0].wellsky.tasks_in === true && r.people[0].waiting_to_show_in_hub.includes('wellsky_tasks'));
ok('mark_step: an unknown step is refused', await refused(() => c.call(K, 'mark_step', { id: 'C2', step: 'close_lead' })));
ok('mark_step: someone not on Starting is refused', await refused(() => c.call(K, 'mark_step', { id: 'C4', step: 'wellsky_tasks' })));
ok('mark_step: a lead id is refused', await refused(() => c.call(K, 'mark_step', { id: 'L1', step: 'wellsky_tasks' }), 404));

// MCP
const call = (m, params, id = 1) => rpc(c, K, { jsonrpc: '2.0', id, method: m, params });
r = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai' } });
ok('MCP initialize: agrees on the version Claude asks for, offers tools', r.result.protocolVersion === '2025-06-18' && r.result.capabilities.tools && r.result.serverInfo.name === 'caring-companions-cds-hub', r);
r = await call('initialize', { protocolVersion: '1999-01-01' });
ok('...an unknown version gets the newest we know', r.result.protocolVersion === PROTOCOLS[0]);
ok('...a notification gets no answer', (await rpc(c, K, { jsonrpc: '2.0', method: 'notifications/initialized' })) === null);
r = await call('tools/list');
ok('tools/list: the 11 tools, each with a schema', r.result.tools.length === 11 && r.result.tools.every((t) => t.name && t.description && t.inputSchema && t.inputSchema.type === 'object'));
ok('...the read-only ones say so', ['tonight', 'starting', 'find_person', 'person'].every((n) => r.result.tools.find((t) => t.name === n).annotations.readOnlyHint === true));
r = await call('tools/call', { name: 'find_person', arguments: { search: 'linda' } });
ok('tools/call: text and structured answer', !r.result.isError && r.result.structuredContent.people[0].id === 'C1' && JSON.parse(r.result.content[0].text).found === 1);
r = await call('tools/call', { name: 'person', arguments: { kind: 'lead', id: 'nope' } });
ok('tools/call: a refusal comes back as a tool error in plain words', r.result.isError === true && /Use find_person first/.test(r.result.content[0].text), r);
r = await rpc(c, 'stranger@example.com', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'tonight', arguments: {} } });
ok('tools/call by someone not on the list: a tool error, no data', r.result.isError === true && !r.result.structuredContent);
ok('an unknown method is a JSON-RPC error', (await call('sampling/createMessage', {})).error.code === -32601);
ok('a bad request is a JSON-RPC error', (await rpc(c, K, { id: 1 })).error.code === -32600);
ok('ping answers', (await call('ping')).result && true);

// numbers rule
ok('longNumber: DCN and SSN caught, phones allowed', longNumber('12345678') && longNumber('123-45-6789') && !longNumber('(417) 555-0100') && !longNumber('1-417-555-0100') && !longNumber('Dec 8 2026'));
ok('the tool list says nothing is sent', /NOT sent/.test(TOOLS.find((t) => t.name === 'draft_text').description));

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
