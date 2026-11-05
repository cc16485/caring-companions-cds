// The Starting profile rules (2026-11-04): ME codes, managed care, Medicaid state, the seven steps,
// the Ready for first shift checklist, follow-ups, the message templates and their safeguards.
//   node tests/starting_rules_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/starting-rules.js');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const S = globalThis.CDSStarting, CR = globalThis.CDSRules;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const d = (codes, mc, lock, status) => S.decide({ status: status || 'active', codes: S.normCodes(codes), managedCare: mc || 'no', lockIn: lock || 'none', name: 'Pat' });

// Every chart row is in the rules, once.
const codes = S.DEFAULT_RULES.codes.map(r => r.code);
ok(codes.length === 35 && new Set(codes).size === 35, '35 codes, no repeats');
ok(['02', '03', '04', '11', '12', '13', '83', '84', '86'].every(c => d(c).k === 'ok'), 'State Plan codes eligible');
ok(d('85').k === 'rev' && d('85', 'no', 'tw_paid').k === 'ok', '85 needs the premium paid');
ok(d('E2').k === 'ok' && d('E2', 'yes').k === 'ok', 'E2 eligible whatever the lock-in');
ok(d('13, E2').k === 'rev' && d('13, E2').sup, 'E2 with another code: review');
ok(d('05').k === 'rev' && d('05').sup, '05 without managed care shown: supervisor confirms');
ok(d('05', 'yes').label === 'Not eligible for CDS under current coverage', '05 with managed care shown');
ok(d('13', 'yes').label === 'Not eligible for CDS under current coverage', 'dual codes with managed care');
ok(d('13', 'unsure').k === 'rev', 'managed care unsure: review');
ok(['14', '15', '16'].every(c => d(c).label === 'Not eligible for standard in-home CDS under this ME category' && d(c).sup), 'decision A');
ok(['55', '82', '91'].every(c => d(c).label === 'Not eligible for CDS under this ME category'), 'State Plan No');
ok(['73', '74', '75'].every(c => d(c).label === 'Not eligible for CDS: CDS is for adults'), 'children');
ok(d('99').k === 'rev' && d('99').why.includes('not on the DHSS chart'), 'unknown code never guessed');
ok(d('13, 55').k === 'ok', 'dual codes, one eligible, no managed care');
ok(d('13', 'no', 'sd_not').k === 'rev' && d('13', 'no', 'sd_met').k === 'ok', 'spenddown');
ok(d('', 'no', 'none', 'nomed').label === 'No Medicaid yet' && d('', 'no', 'none', 'pending').k === 'pend', 'no Medicaid, pending');
ok(d('5').k === d('05').k, '5 reads as 05');
ok(S.DEFAULT_RULES.codes.every(r => d(r.code).k !== 'no' || d(r.code).sup), 'every no waits for a supervisor');
ok(d('13').fam.includes('Pat') && !/—/.test(JSON.stringify(S.FAM)), 'family words name them, no em dashes');

// Medicaid state: a family report is never verified (safeguard 1); application is not eligibility (5).
const chk = (over) => Object.assign({ at: '2026-11-04T15:00:00Z', by: 'zach', status: 'active', codes: ['13'], pdf: 'p.pdf', result: { k: 'ok', label: 'Eligible ME code' }, rulesVersion: '2026-11-04' }, over || {});
ok(S.medicaidState({ medicaid: { checks: [chk()] } }).verified, 'saved check with PDF verifies');
ok(!S.medicaidState({ medicaid: { checks: [chk({ pdf: '' })] } }).verified, 'no PDF, not verified');
let st = S.medicaidState({ medicaid: { checks: [chk()], familyReport: { at: '2026-11-05T10:00:00Z' } } });
ok(!st.verified && st.label === 'Family reports Medicaid approved. Verification needed', 'family report needs verification');
ok(S.medicaidState({ medicaid: { checks: [chk({ at: '2026-11-06T10:00:00Z' })], familyReport: { at: '2026-11-05T10:00:00Z' } } }).verified, 'a later check clears the report');
ok(S.medicaidState({ medicaid: { application: { stage: 'help' } } }).label === 'No Medicaid yet', 'application alone is not eligibility');
const revCheck = chk({ codes: ['05'], result: { k: 'rev', label: 'Needs review', sup: true } });
st = S.medicaidState({ medicaid: { checks: [revCheck] } });
ok(!st.verified && st.needsSupervisor, 'review waits on a supervisor');
ok(S.medicaidState({ medicaid: { checks: [revCheck], reviews: [{ checkAt: revCheck.at, action: 'approve' }] } }).verified, 'supervisor approval verifies');
ok(!S.medicaidState({ medicaid: { checks: [chk()], flags: [{ open: true }] } }).verified, 'open flag blocks');
ok(S.medicaidState({ medicaid: { checks: [chk()] } }, '2027-01-01').ruleChanged, 'rule change is noticed, not applied');

// Steps, Next step, side-by-side work, the gate.
const c0 = { status: 'starting', starting: { kind: 'new' } };
let s = S.startingSteps(c0, {});
ok(s.count === 1 && s.next.t === 'Medicaid verification' && s.steps[3].state === 'side' && s.steps[4].state === 'side', 'new: Medicaid first, paperwork and attendant side by side');
ok(s.also.length === 2, 'also-do-now list');
const c1 = { status: 'starting', starting: { kind: 'new' }, medicaid: { checks: [chk()] } };
s = S.startingSteps(c1, {});
ok(s.count === 2 && s.next.t === 'Send the DSDS referral', 'verified: send the referral');
s = S.startingSteps(Object.assign({}, c1, { cdsStartDate: '2026-12-20' }), { auth: true, packet: { done: true }, attendant: { linked: true, ready: true } });
ok(s.next.t.startsWith('Finish the Ready') && !s.gateOk, 'gate waits for WellSky');
const c2 = Object.assign({}, c1, { cdsStartDate: '2026-11-20', firstShiftPrep: { authWellSky: { at: 1 }, tasksWellSky: { at: 1 }, toldClockIn: { at: 1 } }, starting: { kind: 'new', attClockIn: { at: 1 } } });
s = S.startingSteps(c2, { auth: true, packet: { done: true }, attendant: { linked: true, ready: true } });
ok(s.gateOk && s.next.t === 'Mark ready for first shift', 'gate done');
s = S.startingSteps(Object.assign({}, c2, { starting: { kind: 'new', readyAt: '2026-11-20', attClockIn: { at: 1 } } }), { auth: true, packet: { done: true }, attendant: { ready: true }, firstShift: '2026-11-24' });
ok(s.count === 7, 'all seven');
ok(S.startingSteps({ status: 'starting', starting: { kind: 'move' }, medicaid: { checks: [chk()] } }, {}).next.t.startsWith('Transfer'), 'transfer path');
ok(S.readyGate(c1, {}).find(g => g.k === 'auth').ok === false, 'authorization separate from Medicaid');
// The state's start date (her rule 2026-11-04): needed for State approval, counted down, both must be able to clock in.
let sd = S.startingSteps(c1, { auth: true, today: '2026-11-15' });
ok(sd.next.t === 'Add the start date the state gave' && sd.steps[2].state !== 'done', 'authorization without a start date: ask for it');
const cS = Object.assign({}, c1, { cdsStartDate: '2026-11-20' });
sd = S.startingSteps(cS, { auth: true, today: '2026-11-15', attendant: { linked: true, ready: true } });
ok(sd.startAlert && sd.startAlert.days === 5 && sd.next.urgent && /^Start date in 5 days: /.test(sd.next.t), 'five days out and not ready: urgent next step');
ok(sd.gate.find(g => g.k === 'consumerClock').ok === false && sd.gate.find(g => g.k === 'attendantClock').ok === false, 'both clock-in lines start unticked');
const al = S.startDateAlerts({ consumers: [Object.assign({ id: 'x', name: 'Pat', status: 'starting', coordinator: 'Krystal' }, cS)] }, '2026-11-15', () => ({ auth: true, skipKeys: ['packet'] }));
ok(al.length === 1 && al[0].owner === 'Krystal' && !/packet/i.test(al[0].why), 'Today and email alert, owner, unknown lines left out');
ok(S.startDateAlerts({ consumers: [Object.assign({ id: 'x', name: 'Pat', status: 'starting' }, cS)] }, '2026-11-01', () => ({})).length === 0, 'more than a week out: no alert yet');
ok(S.startingSteps(cS, { auth: true, today: '2026-11-22' }).startAlert.late, 'start date passed: late');


// Follow-ups go to the person's coordinator (safeguard 3).
const data = { consumers: [{ id: 'c', name: 'Pat Example', status: 'starting', coordinator: 'krystal', medicaid: { application: { stage: 'help' }, followup: { date: '2026-11-07' } } }],
               pipeline: [{ id: 'l', name: 'Lee Sample', medicaid: { followup: { date: '2026-11-10', owner: 'zach' } } }] };
let f = S.applicationFollowups(data, '2026-11-07');
ok(f.length === 1 && f[0].owner === 'krystal' && f[0].today, 'due today, owner from the coordinator');
f = S.applicationFollowups(data, '2026-11-12');
ok(f.length === 2 && f[1].owner === 'zach' && f[0].late, 'leads too, reassigned owner kept');

// Templates, identifiers, duplicates.
const vars = { caller: 'Linda', consumer: 'Pat', coordinator: 'Krystal', abd: true };
const text = S.fillTemplate(S.DEFAULT_TEMPLATES.text, vars), email = S.fillTemplate(S.DEFAULT_TEMPLATES.email, vars);
ok(text.includes('Hi Linda') && text.includes('855-373-9994') && text.includes('IM-1ABD') && !text.includes('{'), 'text filled');
ok(!S.fillTemplate(S.DEFAULT_TEMPLATES.text, Object.assign({}, vars, { abd: false })).includes('IM-1ABD'), 'form line only when it applies');
ok(email.includes('P.O. Box 2700') && email.includes('Thank you,\nKrystal') && !email.includes('[['), 'email filled');
ok(S.identifierProblems(text, { dcn: '12345678' }).length === 0 && S.identifierProblems(email, {}).length === 0, 'templates carry no identifiers');
ok(S.identifierProblems('Her DCN is 12345678', { dcn: '12345678' }).length >= 1, 'DCN stopped');
ok(S.identifierProblems('ME code 13 looks fine', {}).length === 1, 'ME code stopped');
ok(S.identifierProblems('She is not eligible because of managed care', {}).length === 1, 'eligibility details stopped');
ok(S.recentSends([{ at: '2026-11-02T00:00:00Z', status: 'sent' }, { at: '2026-10-01T00:00:00Z', status: 'sent' }, { at: '2026-11-03T00:00:00Z', status: 'failed' }], '2026-11-04T12:00:00Z').length === 1, 'recent sends');

// The first call: summary, still missing, one next step, follow-up gap.
const P = S.callPlan;
let cp = P({ who: 'family', consumer: { first: 'Mae', last: 'Example' }, caller: { name: 'Linda', relation: 'daughter' }, phone: '4175550177', medicaid: 'no', cds: 'new', help: ['bathing'], attendant: 'find', condition: 'stroke', handsOn: 'hands', selfDirect: 'yes', guardian: 'no', living: 'home' });
ok(cp.summary.startsWith('Linda (daughter) called about Mae Example.') && cp.missing.join() === 'their date of birth,their county' && cp.next.k === 'medicaid' && cp.followDays === 3, 'family, no Medicaid');
// Guided call (2026-11-05): date of birth, county, DCN and the application stage.
cp = P({ who: 'family', consumer: { first: 'Mae', last: 'Example' }, caller: { name: 'Linda', relation: 'daughter' }, phone: '4175550177', dob: '1940-03-04', county: 'Greene', medicaid: 'no', appStage: 'plans', cds: 'new', help: ['bathing'], attendant: 'find', condition: 'stroke', handsOn: 'hands', selfDirect: 'yes', guardian: 'no', living: 'home' });
ok(cp.missing.length === 0 && cp.followDays === 7 && /Age \d+, lives in Greene County\./.test(cp.summary) && cp.summary.includes('No Medicaid yet, plans to apply.'), 'no Medicaid, plans to apply: 7 days, age and county in the summary');
cp = P({ who: 'self', consumer: { first: 'Opal', last: 'T' }, phone: '4175550111', county: 'Greene', medicaid: 'yes', cds: 'new', help: ['meals'], attendant: 'find' });
ok(cp.missing.includes('their date of birth') && cp.missing.includes('their DCN or birth date, to look up their Medicaid'), 'Medicaid yes, no DCN or birth date: asked for');
cp = P({ who: 'self', consumer: { first: 'Opal', last: 'T' }, phone: '4175550111', dob: '1950-01-01', county: 'Greene', medicaid: 'yes', dcn: '12345678', cds: 'new', help: ['meals'], attendant: 'find', condition: 'stroke', handsOn: 'hands', selfDirect: 'yes', guardian: 'no', living: 'home' });
ok(cp.missing.length === 0 && cp.summary.includes('Has Medicaid, DCN given.') && !cp.summary.includes('12345678'), 'DCN given: not missing, never written in the summary');
// New to CDS: eligibility answers (policy 3.25, RSMo 208.900); a transfer only needs who they are and how to reach them.
const base = { who: 'family', consumer: { first: 'Mae', last: 'Example' }, caller: { name: 'Linda', relation: 'daughter' }, phone: '4175550177', dob: '1940-03-04', county: 'Greene', medicaid: 'yes', dcn: '1', cds: 'new', help: ['bathing'], attendant: 'find', condition: 'stroke', handsOn: 'hands', selfDirect: 'yes', guardian: 'no', living: 'home', ready: 'yes' };
cp = P(base); ok(cp.flags.length === 0 && cp.next.k === 'start' && cp.summary.includes('Why they need help: stroke.') && cp.summary.includes('Needs hands-on help.'), 'new to CDS, all fits: start the profile');
const flagOf = x => P(Object.assign({}, base, x));
ok(flagOf({ dob: '2012-01-01' }).flags[0].t.startsWith('Under 18') && flagOf({ dob: '2012-01-01' }).next.k === 'review', 'under 18: the coordinator looks into it first');
ok(flagOf({ living: 'facility' }).next.k === 'review' && flagOf({ selfDirect: 'concern' }).next.k === 'review' && flagOf({ guardian: 'yes' }).next.k === 'review' && flagOf({ other: 'dmh' }).next.k === 'review' && flagOf({ handsOn: 'reminders' }).next.k === 'review', 'facility, self-direction, guardian, DMH, reminders: review first');
ok(flagOf({ living: 'hospital' }).flags.length === 0 && flagOf({ other: 'agency' }).flags.length === 0, 'hospital or another agency: no flag');
ok(flagOf({ attendant: 'has', attName: 'Bob', attRel: 'spouse' }).flags.some(x => x.k === 'att' && /spouse/.test(x.t)) && flagOf({ attendant: 'has', attName: 'Bob', attRel: 'spouse' }).next.k === 'start', 'spouse as attendant: flagged, the referral can still go (they choose someone else)');
ok(flagOf({ attendant: 'has', attName: 'Bob', attRel: 'legal guardian' }).flags.length === 1 && flagOf({ attendant: 'has', attName: 'Bob', attRel: 'son', attCds: 'yes' }).flags.length === 1, 'guardian or CDS consumer as attendant: flagged');
ok(P(Object.assign({}, base, { condition: '', handsOn: '', selfDirect: '', guardian: '', living: '' })).missing.join('|').includes('why they need help|hands-on help or reminders|whether they can direct their own care|guardian or conservator|where they live'), 'unanswered eligibility questions are missing');
const tr = { who: 'family', cds: 'move', agency: 'Other CDS Co', consumer: { first: 'Vi', last: 'Sample' }, caller: { name: 'Lou' }, phone: '4175550100', consPhone: '4175550101', dob: '1950-01-01', county: 'Greene', attendant: 'has', attName: 'Amy', ready: 'yes' };
cp = P(tr); ok(cp.missing.length === 0 && cp.flags.length === 0 && cp.next.k === 'start', 'transfer: no Medicaid, county, help or eligibility questions needed');
cp = P(Object.assign({}, tr, { consPhone: '', dob: '', attName: '', living: 'facility' }));
ok(cp.missing.join('|') === "their date of birth|the consumer's phone|the attendant's name" && cp.flags.length === 0, 'transfer: missing only who they are and how to reach them; no eligibility flags');
// Our service area (her 11-05 ask): the same 27 counties as caringcds.com/service-area; counts for transfers too.
const AREA = ['Greene', 'Christian', 'Taney'];
ok(flagOf({ area: AREA, county: 'Greene' }).flags.length === 0, 'in our counties: no flag');
cp = flagOf({ area: AREA, county: 'Other', countyOther: 'Jackson' });
ok(cp.next.k === 'review' && cp.flags[0].t === 'Lives outside our 27-county service area (Jackson).' && cp.summary.includes('lives in Jackson County'), 'another county: the coordinator looks into it first');
ok(flagOf({ area: AREA, county: 'Boone' }).flags.length === 1, 'a saved county not on our list: flagged');
cp = P(Object.assign({}, tr, { county: 'Other', countyOther: 'St. Louis County', area: AREA }));
ok(cp.next.k === 'review' && cp.flags.length === 1 && cp.missing.length === 0 && cp.flags[0].t.includes('(St. Louis County)'), 'transfer outside our counties: flagged too');
ok(P(Object.assign({}, tr, { county: '' })).missing.includes('their county'), 'transfer: county asked');
// Waiting on the state (2026-11-05): referral or transfer sent, no authorization back after the Admin days.
const SC = (st, extra) => Object.assign({ id: 'w' + Math.random(), name: 'Wes Example', status: 'starting', starting: st }, extra || {});
const T0 = '2026-11-20';
let sw = S.stateWaits({ consumers: [SC({ kind: 'new', referralSent: '2026-11-01', requestId: 'R-123' })] }, T0, () => ({ auth: false }));
ok(sw.length === 1 && sw[0].days === 19 && sw[0].why === 'Referral sent 19 days ago, no authorization yet. Check with DSDS (request R-123)', 'referral 19 days, no authorization: on Today, with the request ID');
ok(S.stateWaits({ consumers: [SC({ kind: 'new', referralSent: '2026-11-10' })] }, T0, () => ({})).length === 0, 'referral 10 days: not yet (14)');
ok(S.stateWaits({ consumers: [SC({ kind: 'new', referralSent: '2026-11-10' })] }, T0, () => ({}), { referral: 7 }).length === 1, 'Admin days count');
ok(S.stateWaits({ consumers: [SC({ kind: 'new', referralSent: '2026-11-01' })] }, T0, () => ({ auth: true })).length === 0, 'authorization on file: nothing');
ok(S.stateWaits({ consumers: [SC({ kind: 'new', referralSent: '2026-10-01', assessment: '2026-11-25' })] }, T0, () => ({})).length === 0, 'assessment still ahead: wait for it');
sw = S.stateWaits({ consumers: [SC({ kind: 'new', referralSent: '2026-10-01', assessment: '2026-11-01' })] }, T0, () => ({}));
ok(sw.length === 1 && sw[0].why.startsWith('DSDS assessment 19 days ago'), 'past assessment restarts the count');
ok(S.stateWaits({ consumers: [SC({ kind: 'move', transferEntered: '2026-11-12' })] }, T0, () => ({})).length === 1 && S.stateWaits({ consumers: [SC({ kind: 'move', transferEntered: '2026-11-15' })] }, T0, () => ({})).length === 0, 'transfer: 7 days');
ok(S.stateWaits({ consumers: [SC({ kind: 'new' }), Object.assign(SC({ kind: 'new', referralSent: '2026-10-01' }), { status: 'active' })] }, T0, () => ({})).length === 0, 'not sent yet, or already Active: nothing');
// Loose ends (2026-11-05): Today step 5 covers Starting people; ready to move to Active from the WellSky first shift.
const RL = S.readyList({ consumers: [SC({ kind: 'new' }, { name: 'Kit Ready', cdsStartDate: '2026-12-01' }), SC({ kind: 'new', readyAt: '2026-11-01' }, { name: 'Done Already' }), { id: 'a', name: 'Act Ive', status: 'active' }] }, T0, () => ({ auth: true }));
ok(RL.length === 1 && RL[0].name === 'Kit Ready' && RL[0].total === 11 && RL[0].ok >= 1 && RL[0].start === '2026-12-01' && /eMOMED/.test(RL[0].next), 'ready list: Starting, not marked ready, with the count and the next line');
ok(S.readyList({ consumers: [SC({ kind: 'new' })] }, T0, () => ({ skipKeys: ['packet'] }))[0].total === 10, 'a line the caller cannot know is left out of the count');
const nk = n => String(n || '').toLowerCase().replace(/[^a-z\s,'-]/g, '').split(/[\s,]+/).filter(Boolean).sort().join(' ');
const RA = S.readyForActive({ consumers: [SC({ kind: 'new' }, { name: 'Fay Shift' }), SC({ kind: 'new' }, { name: 'No Shift' }), { id: 'z', name: 'Act Ive', status: 'active' }] }, { people: { 'Shift, Fay': { date: '2026-11-18' }, 'Ive, Act': { date: '2026-01-01' } } }, nk);
ok(RA.length === 1 && RA[0].name === 'Fay Shift' && RA[0].firstShift === '2026-11-18', 'ready to move to Active: Starting with a WellSky first shift only');
const st5 = CR.dailyRoutine({ consumers: [], pipeline: [], firstShiftOf: () => null, startingReady: [{ id: 'k', name: 'Kit Ready', county: 'Greene', start: '2026-11-04', ok: 6, total: 11, next: 'Attendant onboarding finished' }] }, new Date('2026-11-05T17:00:00Z')).find(x => x.n === 5);
const ln5 = st5 && st5.items.find(i => /Starting consumer/.test(i.t));
ok(ln5 && ln5.t === '1 Starting consumer getting ready for the first shift' && ln5.bad && ln5.people[0].why === '6 of 11 ready; next: attendant onboarding finished', 'Today step 5 lists Starting people (red: start date passed)');
ok(S.ageOn('2000-01-01') >= 26 && S.ageOn('') === null && S.ageOn('not a date') === null, 'age from the date of birth');
ok(P({ who: 'family', medicaid: 'applied', consumer: { first: 'A' }, phone: '4175550100' }).followDays === 14, 'applied: two weeks');
ok(P({ who: 'self', consumer: { first: 'Opal', last: 'T' }, phone: '4175550111', medicaid: 'yes', cds: 'new', ready: 'yes' }).next.k === 'start', 'ready: start the profile');
ok(P({ who: 'self', consumer: { first: 'Opal', last: 'T' }, phone: '4175550111', medicaid: 'yes', cds: 'new', ready: 'not_yet' }).next.t === 'Call back to see if they are ready', 'not ready: call back');
ok(P({ who: 'solo', caller: { name: 'Jo' }, phone: '4175550155' }).next.k === 'pool', 'attendant only: Caregiver Pool');
cp = P({ who: 'family', caller: { name: 'Bea' } });
ok(cp.missing.includes("the consumer's name") && cp.missing.includes('a phone number') && cp.next.k === 'callback', 'incomplete call: missing list, call back');
ok(P({ who: 'pair', consumer: { first: 'Hal' }, caller: { name: 'Sam' }, phone: '4175550144', medicaid: 'yes', cds: 'new' }).summary.includes('Sam would be the attendant'), 'attendant with a consumer');
ok(['self', 'family', 'pair', 'solo'].every(w => S.identifierProblems(P({ who: w, consumer: { first: 'X' }, caller: { name: 'Y' }, phone: '4175550100', medicaid: 'no' }).say, {}).length === 0), 'after-call words carry no identifiers');

// Audit fix (2026-11-04): a Starting person's authorization is not a "protect the money" warning.
const dr = CR.dailyRoutine({ consumers: [{ id: '1', name: 'Pat Start', status: 'starting' }, { id: '2', name: 'Ann Active', status: 'active', cdsStartDate: '2026-01-01', contacts: {} }],
  pipeline: [], authorizations: { records: { a: { consumer: 'Pat Start', planEnd: '2026-10-01' }, b: { consumer: 'Ann Active', planEnd: '2026-10-01' } } } }, new Date('2026-11-04T17:00:00Z'));
const drTxt = JSON.stringify(dr);
ok(drTxt.includes('Ann Active') && !drTxt.includes('Pat Start'), 'dailyRoutine leaves Starting out of authorizations, calls, EIN and DES');

// The active rule leaves Starting out.
ok(!CR.isActive({ status: 'starting' }) && CR.isActive({ status: 'active' }) && CR.isActive({ status: 'pending' }), 'isActive');
ok(S.isStarting({ status: 'Starting' }), 'isStarting');

// The eMOMED Eligibility Response page, read from its PDF text (2026-11-05). A made-up person.
{
  const { readFileSync } = await import('fs');
  const txt = readFileSync(ROOT + '/tests/fixtures/emomed_sample.txt', 'utf8');
  const E = S.parseEmomed(txt);
  ok(E && E.name.first === 'Margaret' && E.name.middle === 'L' && E.name.last === 'McDonald', 'eMOMED name from Participant Information, not the typed search');
  ok(E.dcn === '01234567' && E.dob === '1940-04-12' && E.death === '', 'eMOMED DCN keeps its leading zero, birthday, no death');
  ok(E.address && E.address.street === '22 NE Oak Ridge Dr' && E.address.city === 'Republic' && E.address.state === 'MO' && E.address.zip === '65738', 'eMOMED address');
  ok(E.active === true && E.planCodes.join() === '11', 'Active Coverage with MO HealthNet, plan code passed along');
  ok(E.other.includes('Medicare Part A') && E.other.includes('Sample Health Plans') && !E.other.some(x => /MO HealthNet/.test(x)), 'other insurance listed, never MO HealthNet');
  const copay = txt.replace(/1 - Active Coverage/, '6 - Inactive');
  ok(S.parseEmomed(copay).active === false, 'a co-payment line alone is not Active Coverage');
  const dead = txt.replace('Participant Date Of Death\n', 'Participant Date Of Death\n10/01/2026\n');
  ok(S.parseEmomed(dead).death === '2026-10-01', 'date of death is read');
  ok(S.parseEmomed('An authorization letter\nParticipant Name\nX') === null && S.parseEmomed('') === null, 'not the eMOMED page: null');
  ok(S.parseEmomed(txt.replace('JUNK', '').replace('MCDONALD', 'MCDONALD\nJR')).name.last === 'McDonald Jr', 'suffix stays with the last name');
}

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
