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
  ok(/cds-rules\.js\?v=(1[3-9]|[2-9]\d)\b/.test(html), 'the page loads the new rules file (v=13 since close reasons)');
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

// ── close a lead: inactive or spam, and the day they came in (2026-10-22, her ask) ──
{
  ['closed_inactive', 'closed_spam', 'closed_ni', 'closed_other'].forEach(st => {
    const c = R.leadCard({ type: 'lead', status: st, fromWebsite: true, siteLeadId: 's1', addedAt: '2026-10-19T14:00:00Z' }, [], T);
    ok(c.step === 'closed' && c.due === 'Closed: ' + R.CLOSED_LABELS[st], st + ' leaves the steps and says why');
    ok(!c.needsToday, st + ' never needs a call today');
  });
  const spam = { type: 'lead', status: 'closed_spam', fromWebsite: true, siteLeadId: 's9', notes: [form('Who needs care: Yes')] };
  ok(!R.leadWaiting(spam, []), 'a spam website lead is not waiting (no alert, no reminder)');
  ok(!R.siteLeadWaiting({ id: 's9' }, [spam], []), 'and its website row is not waiting either');
  ok(R.cameIn({ fromWebsite: true, addedAt: '2026-10-20T15:00:00Z', firstContact: '2026-10-20' }, T) === 'Came in Oct 20', 'website lead: came in day');
  ok(R.cameIn({ firstContact: '2026-09-02', addedAt: '2026-10-01T15:00:00Z' }, T) === 'Came in Sep 2', 'office lead: the first contact date they typed');
  ok(R.cameIn({ firstContact: '2025-12-30' }, T) === 'Came in Dec 30, 2025', 'last year shows the year');
  ok(R.cameIn({}, T) === '', 'no date, no line');
  ok(R.leadCard({ type: 'lead', status: 'new', firstContact: '2026-10-18' }, [], T).came === 'Came in Oct 18', 'the card carries it');
  ok(R.leadCard({ type: 'lead', status: 'new', firstContact: '2026-10-18' }, [], T).cameIso === '2026-10-18', 'came in as a date for sorting');
  // last contact: the newest call note or logged call; never the form or a Who called tap
  const lc = { siteLeadId: 's9', notes: [form('Who needs care: Yes'), { date: '2026-10-12', text: 'Left a message' }, { date: '2026-10-20', text: 'Who called: For themself', whoCalled: true }] };
  ok(R.lastContactIso(lc, []) === '2026-10-12', 'last contact from the call note: ' + R.lastContactIso(lc, []));
  ok(R.lastContactIso(lc, [{ site_lead_id: 's9', at: '2026-10-16T15:00:00Z' }, { site_lead_id: 'other', at: '2026-10-19T15:00:00Z' }]) === '2026-10-16', 'a logged call counts, only for this lead');
  ok(R.lastContactIso({ notes: [form('x')] }, []) === '', 'never talked to: empty');
  ok(R.leadCard(lc, [], T).lastIso === '2026-10-12', 'the card carries last contact');
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  const m = html.slice(html.indexOf('id="closeLeadModal"'), html.indexOf('id="addPipelineModal"'));
  ['closed_inactive', 'closed_ni', 'closed_other', 'closed_spam'].forEach(st => ok(m.includes("closeLeadAs('" + st + "')"), 'Close offers ' + st));
  ok(/PIPELINE_CLOSED_STATUSES = \['closed_ni','closed_other','closed_inactive','closed_spam'(,'closed_pool')?(,'closed_linked')?\]/.test(html), 'the hub knows all four (and closed_pool, closed_linked)');
  const r = html.slice(html.indexOf('function renderPipeline()'), html.indexOf('function convertToConsumer('));
  ok(r.includes('openCloseLead(') && r.includes('reopenLead(') && r.includes('c.cameIso'), 'rows have Close, Reopen and the came-in date');
  // 10-29: one row per person, sortable by came in and last contact
  // 10-29 later, "match the GHL way, but make better": every heading sorts (a second click flips it),
  // Smart List style tabs with All, a count, pages.
  ok(r.includes('ld-headrow') && ["name", "came", "last", "need"].every(k => r.includes("th('" + k + "'")) && r.includes("onclick=\"ldSortCol(\\'' + key + '\\')\""), 'column headings sort');
  ['need', 'came:desc', 'came:asc', 'last:asc', 'last:desc', 'name:asc'].forEach(k => ok(html.includes('<option value="' + k + '"'), 'Sort menu has ' + k));
  ok(/OLD = \{ new: 'came:desc', old: 'came:asc', quiet: 'last:asc', recent: 'last:desc' \}/.test(html), 'a sort saved with the first menu still works');
  ok(r.includes("{ id: 'all', label: 'All'") && /let _ldStep = 'all';/.test(html), 'an All tab, open by default');
  ok(r.includes("id=\"ldPer\"") && /id="ldPager"/.test(html) && /id="ldCount"/.test(html), 'pages, page size and a count');
  ok(r.includes('_commReachedAt[ph]'), 'last contact counts office-line calls and texts');
  const f = html.slice(html.indexOf('function closeLeadAs('), html.indexOf('function reopenLead('));
  ok(f.includes("p.followup = ''"), 'closing clears the call back date');
  ok(!/fetch|ghl|sendMessage/i.test(f), 'closing sends nothing');
  ok(!/—/.test(m), 'no em dashes in the Close box');
}

// ── calmer Leads list (2026-10-30, her approved mockup 9ReTBpXJ7PwkbreCVSb8te): colour only means "this needs you" ──
{
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  const r = html.slice(html.indexOf('function renderPipeline()'), html.indexOf('function convertToConsumer('));
  const tone = eval(html.match(/const ldCalmTone = (c => [^;]+);/)[1]);
  ok(tone({ tone: 'late' }) === 'now' && tone({ tone: 'today' }) === 'today', 'late is red, today is gold');
  ok(['later', 'none', 'ready', 'closed'].every(t => tone({ tone: t }) === 'wait'), 'everything else can wait (gray)');
  ok(/const ldCalmLive = \(\) => getObj\('leadsCalm'\)\.live === true;/.test(html), 'her switch is agency_data leadsCalm');
  ok(/const ldCalmOn = \(\) => ldCalmLive\(\) \|\| \(ldWhoOwner\(\) && ldCalmPreview\(\)\);/.test(html), 'off for everyone; only an owner can preview');
  ok(/let h = ldCalmSwitchHtml\(\);/.test(html) && /if \(!ldWhoOwner\(\)\) return '';/.test(html.slice(html.indexOf('function ldCalmSwitchHtml'))), 'the switch shows only to owners');
  ok(r.includes("cardsEl.classList.toggle('ld-calm', calm)"), 'the list wears the calm look only while it is on');
  ok(r.includes("(calm ? nameCell :") && r.includes('<span class="ld-av '), 'calm rows have no initials circle; the colourful rows keep theirs');
  ok(r.includes("[c.kind, c.whoLabel, p.fromWebsite ? 'Website' : ''].filter(Boolean).join(' · ')"), 'tags become one gray line of words');
  ok(r.includes("' ldr-' + ct") && r.includes('ldw ldw-'), 'a coloured edge and coloured When words on rows that need you');
  ok(r.includes("(calm ? ' hidden' : '')") && r.includes('class="ld-dots"'), 'Close waits behind ···');
  ok(r.includes('(calm ? calmLine :'), 'the summary line counts need you now, today, can wait');
  ok(['ldCalmSwitch', 'ldCalmPreviewSet'].every(f => !/fetch|ghl|sendMessage/i.test(html.slice(html.indexOf('function ' + f), html.indexOf('function ' + f) + 400))), 'the switch sends nothing');
  ok(!/—/.test(html.slice(html.indexOf('// CALMER LEADS LIST'), html.indexOf('function ldCalmSwitchHtml') + 900)), 'no em dashes');
}

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
