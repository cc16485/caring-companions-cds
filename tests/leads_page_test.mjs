// Leads page (2026-10-21, her mockup): which step each person is in, the
// who-they-are line from the website form, how urgent they are, the Next line,
// and that the page no longer carries the old table, boxes or em dashes.
//   node tests/leads_page_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const T = '2026-10-21';
const form = text => ({ date: '2026-10-20', text, fromForm: true });

// ── which step ──
{
  ok(R.leadCard({ type: 'lead', status: 'new' }, [], T).step === 'call', 'a new lead is To call');
  ok(R.leadCard({ type: 'referral', status: 'nurturing' }, [], T).step === 'call', 'a referral not sent yet is To call');
  ok(R.leadCard({ type: 'referral', status: 'submitted', stateSubmit: '2026-10-14' }, [], T).step === 'state', 'submitted is Sent to state');
  ok(R.leadCard({ type: 'pccp', status: 'processing', stateSubmit: '2026-10-14' }, [], T).step === 'state', 'processing is Sent to state');
  ok(R.leadCard({ type: 'referral', status: 'authorized' }, [], T).step === 'ready', 'approved is Ready to start');
  ok(R.leadCard({ type: 'pccp', status: 'transfer_complete' }, [], T).step === 'ready', 'transfer done is Ready to start');
  ok(R.leadCard({ type: 'referral', status: 'authorized' }, [], T, true).step === 'closed', 'approved and already on Consumers leaves the steps');
  ok(R.leadCard({ type: 'lead', status: 'closed_ni' }, [], T).step === 'closed', 'closed is closed');
}

// ── the website form, as a sentence ──
{
  ok(R.formWho('Who needs care: No, I want to be the paid caregiver\nMedicaid: Not sure') ===
     'Wants to be the paid caregiver for someone. Medicaid not sure.', 'paid caregiver + not sure');
  ok(R.formWho('Who needs care: Yes, I need the care\nMedicaid: Yes, active Medicaid') ===
     'Needs the care themself. Has Medicaid.', 'needs care + Medicaid');
  ok(/They said: "My mom/.test(R.formWho('Who needs care: Yes, I need the care\nThey said: My mom fell last week')), 'their message is kept');
  const c = R.leadCard({ type: 'lead', status: 'new', fromWebsite: true, siteLeadId: 's1', addedAt: '2026-10-21T14:00:00Z',
                        notes: [form('Who needs care: No, I want to be the paid caregiver\nMedicaid: Not sure')] }, [], T);
  ok(c.who === 'Wants to be the paid caregiver for someone. Medicaid not sure.', 'the card uses the form answers');
  ok(R.leadCard({ type: 'lead', status: 'new' }, [], T).who === 'No details yet. Open the profile to add them.', 'nothing known says so');
  ok(/another agency/.test(R.leadCard({ type: 'pccp', status: 'new' }, [], T).who), 'a transfer with no agency name');
  ok(/Sunrise CDS/.test(R.leadCard({ type: 'pccp', status: 'new', leavingAgency: 'Sunrise CDS' }, [], T).who), 'a transfer names the agency');
}

// ── how urgent ──
{
  const web = extra => Object.assign({ type: 'lead', status: 'new', fromWebsite: true, siteLeadId: 's1', notes: [form('Who needs care: Yes, I need the care')] }, extra);
  let c = R.leadCard(web({ addedAt: '2026-10-21T14:00:00Z' }), [], T);
  ok(c.due === 'Not called yet' && c.tone === 'today', 'website lead from today: not called yet, honey');
  c = R.leadCard(web({ addedAt: '2026-10-19T14:00:00Z' }), [], T);
  ok(c.tone === 'late' && c.sort === 0, 'website lead from 2 days ago: red, first');
  c = R.leadCard(web({ addedAt: '2026-10-19T14:00:00Z' }), [{ site_lead_id: 's1' }], T);
  ok(c.due !== 'Not called yet', 'a call logged from the text link counts as called');
  c = R.leadCard({ type: 'lead', status: 'nurturing', followup: '2026-10-19' }, [], T);
  ok(c.due === '2 days late' && c.tone === 'late', 'follow-up 2 days ago');
  c = R.leadCard({ type: 'lead', status: 'nurturing', followup: T }, [], T);
  ok(c.due === 'Due today' && c.tone === 'today', 'follow-up today');
  c = R.leadCard({ type: 'lead', status: 'nurturing', followup: '2026-10-23' }, [], T);
  ok(/^Due Fri, Oct 23$/.test(c.due) && c.tone === 'later', 'follow-up later: ' + c.due);
  c = R.leadCard({ type: 'lead', status: 'nurturing', notes: [{ date: '2026-10-10', text: 'Talked to her son' }] }, [], T);
  ok(c.due === 'No call back date' && /Set a call back date/.test(c.next), 'no follow-up date says so');
  ok(c.who === 'Last note: "Talked to her son"' && !/Last note/.test(c.next), 'with nothing else known, the last note is the who line, once');
  const c2 = R.leadCard({ type: 'pccp', status: 'nurturing', followup: T, notes: [{ date: '2026-10-10', text: 'Wants faster call backs' }] }, [], T);
  ok(/Has CDS now/.test(c2.who) && /Last note: "Wants faster call backs"/.test(c2.next), 'otherwise the last note goes on the Next line');
  ok(c2.needsToday, 'due today needs a call today');
  ok(!R.leadCard({ type: 'referral', status: 'submitted', stateSubmit: '2026-10-07' }, [], T).needsToday, 'day 14 waiting is this week, not today');
  ok(R.leadCard({ type: 'referral', status: 'submitted', stateSubmit: '2026-09-26' }, [], T).needsToday, 'day 25 waiting is today');
  ok(!/Last note/.test(R.leadCard(web({ addedAt: '2026-10-21T14:00:00Z' }), [], T).next), 'the form note is not shown as a call note');
}

// ── waiting on the state ──
{
  const s = d => R.leadCard({ type: 'referral', status: 'submitted', stateSubmit: d }, [], T);
  ok(s('2026-10-14').due === 'Day 7 of waiting' && s('2026-10-14').tone === 'later', 'day 7: nothing to do yet');
  ok(s('2026-10-07').tone === 'today' && /this week/.test(s('2026-10-07').next), 'day 14: check in this week');
  ok(s('2026-09-26').tone === 'late' && /Call DSDS today/.test(s('2026-09-26').next), 'day 25: call DSDS today');
  ok(/^Sent to the state /.test(s('2026-10-07').who), 'the sent date is on the card');
  const m = R.leadCard({ type: 'referral', status: 'submitted' }, [], T);
  ok(m.due === 'Sent date missing', 'no sent date says so');
}

// ── ready ──
{
  const c = R.leadCard({ type: 'referral', status: 'authorized' }, [], T);
  ok(c.tone === 'ready' && /Move them to Consumers/.test(c.next), 'approved: move to Consumers');
}

// ── kinds and copy ──
{
  ok(R.LEAD_KINDS.lead === 'Still deciding' && R.LEAD_KINDS.referral === 'New to CDS - Referral' && R.LEAD_KINDS.pccp === 'Moving from Another Agency - PCCP', 'the three names');
  const all = ['lead', 'referral', 'pccp'].flatMap(type => ['new', 'nurturing', 'submitted', 'authorized', 'closed_ni'].map(status =>
    R.leadCard({ type, status, followup: '2026-10-19', stateSubmit: '2026-10-01' }, [], T)));
  ok(all.every(c => !/—/.test(c.who + c.due + c.next + c.kind)), 'no em dashes on any card');
}

// ── the page ──
{
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  const a = html.indexOf('<div id="csub-pipeline"'), b = html.indexOf('<!-- ── ACTIVE CONSUMERS SUB-SECTION ── -->');
  const page = html.slice(a, b);
  ok(page.includes('id="ldSteps"') && page.includes('id="ldCards"') && page.includes("openModal('addSomeoneModal')"), 'steps, cards and Add someone are there');
  ok(!page.includes('pipelineTable') && !page.includes('STAGES:'), 'the old table and the three big boxes are gone');
  ok(!/—/.test(page), 'no em dashes on the Leads page');
  ok(!html.includes('id="page-statesubmissions"'), 'State Submissions is now the Sent to state step');
  ok(/if \(id === 'statesubmissions'\) \{ _ldStep = 'state'; id = 'pipeline'; \}/.test(html), 'the old #statesubmissions link opens Sent to state');
  const add = html.slice(html.indexOf('id="addSomeoneModal"'), html.indexOf('id="addPipelineModal"'));
  ['lead', 'referral', 'pccp'].forEach(t => ok(add.includes("openAddPipeline('" + t + "')"), 'Add someone offers ' + t));
  ok(/cds-rules\.js\?v=(8|9)\b/.test(html), 'the page loads the new rules file (v=9 since step 2 of Follow-ups)');
  const r = html.slice(html.indexOf('function renderPipeline()'), html.indexOf('function convertToConsumer('));
  ok(!/Packet Sent|Send Welcome/.test(r), 'Welcome and Packet are off the cards');
  ok(/Text the welcome/.test(html) && /Tell them the packet is on its way/.test(html), 'and on the profile');
  // Her wording 10-21: the lead profile asks for Referral or PCCP answers, with a button for each.
  const card = html.slice(html.indexOf('No Referral or PCCP answers yet'), html.indexOf('No Referral or PCCP answers yet') + 900);
  ok(card.includes("openAddPipeline(\\'referral\\'") && card.includes("openAddPipeline(\\'pccp\\'"), 'Referral and PCCP buttons on the lead profile');
  ok(!html.includes('No HCBS-1 answers yet'), 'the old HCBS-1 wording is gone');
  ok(!html.includes('Answers for the HCBS-1'), 'the form title no longer says HCBS-1');
  ok(/pre\.textContent = _plEditId \? 'Referral or PCCP answers:' : 'Add someone:'/.test(html), 'the form title says Referral or PCCP answers');
  ok(/set\('pl_county', p\.county\)/.test(html) && /set\('pl_status', p\.status\)/.test(html), 'the form fills in what Leads already knows');
  ok(/'firstContact','source','status','followup','stateSubmit'/.test(html), 'and keeps those on save');
  ok(/if \(newContact\.notes\.length\) existing\.notes = \(existing\.notes \|\| \[\]\)\.concat\(newContact\.notes\)/.test(html), 'a note typed in the Referral or PCCP form is kept');
  ok(/'pl_hours','pl_notes'\]\.forEach/.test(html), 'the notes box starts empty each time');
  ok((html.match(/New to CDS - Referral/g) || []).length >= 5 && (html.match(/Moving from Another Agency - PCCP/g) || []).length >= 5, 'her two names everywhere');
  ok(/'leavingAgency','whySwitching','readiness','medicaidStatus'/.test(html), 'a lead turned PCCP keeps its transfer answers');
}

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
