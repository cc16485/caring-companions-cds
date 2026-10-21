// CDS attendant packet: the rules, with no database. Shared by the server, the
// attendant page and the CDS hub, so all three agree on what is complete and
// what comes next. 2026-10-21. No em dashes in anything a person reads.

export const TASKS = ['Bladder Care', 'Bowel Care', 'Equipment Maintenance', 'Grooming & Hygiene', 'Household Management', 'Laundry',
  'Transfers', 'Turning in Bed', 'Bathing/Showering', 'Meal Consumption', 'Meal Clean Up', 'Meal Preparation', 'ROM Exercises',
  'Transportation', 'Dressing/Undressing', 'House Cleaning', 'Medications', 'Shopping'];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const RELATIONS = { child: 'Son or daughter', grandchild: 'Grandson or granddaughter', parent: 'Parent', sibling: 'Brother or sister',
  inlaw: 'In-law', spouse: 'Husband or wife', other: 'Other relative' };
export const REF_RELS = ['Friend', 'Co-worker', 'Past client', 'Pastor', 'Neighbor', 'Other'];

const s = (v, n) => String(v ?? '').trim().slice(0, n);
const yn = v => (v === 'yes' || v === 'no' ? v : '');
const pick = (v, list) => (list.includes(v) ? v : '');

// Only these answers are ever stored, each with a length cap. The SSN, DOB and
// legal name never come through here (packetIdentity seals them).
export function cleanAnswers(a = {}) {
  const o = {};
  const has = k => Object.prototype.hasOwnProperty.call(a, k);
  for (const k of ['first', 'last', 'mi', 'street', 'apt', 'city', 'state', 'zip', 'phone', 'email', 'aliases', 'consumer_name', 'gaps',
    'hs', 'hs_years', 'col', 'col_years']) if (has(k)) o[k] = s(a[k], k === 'gaps' ? 1000 : 120);
  for (const k of ['has_consumer', 'related', 'qualified', 'on_call', 'not_working_ok', 'hs_grad', 'col_grad', 'convicted', 'gcw'])
    if (has(k)) o[k] = yn(a[k]);
  if (has('relation')) o.relation = pick(a.relation, Object.keys(RELATIONS));
  if (has('list')) o.list = pick(a.list, ['join', 'no']);
  if (has('prefer')) o.prefer = pick(a.prefer, ['men', 'women', 'either']);
  if (has('fcsr')) o.fcsr = pick(a.fcsr, ['yes', 'no', 'notsure']);
  if (has('mo_only')) o.mo_only = pick(a.mo_only, ['mo', 'more']);
  if (has('not_working')) o.not_working = a.not_working === true;
  if (has('days')) { o.days = {}; for (const d of DAYS) o.days[d] = s((a.days || {})[d], 60); }
  if (has('tasks')) o.tasks = (Array.isArray(a.tasks) ? a.tasks : []).filter(t => TASKS.includes(t));
  if (has('jobs')) o.jobs = (Array.isArray(a.jobs) ? a.jobs : []).slice(0, 8).map(j => ({
    co: s(j.co, 120), city: s(j.city, 80), sup: s(j.sup, 80), ph: s(j.ph, 30), from: s(j.from, 20), to: s(j.to, 20),
    duties: s(j.duties, 500), why: s(j.why, 200), call: yn(j.call) }));
  if (has('refs')) o.refs = (Array.isArray(a.refs) ? a.refs : []).slice(0, 4).map(r => ({
    name: s(r.name, 80), rel: pick(r.rel, REF_RELS), ph: s(r.ph, 30), em: s(r.em, 120) }));
  if (has('offenses')) o.offenses = (Array.isArray(a.offenses) ? a.offenses : []).slice(0, 10).map(x => ({ what: s(x.what, 200), when: s(x.when, 40), where: s(x.where, 80) }));
  if (has('addrs')) o.addrs = (Array.isArray(a.addrs) ? a.addrs : []).slice(0, 8).map(x => ({ a: s(x.a, 200), d: s(x.d, 60) }));
  if (has('gender')) o.gender = pick(a.gender, ['m', 'f']);
  return o;
}

const digits = v => String(v ?? '').replace(/\D/g, '');
// What is still missing before the application can be signed. [] = ready.
export function applicationMissing(a = {}) {
  const m = [];
  if (!(a.first && a.last && a.street && a.city && a.zip && digits(a.phone).length >= 10)) m.push('your name, address and phone');
  if (a.has_consumer !== 'no') {
    if (!a.consumer_name) m.push("your consumer's name");
    if (!a.related) m.push('whether you are related to your consumer');
    if (a.related === 'yes' && !a.relation) m.push('how you are related');
    if (a.relation === 'spouse') m.push('a different caregiver: Missouri does not allow a spouse to be paid as the CDS attendant');
  }
  if (a.qualified !== 'yes') m.push('the qualifications question');
  if (!a.list) m.push('whether to be on the caregiver list');
  const jobs = a.jobs || [];
  const past = jobs.slice(1).filter(j => j.co && j.sup && j.ph).length;
  if (!(a.not_working || (jobs[0] && jobs[0].co))) m.push('your current job, or tick that you are not working');
  if (past < 2) m.push('at least 2 past jobs with a supervisor and phone');
  const refs = (a.refs || []).filter(r => r.name && r.rel && r.ph);
  if (refs.length < 2) m.push('2 references');
  if (!a.convicted || !a.gcw || !a.fcsr || !a.mo_only) m.push('the background questions');
  if (a.convicted === 'yes' && !(a.offenses || []).some(o => o.what)) m.push('what the offense was');
  return m;
}
export function backgroundMissing(a = {}, identityDone) {
  const m = [];
  if (!identityDone) m.push('your date of birth and Social Security number');
  if (!a.gender) m.push('gender');
  if (!(a.addrs || []).some(x => x.a)) m.push('your current address');
  return m;
}

// The 5-minute ID check: the next 3 weekdays, a few times each, Central time.
export function callSlots(nowIso) {
  const out = [];
  const d = new Date(nowIso);
  for (let i = 1; out.length < 15 && i < 10; i++) {
    const day = new Date(d.getTime() + i * 86400000);
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(day);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(day);
    if (wd === 'Sat' || wd === 'Sun') continue;
    for (const t of ['09:30', '10:30', '13:00', '14:30', '15:30']) {
      const label = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' }).format(day)
        + ', ' + (+t.slice(0, 2) > 12 ? +t.slice(0, 2) - 12 : +t.slice(0, 2)) + ':' + t.slice(3) + (+t.slice(0, 2) >= 12 ? 'pm' : 'am');
      out.push({ value: ymd + ' ' + t, label });
    }
  }
  return out;
}

// Where an attendant is, who moves next, and the 8 to 11 steps the office sees.
// p = cds_packets row, forms = { key: row }, scr = screeningSummary() result,
// profile = { approved, review_status } or null.
export function status(p, forms, scr, profile) {
  const f = k => !!(forms || {})[k];
  const s1 = f('application') && f('background');
  // Step 2 opens when everything except the ID match is clear: the ID is seen on
  // the 5-minute video call, which happens in Step 2 and records the ID match.
  const checkRows = scr && scr.steps ? (scr.steps[6] || {}).checks || [] : [];
  const clear = !!scr && scr.registered && scr.screened && !scr.findings && checkRows.filter(c => c.key !== 'id_match').every(c => c.clear);
  const fullyClear = !!(scr && scr.eligible);
  const s2 = f('contract') && f('pay') && f('units') && f('handbook');
  const steps = [
    { key: 'step1', label: 'Step 1 application', who: 'Attendant', done: s1 },
    { key: 'orientation', label: 'Orientation video and handbook link', who: 'Sent by itself after Step 1', done: !!p.orientation_done_at },
    { key: 'checks', label: 'Background checks (FCSR, EDL, OIG)', who: 'Office', done: clear,
      detail: scr ? (scr.findings ? 'FCSR findings: owner review' : scr.missing.filter(m => !/^Identity/.test(m)).join(', ')) : '' },
    { key: 'papers', label: 'Contract, pay, units, handbook', who: 'Attendant', done: s2 },
    { key: 'empeon_invite', label: 'Empeon invite', who: 'Office', done: !!p.empeon_invited_at },
    { key: 'empeon', label: 'Empeon: W-4, I-9 part 1, direct deposit, ID photos', who: 'Attendant', done: !!p.empeon_done_at },
    { key: 'call', label: '5-minute ID check on video', who: 'Office and attendant', done: !!p.id_checked_at,
      detail: p.call_slot ? 'Booked ' + p.call_slot : 'Attendant books it' },
    { key: 'i9', label: 'I-9 Section 2 in Empeon (E-Verify, remote box)', who: 'Office', done: !!p.i9_done_at },
    { key: 'countersign', label: 'Countersign the contract', who: 'Office', done: !!(forms && forms.contract && forms.contract.countersigned_at) },
  ];
  if (p.list_choice === 'join') steps.push({ key: 'listed', label: 'Profile on findcdscaregivers.com', who: 'Office, one tap',
    done: !!(profile && profile.review_status === 'approved'), optional: true });
  const required = steps.filter(x => !x.optional);
  const active = !!p.active_at || (fullyClear && required.every(x => x.done));
  const nextStep = steps.find(x => !x.done && !x.optional && (x.key !== 'orientation')) || steps.find(x => !x.done);
  let label, tone, next;
  if (active) { label = 'Active'; tone = 'g'; next = p.list_choice === 'join' && !(profile && profile.review_status === 'approved') && clear ? 'Approve their profile for findcdscaregivers.com.' : 'Nothing due.'; }
  else if (!s1) { label = 'Filling out Step 1'; tone = 'b'; next = 'Nothing to do. Reminder texts go out on their own.'; }
  else if (scr && scr.findings) { label = 'FCSR findings'; tone = 'r'; next = 'Owner review of the FCSR findings.'; }
  else if (!clear) { label = 'Run EDL and FCSR'; tone = 'r'; next = 'Run the checks: ' + ((scr && scr.missing) || []).filter(m => !/^Identity/.test(m)).join(', ') + '.'; }
  else if (!p.empeon_invited_at) { label = 'Send Empeon invite'; tone = 'r'; next = 'Checks are clear. Send the Empeon invite (Copy for Empeon).'; }
  else {
    const them = [!s2 && 'sign their papers', !p.empeon_done_at && 'finish Empeon', !p.orientation_done_at && 'finish the orientation', !p.call_slot && 'book the ID check'].filter(Boolean);
    const us = [!p.i9_done_at && 'complete I-9 Section 2 in Empeon', !(forms.contract && forms.contract.countersigned_at) && s2 && 'countersign the contract'].filter(Boolean);
    if (p.call_slot && !p.id_checked_at) { label = 'ID check booked'; tone = 'y'; next = '5-minute ID check ' + p.call_slot + ': see their ID live, then I-9 Section 2 in Empeon.' + (them.length ? ' Still waiting on them to ' + them.join(', ') + '.' : ''); }
    else if (p.id_checked_at && us.length) { label = 'Finish in Empeon'; tone = 'r'; next = us.join(', then ').replace(/^./, c => c.toUpperCase()) + '.' + (them.length ? ' Still waiting on them to ' + them.join(', ') + '.' : ''); }
    else { label = 'Finishing onboarding'; tone = 'b'; next = them.length ? 'Waiting on them to ' + them.join(', ') + '.' : 'Waiting on the last steps.'; }
  }
  return { label, tone, next, active, step1: s1, checksClear: clear, step2Open: s1 && clear, step2Signed: s2, steps, now: nextStep ? nextStep.key : null };
}
