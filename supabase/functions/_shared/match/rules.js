// CDS Caregiver Match: the business rules, in one place.
// Pure functions only (no database, no network) so the same file runs in the
// Supabase edge function, in the practice preview, and in tests.

export const PRACTICE_NOTE = 'Practice mode: fictional people, nothing is sent.';

// Days and parts of day used for availability and filters.
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export const PARTS = ['am', 'pm', 'eve', 'night'];
export const PART_LABEL = { am: 'Mornings', pm: 'Afternoons', eve: 'Evenings', night: 'Overnights' };

export const HELP_TYPES = {
  personal_care: 'Bathing, dressing and personal care',
  meals_housekeeping: 'Meals and light housekeeping',
  mobility_transfers: 'Getting around and transfers',
  memory_care: 'Memory loss and dementia',
  companionship: 'Companionship',
  errands: 'Errands and appointments',
};

// The 27 counties Caring Companions CDS serves (caringcds.com/service-area, checked 2026-10-16).
export const COUNTIES = ['Barry', 'Barton', 'Benton', 'Camden', 'Cedar', 'Christian', 'Dade', 'Dallas', 'Douglas',
  'Greene', 'Hickory', 'Jasper', 'Laclede', 'Lawrence', 'McDonald', 'Newton', 'Ozark', 'Phelps', 'Polk',
  'Pulaski', 'St. Clair', 'Stone', 'Taney', 'Texas', 'Vernon', 'Webster', 'Wright'];

// Request-access answers (all optional).
export const PROGRAMS = { ihs: 'I receive in-home services (IHS) now', cds: 'I use CDS now', new: 'I\'m new to both', not_sure: 'Not sure', prefer_not: 'Prefer not to say' };
export const RELATIONSHIPS = { self: 'Myself', parent: 'My parent', spouse: 'My spouse or partner', family: 'Another family member', friend: 'A friend', professional: 'I\'m a professional referring someone' };

// ---------- FCSR screening: the eight statuses ----------

// Status 7 checks. A Hub setting can replace this list; this is the default.
export const DEFAULT_REQUIRED_CHECKS = [
  { key: 'edl', label: 'DHSS Employee Disqualification List (EDL)', source: 'fcsr' },
  { key: 'edr', label: 'DMH Employee Disqualification Registry', source: 'fcsr' },
  { key: 'oig', label: 'Federal OIG exclusion list', source: 'search' },
  { key: 'mo_medicaid', label: 'Missouri Medicaid exclusion check', source: 'search' },
  { key: 'age18', label: 'Age 18 or older', source: 'dob' },
  { key: 'id_match', label: 'Identity matches the screening', source: 'office' },
];

export const SCREENING_STEPS = [
  { n: 1, key: 'reg_needed', label: 'FCSR registration needed' },
  { n: 2, key: 'instructions_sent', label: 'Registration instructions sent' },
  { n: 3, key: 'reg_pending', label: 'Registration pending' },
  { n: 4, key: 'reg_verified', label: 'Registration verified' },
  { n: 5, key: 'screen_pending', label: 'FCSR screening pending' },
  { n: 6, key: 'screen_complete', label: 'FCSR screening complete' },
  { n: 7, key: 'checks', label: 'EDL and other required checks' },
  { n: 8, key: 'eligible', label: 'Eligible to begin CDS services' },
];

export function ageOn(dobIso, nowIso) {
  if (!dobIso) return null;
  const d = new Date(String(dobIso).slice(0, 10) + 'T00:00:00Z'), n = new Date(nowIso);
  if (isNaN(d)) return null;
  let a = n.getUTCFullYear() - d.getUTCFullYear();
  const m = n.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && n.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

// scr: one cds_screening row (or null). checks: cds_screening_checks rows.
// Returns every step with its state, and whether status 8 is reached.
// Status 8 is never stored as a tick: it is always recalculated from evidence.
export function screeningSummary(scr, checks, required = DEFAULT_REQUIRED_CHECKS) {
  scr = scr || {};
  const byKey = {};
  for (const c of checks || []) {
    // newest record per check wins
    if (!byKey[c.check_key] || String(c.recorded_at) > String(byKey[c.check_key].recorded_at)) byKey[c.check_key] = c;
  }
  const findings = scr.screen_result === 'findings';
  const checkRows = required.map(r => {
    const c = byKey[r.key];
    return { key: r.key, label: r.label, result: c ? c.result : null, clear: !!c && c.result === 'clear',
      at: c ? c.checked_on : null, by: c ? c.recorded_by : null, proof: c ? c.proof_media_id : null };
  });
  const checksClear = checkRows.every(c => c.clear);
  const registered = !!scr.reg_verified_at;
  const screened = !!scr.screen_result_at && scr.screen_result === 'no_findings';
  const eligible = registered && screened && checksClear && !findings;
  const steps = [
    { ...SCREENING_STEPS[0], done: !!scr.reg_needed_at || registered, at: scr.reg_needed_at, by: scr.reg_needed_source,
      skipped: !scr.reg_needed_at && registered },
    { ...SCREENING_STEPS[1], done: !!scr.instructions_sent_at, at: scr.instructions_sent_at, by: scr.instructions_sent_by,
      skipped: !scr.instructions_sent_at && registered },
    { ...SCREENING_STEPS[2], done: !!scr.reg_pending_at, at: scr.reg_pending_at, by: scr.reg_pending_how,
      skipped: !scr.reg_pending_at && registered },
    { ...SCREENING_STEPS[3], done: registered, at: scr.reg_verified_at, by: scr.reg_verified_by, proof: scr.reg_verified_proof },
    { ...SCREENING_STEPS[4], done: !!scr.screen_requested_at, at: scr.screen_requested_at, by: scr.screen_requested_by,
      method: scr.screen_requested_method },
    { ...SCREENING_STEPS[5], done: !!scr.screen_result_at, at: scr.screen_result_at, result: scr.screen_result || null,
      proof: scr.screen_proof },
    { ...SCREENING_STEPS[6], done: checksClear, checks: checkRows },
    { ...SCREENING_STEPS[7], done: eligible },
  ];
  const missing = [];
  if (!registered) missing.push('Registration verified');
  if (!scr.screen_result_at) missing.push('FCSR screening result');
  else if (findings) missing.push('FCSR findings need owner review');
  for (const c of checkRows) if (!c.clear) missing.push(c.label);
  return { steps, eligible, findings, registered, screened, missing,
    current: eligible ? 8 : (steps.slice(0, 7).filter(s => s.done).map(s => s.n).pop() || 0) };
}

// ---------- Directory listing ----------

// Where a caregiver appears. Returns { state, reason }.
// state: 'not_listed' | 'in_progress' | 'complete'
export function listingState({ pool, profile, consents, screening }) {
  const no = reason => ({ state: 'not_listed', reason });
  if (!pool || pool.archived) return no('Archived');
  if (!pool.office_reviewed_at) return no('Waiting for office review');
  if (!profile) return no('No profile yet');
  if (profile.withdrawn_at) return no('Caregiver removed their listing');
  if (!profile.approved) return no('Profile not approved yet');
  if (!hasConsent(consents, 'profile')) return no('No listing consent');
  if (profile.paused) return no('Paused');
  if (!profile.accepting_intros) return no('Not accepting introductions');
  if (screening && screening.findings) return no('Screening needs owner review');
  if (screening && screening.eligible) return { state: 'complete', reason: 'Eligible to begin CDS services' };
  const scr = (screening && screening.raw) || {};
  if (scr.instructions_sent_at || scr.reg_verified_at) return { state: 'in_progress', reason: 'Screening in progress' };
  return no('FCSR steps not started');
}

// "Current availability": at least one day and time set, confirmed in the last 45 days.
export const AVAILABILITY_CURRENT_DAYS = 45;
export function availabilityCurrent(profile, nowIso) {
  if (!profile) return false;
  const av = profile.availability || {};
  const any = DAYS.some(d => (av[d] || []).length);
  const age = daysSince(profile.availability_confirmed_at, nowIso);
  return any && age !== null && age <= AVAILABILITY_CURRENT_DAYS;
}

export function hasConsent(consents, kind) {
  return (consents || []).some(c => c.kind === kind && c.given_at && !c.withdrawn_at);
}

// Days since a date, for "confirmed 6 days ago".
export function daysSince(iso, nowIso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((new Date(nowIso) - new Date(iso)) / 86400000));
}
export function agoText(iso, nowIso) {
  const d = daysSince(iso, nowIso);
  if (d === null) return 'not confirmed yet';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return d + ' days ago';
}

// ---------- Matching (filters and plain reasons) ----------

// filters: { county, parts:[], weekends, help:[], drives, language, video }
// Only facts the caregiver stated or the office verified are used. No scores,
// no personal traits, and nobody is hidden except by a filter the family chose.
export function matchCaregiver(p, f) {
  f = f || {};
  const reasons = [];
  const av = p.availability || {};
  const anyDayHas = part => DAYS.some(d => (av[d] || []).includes(part));
  if (f.county) {
    if (!(p.counties || []).includes(f.county)) return null;
    reasons.push('Works in ' + f.county + ' County');
  }
  for (const part of f.parts || []) {
    if (!anyDayHas(part)) return null;
    reasons.push('Available ' + PART_LABEL[part].toLowerCase());
  }
  if (f.weekends) {
    if (!['sat', 'sun'].some(d => (av[d] || []).length)) return null;
    reasons.push('Available weekends');
  }
  for (const h of f.help || []) {
    if (!(p.help_types || []).includes(h)) return null;
    reasons.push('Comfortable with ' + HELP_TYPES[h].toLowerCase());
  }
  if (f.drives) {
    if (!p.has_car) return null;
    reasons.push('Has their own car');
  }
  if (f.language) {
    if (!(p.languages || []).map(s => s.toLowerCase()).includes(f.language.toLowerCase())) return null;
    reasons.push('Speaks ' + f.language);
  }
  if (f.video) {
    if (!p.has_video) return null;
    reasons.push('Has an intro video');
  }
  return { reasons, matched: reasons.length };
}

// The family's own needs (from the guided questions). Unlike filters, nobody is
// hidden: county is the only must-have. Everything else is explained plainly as
// a match or a "worth asking about", so the family decides what matters.
export function cleanNeeds(n) {
  n = n || {};
  return {
    county: COUNTIES.includes(n.county) ? n.county : null,
    days: (n.days || []).filter(d => DAYS.includes(d)),
    parts: (n.parts || []).filter(p => PARTS.includes(p)),
    hours: n.hours === '' || n.hours == null ? null : Math.max(1, Math.min(80, parseInt(n.hours, 10) || 0)) || null,
    help: (n.help || []).filter(h => HELP_TYPES[h]),
    drives: !!n.drives,
    language: n.language ? String(n.language).slice(0, 30) : null,
  };
}
export function hasNeeds(n) {
  n = n || {};
  return !!(n.county || (n.days || []).length || (n.parts || []).length || n.hours || (n.help || []).length || n.drives || n.language);
}
export function needsMatch(p, n) {
  n = cleanNeeds(n);
  const reasons = [], gaps = [];
  let total = 0, met = 0;
  const yes = r => { reasons.push(r); total++; met++; };
  const no = g => { gaps.push(g); total++; };
  const av = p.availability || {};
  if (n.county) {
    if (!(p.counties || []).includes(n.county)) return null;
    yes('Works in ' + n.county + ' County');
  }
  if (n.days.length || n.parts.length) {
    const days = n.days.length ? n.days : DAYS, parts = n.parts.length ? n.parts : PARTS;
    const hits = days.filter(d => (av[d] || []).some(x => parts.includes(x)));
    const when = n.parts.length ? ' ' + n.parts.map(x => PART_LABEL[x].toLowerCase()).join(', ') : '';
    if (hits.length && (hits.length === days.length || !n.days.length)) yes('Available ' + (n.days.length ? hits.map(d => DAY_LABEL[d]).join(', ') : 'at the times you chose') + when);
    else if (hits.length) { reasons.push('Available ' + hits.map(d => DAY_LABEL[d]).join(', ') + when); no('Not listed for ' + days.filter(d => !hits.includes(d)).map(d => DAY_LABEL[d]).join(', ')); }
    else no('Not listed for the days and times you chose');
  }
  if (n.hours) {
    if (p.hours_min == null || (n.hours >= (p.hours_min || 0) - 2 && n.hours <= (p.hours_max || 80) + 2)) yes('Looking for about ' + n.hours + ' hours a week');
    else no('Wants ' + p.hours_min + ' to ' + p.hours_max + ' hours a week');
  }
  for (const h of n.help) ((p.help_types || []).includes(h) ? yes('Comfortable with ' + HELP_TYPES[h].toLowerCase()) : no('Didn\'t list ' + HELP_TYPES[h].toLowerCase()));
  if (n.drives) (p.has_car ? yes('Has their own car') : no('Doesn\'t have a car listed'));
  if (n.language) { const sp = (p.languages || []).map(x => x.toLowerCase()).includes(n.language.toLowerCase()); sp ? yes('Speaks ' + n.language) : no('Doesn\'t list ' + n.language); }
  return { reasons, gaps, matched: met, total };
}

// Fully screened first, then more of the family's needs matched, then most
// recently confirmed availability. Video never affects order.
export function sortMatches(rows) {
  return rows.slice().sort((a, b) =>
    (a.section === b.section ? 0 : a.section === 'complete' ? -1 : 1) ||
    (b.match.matched - a.match.matched) ||
    String(b.availability_confirmed_at || '').localeCompare(String(a.availability_confirmed_at || '')) ||
    String(a.first_name).localeCompare(String(b.first_name)));
}

// ---------- Prospect journey and eligibility ----------

export const STAGES = [
  ['new_request', 'New directory request'],
  ['medicaid_needed', 'Medicaid verification needed'],
  ['cds_review_pending', 'Medicaid active, CDS eligibility review pending'],
  ['potential_review', 'Potential CDS consumer, office review'],
  ['access_approved', 'Directory access approved'],
  ['invited', 'Private invitation sent'],
  ['browsing', 'Browsing caregivers'],
  ['intro_requested', 'Introduction requested'],
  ['caregiver_identified', 'Potential caregiver identified'],
  ['transition_requested', 'CDS referral or transition requested'],
  ['authorization_pending', 'CDS eligibility and authorization pending'],
  ['attendant_onboarding', 'Attendant onboarding'],
  ['ready_to_begin', 'Ready to begin services'],
  ['services_started', 'Services started'],
  ['on_hold', 'On hold'],
  ['not_eligible', 'Not eligible right now'],
  ['follow_up_later', 'Follow up later'],
  ['closed', 'Closed'],
];
export const STAGE_LABEL = Object.fromEntries(STAGES);
export const SIDE_STAGES = ['on_hold', 'not_eligible', 'follow_up_later', 'closed'];

// Medicaid verification rules (approved by Samantha 2026-10-15):
// 1. A check is current for directory-access review for 30 days.
// 2. After access is approved, an old check never revokes access or nags staff
//    while the family is only browsing.
// 3. Moving toward enrollment (CDS referral) needs a check within 30 days and
//    in the same calendar month.
// 4. Services need an active check done IN the calendar month services are
//    expected to begin. A new start month needs a new check.
export const MEDICAID_ACCESS_DAYS = 30;
export const MEDICAID_RECHECK_DAYS = 30;
const ymd = v => String(v || '').slice(0, 10);
const ym = v => String(v || '').slice(0, 7);
const checkAge = (check, nowIso) => daysSince(ymd(check.checked_on) + 'T12:00:00Z', nowIso);
export function accessCheckCurrent(check, nowIso, days = MEDICAID_ACCESS_DAYS) {
  if (!check || check.coverage !== 'active') return false;
  const d = checkAge(check, nowIso);
  return d !== null && d <= days;
}
export function medicaidCurrent(check, nowIso, days = MEDICAID_RECHECK_DAYS) {
  return accessCheckCurrent(check, nowIso, days) && ym(check.checked_on) === ym(nowIso);
}
export function serviceMonthCheck(checks, startDate) {
  if (!startDate) return null;
  return (checks || []).find(c => c.coverage === 'active' && ym(c.checked_on) === ym(startDate)) || null;
}
const monthName = d => new Date(ymd(d) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const ENROLLMENT_STAGES = ['transition_requested', 'authorization_pending', 'attendant_onboarding', 'ready_to_begin'];

// What Medicaid check is needed next, and is it needed now? Shown on every record.
export function nextVerification({ prospect, checks, nowIso }) {
  const last = (checks || [])[0];
  const approved = prospect.access_status === 'approved';
  if (prospect.kind === 'consumer' && approved && !last && !ENROLLMENT_STAGES.includes(prospect.stage)) return { label: 'Not needed now (current CDS consumer)', due: false };
  if (!approved) {
    if (['not_eligible', 'closed'].includes(prospect.stage)) return { label: 'None', due: false };
    return accessCheckCurrent(last, nowIso) ? { label: 'Current for access review until ' + new Date(new Date(ymd(last.checked_on) + 'T12:00:00Z').getTime() + MEDICAID_ACCESS_DAYS * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), due: false }
      : { label: 'Before directory access can be approved', due: true };
  }
  if (prospect.stage === 'services_started') return { label: 'None (services started)', due: false };
  if (!ENROLLMENT_STAGES.includes(prospect.stage)) return { label: 'When they move toward a CDS referral', due: false };
  const start = prospect.expected_start_date;
  if (start) {
    const ok = serviceMonthCheck(checks, start);
    if (ok) return { label: 'Done for the ' + monthName(start) + ' start', due: false };
    const inMonth = ym(nowIso) === ym(start);
    return { label: 'In ' + monthName(start) + ', the month services begin', due: inMonth || ym(nowIso) > ym(start) };
  }
  return { label: 'In the month services are expected to begin (set an expected start date)', due: false };
}

// The four statuses she asked to keep separate.
export function fourStatuses({ prospect, eligibility, lastCheck, nowIso }) {
  return {
    medicaid_verified: accessCheckCurrent(lastCheck, nowIso),
    medicaid_coverage: lastCheck ? lastCheck.coverage : 'not_checked',
    cds_eligibility_confirmed: !!eligibility && eligibility.dsds_cds === 'confirmed',
    directory_access_approved: prospect.access_status === 'approved',
    services_authorized: !!prospect.services_authorized_at,
  };
}

// Can the office send (or resend) the directory invitation? Returns { ok, why }.
// An old Medicaid check never blocks an approved family's invitation.
export function inviteGate({ prospect, ihsInvitesAllowed }) {
  const program = (prospect.needs || {}).program;
  if (prospect.access_status !== 'approved') return { ok: false, why: prospect.access_status === 'on_hold' ? 'On hold: ' + (prospect.hold_reason || 'see notes') : prospect.access_status === 'not_eligible' ? 'Not eligible right now' : 'Directory access not approved yet' };
  if (program === 'ihs' && !ihsInvitesAllowed) return { ok: false, why: 'Held for legal review: this person receives IHS now' };
  return { ok: true, why: 'Ready to send' };
}

// Everything that must be true before "Ready to begin services".
export function readyToBegin({ prospect, eligibility, checks, chosen }) {
  const start = prospect.expected_start_date;
  const items = [
    { key: 'start', label: 'Expected service start date set', ok: !!start },
    { key: 'medicaid', label: start ? 'Medicaid active, checked in ' + monthName(start) : 'Medicaid checked in the service start month', ok: !!serviceMonthCheck(checks, start) },
    { key: 'cds', label: 'CDS eligibility confirmed by DSDS', ok: !!eligibility && eligibility.dsds_cds === 'confirmed' },
    { key: 'auth', label: 'DSDS authorization for CDS services recorded', ok: !!prospect.services_authorized_at },
    { key: 'attendant', label: chosen ? 'Attendant ' + chosen.first_name + ' fully screened (Eligible to begin CDS services)' : 'Attendant chosen and fully screened', ok: !!chosen && !!chosen.eligible },
    { key: 'onboarding', label: 'Attendant onboarding complete', ok: !!prospect.attendant_onboarding_done_at },
  ];
  return { ok: items.every(i => i.ok), items, missing: items.filter(i => !i.ok).map(i => i.label) };
}

// ---------- Introductions ----------

export const INTRO_STATUS = {
  sent: { family: 'Sent', office: 'New request' },
  asked: { family: 'Caregiver is considering', office: 'Waiting on caregiver' },
  caregiver_yes: { family: 'Caregiver would like to meet', office: 'Caregiver interested' },
  scheduled: { family: 'Meeting set', office: 'Meeting scheduled' },
  met: { family: 'Met', office: 'Met, family deciding' },
  caregiver_no: { family: 'Not available right now', office: 'Caregiver said no' },
  not_available: { family: 'Not available right now', office: 'Not available' },
  closed: { family: 'Closed', office: 'Closed' },
};
const NEXT = {
  sent: ['asked', 'not_available', 'closed'],
  asked: ['caregiver_yes', 'caregiver_no', 'not_available', 'closed'],
  caregiver_yes: ['scheduled', 'closed'],
  scheduled: ['met', 'scheduled', 'closed'],
  met: ['closed'],
  caregiver_no: ['closed'],
  not_available: ['closed'],
  closed: [],
};
export function canMoveIntro(from, to) { return (NEXT[from] || []).includes(to); }
export const INTRO_HOW = { video: 'Live video meet-and-greet', home: 'In person at my home', elsewhere: 'In person somewhere else' };

// ---------- Access ----------

export const ACCESS_DAYS = 45;
export const CODE_MINUTES = 10;
export const CODE_MAX_TRIES = 5;
export const SESSION_DAYS = 30;
export const CAREGIVER_LINK_DAYS = 90;

export function accessOpen(a, nowIso) {
  if (!a || a.revoked_at) return false;
  return !a.expires_at || new Date(a.expires_at) > new Date(nowIso);
}

export function maskPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 4 ? '(•••) •••-••' + d.slice(-2) : '';
}
export function maskEmail(e) {
  const m = String(e || '').match(/^(.)[^@]*(@.+)$/);
  return m ? m[1] + '•••' + m[2] : '';
}

// ---------- Profile ----------

export const PROFILE_LIMITS = { about_me: 700, enjoy_most: 400, interests: 300, setting_pref: 300,
  experience: 400, town: 60, cert_other: 120 };

// Keeps only known fields, trims, and caps lengths. Returns { profile, errors }.
export function cleanProfileDraft(input) {
  const out = {}, errors = [];
  const s = (k) => {
    if (input[k] === undefined) return;
    const v = String(input[k] ?? '').trim();
    if (v.length > PROFILE_LIMITS[k]) errors.push(k + ' is too long');
    out[k] = v.slice(0, PROFILE_LIMITS[k]);
  };
  ['about_me', 'enjoy_most', 'interests', 'setting_pref', 'experience', 'town', 'cert_other'].forEach(s);
  if (input.counties !== undefined) out.counties = (input.counties || []).filter(c => COUNTIES.includes(c));
  if (input.help_types !== undefined) out.help_types = (input.help_types || []).filter(h => HELP_TYPES[h]);
  if (input.languages !== undefined) out.languages = (input.languages || []).map(x => String(x).trim()).filter(Boolean).slice(0, 6).map(x => x.slice(0, 30));
  if (input.certs !== undefined) out.certs = (input.certs || []).filter(c => ['cpr', 'cna', 'first_aid'].includes(c));
  if (input.has_car !== undefined) out.has_car = !!input.has_car;
  if (input.travel_miles !== undefined) out.travel_miles = Math.max(0, Math.min(100, parseInt(input.travel_miles, 10) || 0));
  if (input.current_cds_hours !== undefined) out.current_cds_hours = !!input.current_cds_hours;
  return { profile: out, errors };
}

export function cleanAvailability(input) {
  const av = {};
  for (const d of DAYS) av[d] = [...new Set((input && input[d]) || [])].filter(p => PARTS.includes(p));
  return av;
}

export function availabilitySummary(av) {
  av = av || {};
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const parts = PARTS.filter(p => DAYS.some(d => (av[d] || []).includes(p)));
  if (!parts.length) return 'Ask about schedule';
  const days = DAYS.filter(d => (av[d] || []).length);
  const dayText = weekdays.every(d => days.includes(d)) && days.length === 5 ? 'Mon to Fri'
    : days.length === 7 ? 'Every day' : days.map(d => DAY_LABEL[d]).join(', ');
  return dayText + ' · ' + parts.map(p => PART_LABEL[p].toLowerCase()).join(', ');
}

// What a caregiver still needs to do, for their home checklist.
export function caregiverChecklist({ profile, consents, screening, hasAuth }) {
  const p = profile || {};
  const d = p.draft || {};
  const scr = (screening && screening.raw) || {};
  return [
    { key: 'requirements', label: 'State requirements (FCSR)', done: !!(scr.reg_pending_at || scr.reg_verified_at) && !!hasAuth },
    { key: 'profile', label: 'About you', done: !!(d.about_me && d.town && (d.counties || []).length) },
    { key: 'photo', label: 'Your photo', done: !!(p.photo_draft || p.photo_approved) },
    { key: 'video', label: 'Intro video (optional)', done: !!(p.video_draft || p.video_approved), optional: true },
    { key: 'availability', label: 'Days and times', done: !!p.availability_confirmed_at },
    { key: 'consent', label: 'See what families see', done: hasConsent(consents, 'profile') && ['submitted', 'approved'].includes(p.review_status) },
  ];
}
