// Simpler hub (2026-10-21): her month-10 face-to-face rule, the first-shift
// checklist, and that every old hash (live GoHighLevel menu links) still opens
// a real page in the right section.
//   node tests/simpler_hub_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const at = d => new Date(d + 'T12:00:00');

// ── face-to-face: warned at month 10 ──
{
  const c = { id: '1', name: 'Ruth Caldwell', cdsStartDate: '2025-03-01', homeVisits: [{ date: '2025-12-18' }] };
  ok(!R.ongoingRequirements(c, at('2026-10-17')).annual.soon, 'not soon the day before month 10');
  ok(R.ongoingRequirements(c, at('2026-10-18')).annual.soon, 'soon on the month-10 day');
  ok(R.ongoingRequirements(c, at('2026-10-18')).annual.monthTen === '2026-10-18', 'monthTen date');
  ok(R.ongoingRequirements(c, at('2026-12-18')).annual.soon, 'still soon on the due day');
  const late = R.ongoingRequirements(c, at('2026-12-19')).annual;
  ok(late.overdue && !late.soon, 'overdue the day after, and no longer soon');
  ok(!R.ongoingRequirements(c, at('2026-08-20')).annual.soon, 'month 8 is not soon (the old 45-day rule would also say no)');
  ok(R.ongoingRequirements(c, at('2026-10-25')).annual.soon, 'about 54 days left is soon (the old 45-day rule said no)');
  // no visit: counts from the start date
  const n = { id: '2', name: 'New Person', cdsStartDate: '2026-01-10' };
  ok(R.ongoingRequirements(n, at('2026-11-10')).annual.soon, 'no visit yet: month 10 from the start date');
  ok(!R.ongoingRequirements(n, at('2026-11-09')).annual.soon, 'no visit yet: not before month 10');
}

// ── the routine: step 3 names visits in their last 2 months ──
{
  const consumers = [{ id: '1', name: 'Ruth Caldwell', cdsStartDate: '2025-03-01', homeVisits: [{ date: '2025-12-18' }], contacts: { '2026-10': { at: 'x' } } }];
  const steps = R.dailyRoutine({ consumers, pipeline: [] }, at('2026-10-21'));
  ok(steps.length === 4, 'the server (no firstShiftOf) still gets four steps');
  const s3 = steps.find(s => s.n === 3);
  ok(s3.items.some(i => /face-to-face visit in the last 2 months, book it now/.test(i.t)), 'step 3 has the 2-months-left line');
  ok(!s3.items.some(i => i.bad && /last 2 months/.test(i.t)), '2-months-left is not red');
}

// ── first-shift checklist ──
{
  const newId = String(Date.parse('2026-10-22T15:00:00Z'));
  const oldId = String(Date.parse('2026-01-05T15:00:00Z'));
  const c = { id: newId, name: 'Gus Tolliver', cdsStartDate: '2026-10-27' };
  let p = R.firstShiftPrep(c, null);
  ok(p.applies && p.total === 6 && p.done === 0 && !p.ready, 'a new consumer gets the 6-step checklist');
  ok(p.steps.filter(s => s.beforeStart).map(s => s.k).join() === 'authWellSky,tasksWellSky', 'WellSky steps are marked before the start date');
  ok(!R.firstShiftPrep({ id: oldId, name: 'Old One', cdsStartDate: '2025-01-01' }, null).applies, 'an existing consumer is left alone');
  ok(R.firstShiftPrep({ id: oldId, name: 'Old One', firstShiftPrep: {} }, null).applies, 'unless the office started a checklist');
  const all = {}; R.PREP_STEPS.forEach(s => { all[s.k] = { at: 'x' }; });
  p = R.firstShiftPrep(Object.assign({}, c, { firstShiftPrep: all }), null);
  ok(p.ready && p.done === 6, 'all six ticked is ready');
  p = R.firstShiftPrep(c, '2026-10-27');
  ok(!p.late && !p.needsReason, 'first shift on the start date is not late');
  p = R.firstShiftPrep(c, '2026-10-30');
  ok(p.late && p.needsReason, 'first shift after the start date needs a reason');
  p = R.firstShiftPrep(Object.assign({}, c, { lateStart: { reason: 'Waiting on FCSR' } }), '2026-10-30');
  ok(p.late && !p.needsReason, 'a saved reason clears it');
  ok(R.LATE_REASONS.includes('Waiting on FCSR') && R.LATE_REASONS.includes('Other'), 'reasons list');

  const steps = R.dailyRoutine({ consumers: [c], pipeline: [], firstShiftOf: () => null }, at('2026-10-21'));
  const s5 = steps.find(s => s.n === 5);
  ok(s5 && s5.items.length === 1 && /not ready for the first shift/.test(s5.items[0].t), 'Today step 5: not ready');
  ok(!s5.items[0].bad, 'not red before the start date');
  const s5late = R.dailyRoutine({ consumers: [c], pipeline: [], firstShiftOf: () => null }, at('2026-10-28')).find(s => s.n === 5);
  ok(s5late.items[0].bad, 'red once the start date has passed');
  const s5why = R.dailyRoutine({ consumers: [c], pipeline: [], firstShiftOf: () => '2026-10-30' }, at('2026-10-31')).find(s => s.n === 5);
  ok(s5why.items.length === 1 && /late start needs a reason/.test(s5why.items[0].t) && s5why.items[0].bad, 'Today step 5: late start needs a reason');
  const s5done = R.dailyRoutine({ consumers: [Object.assign({}, c, { firstShiftPrep: all })], pipeline: [], firstShiftOf: () => null }, at('2026-10-21')).find(s => s.n === 5);
  ok(s5done.items.length === 0, 'ready consumers leave step 5 clear');
}

// ── every old hash still lands on a real page ──
{
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  const a = html.indexOf('const SECTIONS = ['), b = html.indexOf('function renderMainTabs(');
  const ctx = {};
  vm.runInNewContext(html.slice(a, b) + ';this.out={SECTIONS,PAGE_TO_SECTION,SECTION_DEFAULT,PAGE_ALIASES,STACKED,STACK_HOME};', ctx);
  const { SECTIONS, PAGE_TO_SECTION, SECTION_DEFAULT, PAGE_ALIASES, STACKED, STACK_HOME } = ctx.out;
  const pages = new Set([...html.matchAll(/id="page-([a-z0-9]+)"/g)].map(m => m[1]));
  const guideSubs = ['calendar', 'compliance', 'onboarding', 'reference'];
  // the same steps showPage takes
  const resolve = id => {
    if (PAGE_ALIASES[id]) id = PAGE_ALIASES[id];
    if (id === 'roster') return { page: 'attendants', section: PAGE_TO_SECTION.roster };
    if (SECTION_DEFAULT[id] && !pages.has(id)) id = SECTION_DEFAULT[id];
    if (STACK_HOME[id]) id = STACK_HOME[id];
    const page = id === 'pipeline' ? 'consumers' : guideSubs.includes(id) ? 'guides' : id;
    return { page, section: PAGE_TO_SECTION[id] };
  };
  const OLD = ['dashboard', 'consumers', 'pipeline', 'attendants', 'evvcorrections', 'automations', 'guides', 'calendar',
               'compliance', 'onboarding', 'reference', 'quarterly', 'financials', 'statesubmissions', 'payroll', 'taxcompliance',
               'authorizations', 'careplans', 'profile', 'caregivermatch', 'backuppool', 'caregiverpool', 'activeattendants',
               'leads', 'money'];
  const NEW = ['today', 'help', 'switches', 'roster', 'leadprofile'];
  const want = { dashboard: 'today', pipeline: 'leads', statesubmissions: 'leads', leads: 'leads', attendants: 'attendants',
                 evvcorrections: 'attendants', automations: 'help', guides: 'help', quarterly: 'money', financials: 'money',
                 payroll: 'money', money: 'money', consumers: 'consumers', taxcompliance: 'consumers', profile: 'consumers',
                 caregiverpool: 'attendants', backuppool: 'attendants', today: 'today', help: 'help', switches: 'help', roster: 'attendants' };
  OLD.concat(NEW).forEach(h => {
    const r = resolve(h);
    ok(pages.has(r.page), '#' + h + ' opens a real page (' + r.page + ')');
    ok(SECTIONS.some(s => s.id === r.section), '#' + h + ' lights a real section (' + r.section + ')');
    if (want[h]) ok(r.section === want[h], '#' + h + ' is in ' + want[h] + ' (got ' + r.section + ')');
  });
  ok(resolve('attendants').page === 'activeattendants', 'the GoHighLevel Attendants link opens Active Attendants');
  ok(resolve('statesubmissions').page === 'consumers', 'State Submissions opens the Leads screen');
  ok(resolve('financials').page === 'payroll', 'Financials opens the Money screen');
  ok(resolve('backuppool').page === 'caregivermatch', 'the old pool opens the Caregiver List');
  Object.entries(STACKED).forEach(([k, v]) => v.forEach(x => ok(pages.has(x) && pages.has(k === 'pipeline' ? 'consumers' : k), 'stacked ' + k + ' + ' + x)));
  SECTIONS.forEach(s => s.tabs.forEach(t => ok(pages.has(t.page) || guideSubs.includes(t.page), 'tab ' + t.label + ' has a page')));
  // 2026-10-22 (her ask): Switches became the Settings tab at the right of Help, so six sections.
  ok(SECTIONS.length === 6 && SECTIONS.map(s => s.id).join() === 'today,leads,consumers,attendants,money,help', 'the six sections, in order');
  ok(SECTIONS.find(s => s.id === 'help').tabs.map(t => t.label).join() === 'Deadlines,Compliance,Onboarding,Reference,Settings', 'Help ends with a Settings tab, the old Switches page');
  const tabCount = SECTIONS.reduce((t, s) => t + s.tabs.length, 0);
  ok(tabCount <= 16, 'fewer tabs than before (' + tabCount + ', was 22; Settings is now a tab, Goals has its own tab)');
  const today = SECTIONS.find(x => x.id === 'today');
  ok(today.tabs.map(t => t.page).join() === 'dashboard,followups,numbers,goals', 'Today has Today, Follow-ups, Dashboard and Goals tabs (her calls 10-22)');
  ok(resolve('numbers').page === 'numbers' && resolve('numbers').section === 'today', '#numbers opens the Dashboard tab inside Today');
  ok(resolve('dashboard').page === 'dashboard', '#dashboard (the GoHighLevel link) still opens Today');
  { const d = html.indexOf('id="page-dashboard"'), n = html.indexOf('id="page-numbers"');
    ok(n > d && !/More numbers and reference/.test(html), 'the old Dashboard numbers are their own page, not folded under Today');
    ok(['statConsumers', 'statLeads', 'dashMargin', 'statContactsDue'].every(id => html.indexOf('id="' + id + '"') > n), 'the numbers updateDashboard fills are on the Dashboard tab');
    // 2026-10-22 (her yes): the Dashboard is numbers only.
    const f = html.indexOf('id="page-followups"'), dash = html.slice(n, f);
    ok(!/upcomingDeadlines|pipelineFollowUpAlert|taxSetupAlert|EVV Hard Launch|Regulatory Framework|417-234-8494/.test(dash), 'no banners, typed-in deadlines, contacts or rules on the Dashboard');
    ok(/Leads: New to CDS - Referral/.test(dash) && /Leads: Moving from Another Agency - PCCP/.test(dash), 'lead kinds use the Leads page names'); }

// ── Today tidy-up (2026-10-22, her yes) ──
{
  ok(R.isActive({ status: 'active' }) && R.isActive({ status: 'pending' }) && R.isActive({}), 'active, pending and no status are active');
  ok(!R.isActive({ status: 'inactive' }) && !R.isActive({ status: 'Inactive' }) && !R.isActive({ status: 'Discharged' }), 'inactive in any case, and discharged, are not');
  const steps = R.dailyRoutine({ consumers: [{ id: '1', name: 'Gone Person', status: 'inactive', cdsStartDate: '2024-01-01' }], pipeline: [] }, at('2026-10-22'));
  ok(steps.every(s => s.items.length === 0), 'an inactive consumer (lowercase, as the hub saves it) adds nothing to the morning list');
  const fu = R.dailyRoutine({ consumers: [], pipeline: [{ name: 'Lee Lead', status: 'new', followup: '2026-10-20', calls: [{ at: 'x' }] }] }, at('2026-10-22'))
    .find(s => s.n === 4).items.map(i => i.t).join('|');
  ok(/1 lead to call back today or overdue/.test(fu) && !/follow-up/.test(fu), 'a lead call-back date says call back, not follow-up');
  const d = at('2026-10-22');
  let due = R.reportsDue({}, d);
  ok(due.map(r => r.key).join() === 'q3,des' && due[0].due === '2026-10-31' && due[0].days === 9, 'Oct 22: the Q3 report and DES wage reports, due Oct 31');
  ok(R.reportsDue({ q3: 'submitted', q3_for: '2026-10-31' }, d).map(r => r.key).join() === 'des', 'marked Submitted for Oct 31 drops it');
  ok(R.reportsDue({ q3: 'submitted', q3_for: '2025-10-31' }, d).some(r => r.key === 'q3'), 'last year\'s Submitted mark does not hide this year');
  ok(R.reportsDue({ q3: 'submitted' }, d).some(r => r.key === 'q3'), 'an old mark with no due date does not hide it');
  ok(R.reportsDue({}, at('2026-09-30')).length === 0, 'nothing 31 days out');
  due = R.reportsDue({}, at('2026-11-05'));
  ok(due[0].key === 'q3' && due[0].late, 'a missed report stays on Today as late');
  ok(R.reportsDue({}, at('2027-01-20')).map(r => r.key).join() === 'q4,annual,des', 'January: Q4, the annual report and DES');
  ok(!/Monthly check-in calls: /.test(html), 'Coming up no longer repeats the check-in count');
  ok(/id="qstat_des"/.test(html), 'Deadlines has a DES wage reports row');
}
  ok(!/—/.test(html.slice(a, b)), 'no em dashes in the new menu');
  // The WellSky attendant check card now lives on Active Attendants.
  const aa = html.indexOf('id="page-activeattendants"');
  ok(html.indexOf('id="attendantCheck"') > aa && html.indexOf('id="attendantCheck"') < aa + 400, 'attendant check card is on Active Attendants');
  ok((html.match(/id="attendantCheck"/g) || []).length === 1, 'only one attendant check card');
  // Inside GoHighLevel our header and main tabs are hidden on every link.
  ok(/html\.embedded \.header, html\.embedded #mainTabs \{ display:none !important; \}/.test(html), 'GoHighLevel mode hides header and main tabs');
}

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
