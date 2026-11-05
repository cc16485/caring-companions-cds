// CDS Starting profile rules (2026-11-04, her approved mockup version 5 plus her eight safeguards).
//
// A consumer who says yes is saved with status 'starting'. This file decides, from what the
// profile holds, which of the seven enrollment steps are done, the one Next step, what can happen
// at the same time, the Ready for first shift checklist, and what an ME code means for CDS.
// The hub loads it with a <script> tag; the server imports it. It only reads; it never saves.
//
// ME code rules come from the official DHSS pages she named (read 2026-11-04):
//   2.00 Appendix 3, ME Category Chart, revised February 2026
//   2.00 Medicaid Eligibility, revised February 2026
//   3.25 Personal Care Assistance, State Plan (Consumer-Directed), revised January 2026
// CDS is a State Plan service (3.25), so the chart's State Plan column counts, with its notes.
// Her decisions 2026-11-04: A) 14, 15, 16 are not for in-home CDS. B) a managed care code and
// confirmed managed care enrollment are separate questions; E2 keeps its exception.
// The rules can be changed in Admin; DEFAULT_RULES is the first version.
//
// No em dashes in anything a person reads (her rule).
(function (root) {
  'use strict';

  const SOURCES = {
    chart:  { title: '2.00 Appendix 3, ME Category Chart', rev: 'February 2026',
              url: 'https://health.mo.gov/providers/manuals/home-and-community-based-services-manual/200-medicaid-eligibility/200-appendix-3' },
    policy: { title: '2.00 Medicaid Eligibility', rev: 'February 2026', url: 'https://health.mo.gov/book/export/html/3081' },
    cds:    { title: '3.25 Personal Care Assistance, State Plan (CDS)', rev: 'January 2026', url: 'https://health.mo.gov/book/export/html/3811' }
  };
  const MCW = 'Chart *: this code usually comes with a managed care health plan. DSDS cannot authorize CDS for someone in a health plan.';
  const SAME = 'State Plan Yes, no managed care mark.';
  // kind: ok (State Plan, no mark), mc (chart *), rcf (chart **, 14 to 16), child (73 to 75), notsp (State Plan No), e2 (chart ***)
  const C = (code, what, chart, kind, why, src) => ({ code, what, chart, kind, why, src: src || 'chart' });
  const DEFAULT_RULES = {
    version: '2026-11-04',
    codes: [
      C('02', 'Blind Pension', 'Yes', 'ok', 'State Plan only. 3.25 says Blind Pension may be authorized for CDS.', 'cds'),
      C('03', 'Aid to the Blind', 'Yes', 'ok', SAME),
      C('04', 'Permanently and Totally Disabled', 'Yes', 'ok', SAME),
      C('05', 'MO HealthNet for Families, Adult', 'Yes *', 'mc', MCW + ' Policy: someone cannot receive HCBS with ME 05 without leaving managed care or changing the code.', 'policy'),
      C('10', 'Refugees other than Cuban, Haitian, Russian Jew', 'Yes *', 'mc', MCW),
      C('11', 'MO HealthNet Old Age Assistance', 'Yes', 'ok', SAME),
      C('12', 'MO HealthNet, Aid to the Blind', 'Yes', 'ok', SAME),
      C('13', 'MO HealthNet, Permanently and Totally Disabled', 'Yes', 'ok', SAME),
      C('14', 'Supplemental Nursing Care, Old Age', 'Yes **', 'rcf', 'Chart **: State Plan for personal care in an RCF or ALF only, not care at home.'),
      C('15', 'Supplemental Nursing Care, Aid to the Blind', 'Yes **', 'rcf', 'Chart **: State Plan for personal care in an RCF or ALF only, not care at home.'),
      C('16', 'Supplemental Nursing Care, Permanently and Totally Disabled', 'Yes **', 'rcf', 'Chart **: State Plan for personal care in an RCF or ALF only, not care at home.'),
      C('18', 'MO HealthNet for Pregnant Women', 'Yes *', 'mc', MCW),
      C('19', 'Cuban Refugee', 'Yes *', 'mc', MCW),
      C('21', 'Haitian Refugee', 'Yes *', 'mc', MCW),
      C('24', 'Russian Jew', 'Yes *', 'mc', MCW),
      C('26', 'Ethiopian Refugee', 'Yes *', 'mc', MCW),
      C('36', 'Adoption Subsidy, Federal Financial Participation', 'Yes *', 'mc', MCW),
      C('37', 'Title XIX, Homeless, Dependent, Neglected', 'Yes *', 'mc', MCW),
      C('38', 'Independent Foster Care, ages 18 to 26', 'Yes *', 'mc', MCW),
      C('43', 'Pregnant Woman, 60 Day Assistance (MHN criteria)', 'Yes *', 'mc', MCW),
      C('44', 'Pregnant Woman, 60 Day Assistance, Poverty', 'Yes *', 'mc', MCW),
      C('45', 'Pregnant Woman, Poverty', 'Yes *', 'mc', MCW),
      C('55', 'Qualified Medicare Beneficiary (QMB)', 'No', 'notsp', 'Chart: State Plan No. Helps with Medicare costs only.'),
      C('56', 'Adoption Subsidy, Title IV-E', 'Yes *', 'mc', MCW),
      C('61', 'MO HealthNet for Pregnant Women (HIF)', 'Yes *', 'mc', MCW),
      C('73', 'Children ages 0 to 18', 'Yes *', 'child', '3.25: CDS participants must be 18 or older.', 'cds'),
      C('74', 'Children ages 0 to 18', 'Yes *', 'child', '3.25: CDS participants must be 18 or older.', 'cds'),
      C('75', 'Children ages 0 to 18', 'Yes *', 'child', '3.25: CDS participants must be 18 or older.', 'cds'),
      C('82', 'MoRx (Medicare Part D wrap-around)', 'No', 'notsp', 'Chart: State Plan No. Helps with prescriptions only.'),
      C('83', 'Breast or Cervical Cancer Control Project, Presumptive', 'Yes', 'ok', SAME),
      C('84', 'Breast or Cervical Cancer Control Project, Regular', 'Yes', 'ok', SAME),
      C('85', 'Ticket to Work Health Assurance, Premium', 'Yes', 'ok', 'State Plan Yes. The premium must be paid for today before a referral.', 'policy'),
      C('86', 'Ticket to Work Health Assurance, Non-Premium', 'Yes', 'ok', SAME),
      C('91', 'Gateway to Better Health', 'No', 'notsp', 'Chart: State Plan No.'),
      C('E2', 'Adult Expansion Group (Medicaid Expansion)', 'Yes ***', 'e2', 'Chart ***: E2 is eligible only for CDS, whatever the managed care lock-in.')
    ]
  };

  const FSD = 'Family Support Division';
  // What we say to families: a starting point, said in the coordinator's own words. Never a
  // promise of hours or a start date (her family wording rules). {name} is the consumer.
  const FAM = {
    ok: "Good news: {name}'s Medicaid is the kind that can pay for CDS. The next step is the state. We'll send the referral to DSDS, and they will set up a visit to see what help {name} needs. The state decides on the hours, so we can't say yet how many there will be. We'll call you as soon as we hear.",
    review: "We need to double-check one part of {name}'s Medicaid before we send anything to the state. Nothing is wrong yet; we just want to get it right the first time. We'll call you back soon with what we find.",
    e2dual: "{name}'s Medicaid shows two kinds of coverage, and the state asks " + FSD + " to confirm which one is right before CDS can start. Could you call " + FSD + " and ask them to check {name}'s Medicaid category for CDS? The number is on the Medicaid letters. We'll keep the file open and check back with you.",
    mc: "{name}'s Medicaid is through a health plan right now, and the state doesn't pay for CDS through health plans. So we can't start CDS with the current coverage. Some people are able to leave the health plan, and " + FSD + " can tell you if {name} can. If the coverage changes, call us and we'll pick up right where we left off. The health plan may also be able to help with care at home.",
    rcf: "{name}'s Medicaid category covers personal care in a residential care or assisted living facility, not care at home through CDS. " + FSD + " can tell you whether a different category fits now. We'll keep the file open while you check.",
    notsp: "{name}'s coverage helps with some costs, but it isn't the full Medicaid that pays for CDS. " + FSD + " can tell you if {name} qualifies for full Medicaid. We'll keep the file open, and you can call us any time.",
    child: "CDS is for adults 18 and older, so it isn't the right program for a child. We're happy to talk about other options.",
    nomed: "{name} doesn't have Medicaid yet, and CDS needs it. You can apply online, by phone, or on paper, and there are people nearby who help with the application. I'll send you the steps. Once {name} is approved, call us and we'll pick up right where we left off.",
    pend: "We looked up {name}'s Medicaid and it isn't active yet. The state can only take a CDS referral once it is. When the Medicaid letter comes, give us a call. We'll also check again on the follow-up date.",
    sd: "{name} has a spenddown, which means Medicaid starts paying each month once a set amount of medical costs is met. The state can take the referral once it's met for this month. We'll check again and call you.",
    tw: "{name}'s Ticket to Work premium shows unpaid for this month. Once it's paid, the state can take the referral. We'll check again and call you."
  };
  const fam = (k, name) => FAM[k].split('{name}').join(name || 'they');

  // Codes as typed: "13, 55", "5" (becomes 05), "e2".
  function normCodes(text) {
    return String(text || '').toUpperCase().split(/[\s,;/]+/).filter(Boolean).map(c => /^\d$/.test(c) ? '0' + c : c);
  }
  const R = (k, label, why, next, famKey, name, sup) => ({ k, label, why, next, fam: fam(famKey, name), sup: !!sup });

  // What eMOMED shows -> the answer. input: { status: active|nomed|pending|inactive, codes: [], managedCare: no|yes|unsure,
  // lockIn: none|sd_met|sd_not|tw_paid|tw_not, name }. Never a final no: k 'no' always waits for a supervisor.
  function decide(input, rules) {
    const i = input || {}, name = i.name || '';
    const by = Object.fromEntries(((rules || DEFAULT_RULES).codes || []).map(r => [r.code, r]));
    const codes = (i.codes || []).map(c => String(c).toUpperCase());
    if (i.status === 'nomed') return R('pend', 'No Medicaid yet', 'eMOMED shows no Medicaid. The state can only take a CDS referral once Medicaid is active.', 'Ask where they are with applying, send the Medicaid application instructions, and set the follow-up.', 'nomed', name);
    if (i.status === 'pending') return R('pend', 'Medicaid application pending', 'The Medicaid application is not approved yet. The state can only take a CDS referral once Medicaid is active.', 'Keep the follow-up date. Resend the application instructions if they need them.', 'pend', name);
    if (i.status !== 'active') return R('pend', 'Medicaid inactive', 'eMOMED shows no active Medicaid. New eligibility can take up to 48 hours to show.', 'Set a follow-up to check eMOMED again. They stay in Starting.', 'pend', name);
    if (!codes.length) return R('rev', 'Needs review', 'No ME code typed yet.', 'Type the code exactly as eMOMED shows it.', 'review', name);
    const unknown = codes.filter(c => !by[c]);
    if (unknown.length) return R('rev', 'Needs review', 'Code ' + unknown.join(', ') + ' is not on the DHSS chart.', 'Supervisor review. The Hub never guesses a code.', 'review', name, 1);
    const rv = codes.find(c => by[c].kind === 'review');   // a code set to "always review" in Admin
    if (rv) return R('rev', 'Needs review', 'Code ' + rv + ': ' + by[rv].why, 'Supervisor review.', 'review', name, 1);
    if (codes.includes('E2')) {
      if (codes.length > 1) return R('rev', 'Needs review', 'E2 together with another code. Policy: DSDS refers people with E2 and dual codes to ' + FSD + ' to sort out the right code.', 'Supervisor review, and ask the family to call ' + FSD + '.', 'e2dual', name, 1);
      return R('ok', 'Eligible ME code', by.E2.why, 'Send the DSDS referral, then add the date.', 'ok', name);
    }
    const kid = codes.find(c => by[c].kind === 'child');
    if (kid) return R('no', 'Not eligible for CDS: CDS is for adults', 'Code ' + kid + ': ' + by[kid].why, 'Supervisor review before closing. Talk with the family about other options.', 'child', name, 1);
    if (i.managedCare === 'yes') return R('no', 'Not eligible for CDS under current coverage', 'eMOMED shows Managed Care in Lock Ins, and none of the codes is E2. Policy: DSDS does not act for someone in a managed care health plan and refers them to the plan.', 'Supervisor review. Then call the family with the words below. They stay in Starting.', 'mc', name, 1);
    if (i.managedCare === 'unsure') return R('rev', 'Needs review', 'Managed care could not be confirmed from eMOMED.', 'Look at the Lock Ins line in eMOMED again. If it is still unclear, a supervisor reviews it.', 'review', name, 1);
    const mcCode = codes.find(c => by[c].kind === 'mc');
    if (mcCode) return R('rev', 'Needs review', 'Code ' + mcCode + ' usually comes with a managed care health plan, but eMOMED does not show managed care today.', 'Supervisor confirms they are not in a health plan today, then continue to the DSDS referral.', 'review', name, 1);
    const good = codes.find(c => by[c].kind === 'ok');
    if (!good) {
      const r = codes.find(c => by[c].kind === 'rcf');
      if (r) return R('no', 'Not eligible for standard in-home CDS under this ME category', 'Code ' + r + ': ' + by[r].why, 'Supervisor review before the enrollment can close. The family asks ' + FSD + ' whether another category fits.', 'rcf', name, 1);
      return R('no', 'Not eligible for CDS under this ME category', 'Code ' + codes[0] + ': ' + by[codes[0]].why, 'Supervisor review before closing. The family asks ' + FSD + ' about full Medicaid.', 'notsp', name, 1);
    }
    if (i.lockIn === 'sd_not') return R('rev', 'Needs review', 'Spenddown is not met for today. Policy: a referral cannot be processed until it is.', 'Set a follow-up to check eMOMED again. Supervisor review if it stays unmet.', 'sd', name, 1);
    if (i.lockIn === 'tw_not' || (good === '85' && i.lockIn !== 'tw_paid')) return R('rev', 'Needs review', 'Ticket to Work premium is not shown as paid for today. Policy: it must be paid before a referral.', 'Set a follow-up to check again once it is paid.', 'tw', name, 1);
    return R('ok', 'Eligible ME code', 'Code ' + good + ': ' + by[good].why + (i.lockIn === 'sd_met' ? ' Spenddown is met for today; Medicaid pays only in months it is met.' : ''), 'Send the DSDS referral, then add the date.', 'ok', name);
  }

  // Where Medicaid stands, from c.medicaid (her safeguards 1 and 5: application progress and a family's
  // report are never verified eligibility; only a saved eMOMED check with the PDF is).
  // c.medicaid = { checks: [{at, by, status, codes, managedCare, lockIn, dcn, pdf, result:{k,label}, rulesVersion}],
  //                reviews: [{at, by, action: approve|hold|close, note, checkAt}], flags: [{at, by, note, open}],
  //                familyReport: {at, by}, application: {stage, at, by}, followup: {date, owner}, sends: [...] }
  function medicaidState(c, rulesVersion) {
    const m = (c && c.medicaid) || {};
    const checks = (m.checks || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const last = checks[checks.length - 1] || null;
    const review = last ? (m.reviews || []).filter(r => r.checkAt === last.at).slice(-1)[0] || null : null;
    const openFlag = (m.flags || []).some(f => f.open);
    const reported = m.familyReport && (!last || String(m.familyReport.at) > String(last.at));
    const approved = !!(review && review.action === 'approve');
    const clean = !!(last && last.status === 'active' && last.pdf && last.result && (last.result.k === 'ok' || approved));
    const verified = clean && !openFlag && !reported;
    const ruleChanged = !!(last && rulesVersion && last.rulesVersion && last.rulesVersion !== rulesVersion);
    let label, tone;
    if (reported) { label = 'Family reports Medicaid approved. Verification needed'; tone = 'warn'; }
    else if (verified) { label = 'Verified Active' + (approved && last.result.k !== 'ok' ? ', approved by a supervisor' : ''); tone = 'ok'; }
    else if (!last) { label = m.application && m.application.stage ? 'No Medicaid yet' : 'Not yet verified'; tone = 'warn'; }
    else if (last.result && last.result.sup && !review) { label = last.result.label + '. Waiting on a supervisor'; tone = 'warn'; }
    else { label = (last.result && last.result.label) || 'Not yet verified'; tone = 'warn'; }
    return { last, review, verified, reported: !!reported, openFlag, ruleChanged, label, tone,
             application: m.application || null, followup: m.followup || null,
             needsSupervisor: !!(last && last.result && last.result.sup && !review) || openFlag };
  }

  // The seven enrollment steps. ctx: { today, firstShift (yyyy-mm-dd or ''), auth (bool: a DSDS
  // authorization on file), packet ({signed, done} from the enrollment packet), attendant
  // ({name, linked, ready}), rulesVersion }.
  const STEP_TITLES = ['Initial conversation', 'Medicaid verification', 'State approval', 'Consumer paperwork',
                       'Attendant setup', 'Ready for first shift', 'Active services'];
  function startingSteps(c, ctx) {
    ctx = ctx || {};
    const s = (c && c.starting) || {}, med = medicaidState(c, ctx.rulesVersion);
    const transfer = s.kind === 'move';
    const packet = ctx.packet || {}, att = ctx.attendant || {};
    const gate = readyGate(c, ctx, med);
    const gateOk = gate.every(g => g.ok);
    const done = {
      conversation: true,
      medicaid: med.verified,
      state: !!ctx.auth && !!(c && c.cdsStartDate),   // her rule 2026-11-04: the state gives a start date
      paperwork: !!packet.done,
      attendant: !!att.ready,
      ready: !!s.readyAt && gateOk,
      active: !!ctx.firstShift
    };
    const keys = ['conversation', 'medicaid', 'state', 'paperwork', 'attendant', 'ready', 'active'];
    const first = keys.find(k => !done[k]) || null;
    // Paperwork and the attendant can start while the state decides (her design).
    const side = k => !done[k] && (k === 'paperwork' || k === 'attendant') && first !== k && first !== 'ready' && first !== 'active';
    const steps = keys.map((k, n) => ({ k, t: STEP_TITLES[n], state: done[k] ? 'done' : k === first ? 'now' : side(k) ? 'side' : 'todo' }));
    const count = keys.filter(k => done[k]).length;
    let next;
    if (first === 'medicaid') {
      if (med.reported) next = { t: 'Verify the new Medicaid in eMOMED', d: 'The family says Medicaid is approved. Look it up, upload the eligibility page, type the ME code and Lock Ins, and save.', act: 'medicaid' };
      else if (med.needsSupervisor) next = { t: 'Waiting on supervisor review of Medicaid', d: med.label + '.', act: 'medicaid' };
      else if (med.application && !med.last) next = { t: 'Medicaid application follow-up' + (med.followup && med.followup.date ? ', ' + med.followup.date : ''), d: 'Check how the application is going. When the family says it is approved, verify it in eMOMED.', act: 'medicaid' };
      else next = { t: 'Medicaid verification', d: 'Look them up in eMOMED, upload the eligibility page, and type the ME code and Lock Ins. The Hub says what the code means.', act: 'medicaid' };
    } else if (first === 'state' && ctx.auth && !(c && c.cdsStartDate)) {
      next = { t: 'Add the start date the state gave', d: 'The consumer and the attendant must be ready to clock in on that day.', act: 'state' };
    } else if (first === 'state') {
      next = transfer
        ? { t: 'Transfer: confirm the current authorization', d: 'Enter the transfer in the state portal and upload the authorization when it comes.', act: 'state' }
        : s.referralSent
          ? { t: 'Waiting on DSDS', d: 'Referral sent ' + s.referralSent + '. Upload the authorization the day it arrives.', act: 'state' }
          : { t: 'Send the DSDS referral', d: 'Medicaid is verified. Send the referral, then add the date. Medicaid eligibility is not DSDS approval.', act: 'state' };
    } else if (first === 'paperwork') next = { t: 'Consumer paperwork', d: packet.signed ? 'Sign the packet as agent.' : 'Send the enrollment packet and get it signed.', act: 'paperwork' };
    else if (first === 'attendant') next = { t: att.linked ? 'Finish ' + (att.name || 'the attendant') + "'s onboarding" : 'Link or find an attendant', d: att.linked ? 'Checks, orientation, payroll and EVV.' : 'Link the attendant they chose, or open Caregiver Match.', act: 'attendant' };
    else if (first === 'ready') next = gateOk ? { t: 'Mark ready for first shift', d: 'Every item on the checklist is done.', act: 'ready' } : { t: 'Finish the Ready for first shift checklist', d: gate.filter(g => !g.ok).map(g => g.t).join('; ') + '.', act: 'ready' };
    else if (first === 'active') next = { t: 'Waiting for the first shift in WellSky', d: 'They move to Active by themselves the day WellSky shows their first shift.', act: 'active' };
    else next = { t: 'Ready to move to Active', d: 'WellSky shows the first shift.', act: 'active' };
    // The start date (her rule 2026-11-04): both must be able to clock in that day. Counted down until they are ready.
    const sd = c && c.cdsStartDate, today = ctx.today || '';
    const daysLeft = sd && today ? Math.round((Date.parse(sd + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / 864e5) : null;
    const startAlert = sd && !(s.readyAt && gateOk) && !done.active ? { date: sd, days: daysLeft, late: daysLeft !== null && daysLeft < 0, soon: daysLeft !== null && daysLeft <= 7,
      missing: gate.filter(g => !g.ok).map(g => g.t) } : null;
    if (startAlert && startAlert.soon) next = Object.assign({}, next, { t: (startAlert.late ? 'Start date passed ' : 'Start date in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ': ') + next.t, urgent: true });
    const also = [];
    if (first === 'medicaid' || first === 'state') {
      if (!done.paperwork) also.push({ t: packet.signed ? 'Sign the enrollment packet as agent' : 'Send the enrollment packet', act: 'paperwork' });
      if (!done.attendant) also.push({ t: att.linked ? 'Start ' + (att.name || 'the attendant') + "'s onboarding" : 'Link or find an attendant', act: 'attendant' });
    }
    return { steps, count, of: keys.length, next, also, gate, gateOk, medicaid: med, transfer, startAlert };
  }

  // Ready for first shift: every line must be true (her safeguard list).
  function readyGate(c, ctx, med) {
    ctx = ctx || {};
    med = med || medicaidState(c, ctx.rulesVersion);
    const last = med.last, packet = ctx.packet || {}, att = ctx.attendant || {};
    return [
      { k: 'active',   t: 'Active Medicaid verified in eMOMED', ok: !!(last && last.status === 'active') && !med.reported },
      { k: 'code',     t: 'ME code reviewed: eligible, or approved by a supervisor', ok: med.verified },
      { k: 'pdf',      t: 'eMOMED eligibility PDF uploaded', ok: !!(last && last.pdf) },
      { k: 'flags',    t: 'No open eligibility flags or questions', ok: !med.openFlag && !med.needsSupervisor },
      { k: 'auth',     t: 'DSDS authorization confirmed and uploaded', ok: !!ctx.auth },
      { k: 'start',    t: 'Start date from the state on file', ok: !!(c && c.cdsStartDate) },
      { k: 'packet',   t: 'Enrollment packet signed, and signed as agent', ok: !!packet.done },
      { k: 'attendant',t: 'Attendant onboarding finished', ok: !!att.ready },
      { k: 'wellsky',  t: 'Authorization and tasks in WellSky', ok: !!(c && c.firstShiftPrep && c.firstShiftPrep.authWellSky && c.firstShiftPrep.tasksWellSky) },
      { k: 'consumerClock', t: 'The consumer can clock in on the start date (EVV set up, told how)', ok: !!(c && c.firstShiftPrep && c.firstShiftPrep.toldClockIn) },
      { k: 'attendantClock', t: 'The attendant can clock in on the start date (WellSky app set up)', ok: !!att.ready && !!(c && c.starting && c.starting.attClockIn) }
    ];
  }

  // Medicaid application follow-ups for Today and the 8am email: Starting consumers and leads with a
  // follow-up date. owner is the coordinator who owns the person (her safeguard 3).
  function applicationFollowups(data, todayIso) {
    const out = [];
    const add = (p, kind) => {
      const f = p.medicaid && p.medicaid.followup;
      if (!f || !f.date || f.done) return;
      if (p.medicaid && medicaidState(p).verified) return;
      out.push({ name: p.name, id: p.id, kind, due: f.date, owner: f.owner || p.coordinator || '', late: f.date < todayIso, today: f.date === todayIso,
                 why: 'Check the Medicaid application' + (p.medicaid.application && p.medicaid.application.stage ? ' (' + STAGES[p.medicaid.application.stage] + ')' : '') });
    };
    (data.consumers || []).filter(isStarting).forEach(c => add(c, 'consumer'));
    (data.pipeline || []).filter(p => p.medicaid && !p.movedToConsumers).forEach(p => add(p, 'lead'));
    return out.filter(x => x.due <= todayIso).sort((a, b) => a.due.localeCompare(b.due));
  }
  // Start dates close and not ready (Today and the 8am email): within 7 days or passed, owner = coordinator.
  function startDateAlerts(data, todayIso, ctxOf) {
    return (data.consumers || []).filter(isStarting).filter(c => c.cdsStartDate).map(c => {
      const cx = ctxOf ? ctxOf(c) : {}, skip = cx.skipKeys || [];   // lines the caller cannot know are left out, never guessed
      const st = startingSteps(c, Object.assign({ today: todayIso }, cx));
      const a = st.startAlert, miss = st.gate.filter(g => !g.ok && !skip.includes(g.k)).map(g => g.t);
      return a && a.soon && miss.length ? { name: c.name, id: c.id, due: a.date, late: a.late, owner: c.coordinator || '', why: 'start date, not ready: ' + miss.slice(0, 3).join('; ') + (miss.length > 3 ? '; and more' : '') } : null;
    }).filter(Boolean).sort((a, b) => a.due.localeCompare(b.due));
  }
  const STAGES = { applied: 'already applied', help: 'needs help applying', plans: 'plans to apply' };
  // Her default follow-up gaps (mockup version 5): days after today.
  const FOLLOWUP_DAYS = { applied: 14, help: 3, plans: 7 };

  const isStarting = c => !!c && String(c.status || '').toLowerCase() === 'starting';

  // ---- Medicaid application instructions (editable in Admin) ----
  // One resource list; both templates read it through {tokens}. Lines between [[abd]] and [[/abd]]
  // appear only when the Aged, Blind and Disabled form applies.
  const DEFAULT_RESOURCES = [
    { key: 'apply_online', label: 'Apply online', value: 'https://mydss.mo.gov/healthcare' },
    { key: 'apply_phone',  label: 'Apply by phone', value: '855-373-9994' },
    { key: 'apply_info',   label: 'Instructions and printable form', value: 'https://dss.mo.gov/healthcare/apply' },
    { key: 'paper_form',   label: 'Printable application (IM-1SSL)', value: 'https://dssmanuals.mo.gov/wp-content/uploads/2020/09/IM-1SSL-Fillable-Secured-6-24-21.pdf' },
    { key: 'abd_form',     label: 'Aged, Blind and Disabled form (IM-1ABD)', value: 'https://formsportal.mo.gov/content/forms/af/moa/my-dss/family-support-division/mo-healthnet-for-the-aged--blind--and-disabled/IM-1ABDSV3.html' },
    { key: 'upload',       label: 'Upload completed forms', value: 'https://mydssupload.mo.gov' },
    { key: 'mail',         label: 'Mail', value: 'Family Support Division, P.O. Box 2700, Jefferson City, MO 65102' },
    { key: 'fax',          label: 'Fax', value: '573-526-9400' },
    { key: 'help_jvh',     label: 'Jordan Valley Health', value: '417-831-0150', note: 'Community health workers help with Medicaid applications.', url: 'https://www.jordanvalley.org/missouri-medicaid/' },
    { key: 'help_apo',     label: 'APO', value: '417-881-1900', note: 'Medicaid enrollment specialists.', url: 'https://apo-ozarks.org/services/medicaid-application-assistance/' },
    { key: 'help_senior',  label: 'SeniorAge', value: '417-862-0762', note: 'Benefits guidance for older adults; ask whether they can help with the application.', url: 'https://www.senioragemo.org/' },
    { key: 'cds_phone',    label: 'Our CDS line', value: '417-218-2888' }
  ];
  const DEFAULT_TEMPLATES = {
    callText: "Hi {caller}, it's {coordinator} with Caring Companions CDS. {next} Questions? Call or text us at {cds_phone}.",
    text: "Hi {caller}, it's {coordinator} with Caring Companions CDS. Here's how to apply for Missouri Medicaid for {consumer}:\n" +
      'Online: {apply_online}\nBy phone: {apply_phone}\n' +
      '[[abd]]Because {consumer} is 65 or older, blind or disabled, also ask for the Aged, Blind and Disabled form (IM-1ABD).\n[[/abd]]' +
      'Help applying: Jordan Valley Health {help_jvh} or APO {help_apo}.\n' +
      'When {consumer} is approved, call or text us at {cds_phone}.',
    emailSubject: 'How to apply for Missouri Medicaid for {consumer}',
    email: 'Hi {caller},\n\nThank you for talking with us about {consumer}. CDS is paid for by Missouri Medicaid, so the first step is applying. Here are all the ways to do it. Pick whichever is easiest for you.\n\n' +
      'APPLY\n- Online: {apply_online}\n- By phone: {apply_phone}\n- On paper: print the application at {paper_form} (instructions: {apply_info})\n\n' +
      '[[abd]]IMPORTANT FOR {consumer}\nBecause {consumer} is 65 or older, blind or disabled, the state also needs the MO HealthNet for the Aged, Blind and Disabled form (IM-1ABD):\n{abd_form}\n\n[[/abd]]' +
      'SENDING PAPER FORMS\n- Upload: {upload}\n- Mail: {mail}\n- Fax: {fax}\n\n' +
      'HELP WITH THE APPLICATION, CLOSE TO HOME\n- Jordan Valley Health, {help_jvh}. Their community health workers help with Medicaid applications.\n- APO, {help_apo}. Medicaid enrollment specialists.\n- SeniorAge, {help_senior}. Benefits guidance for older adults; ask whether they can help with the application.\n\n' +
      "WHAT HAPPENS NEXT\nOnce {consumer} is approved, call or text us at {cds_phone}. We'll check the Medicaid and send the referral to the state for CDS. We'll also check in with you on the date we set.\n\n" +
      'Thank you,\n{coordinator}\nCaring Companions Consumer Directed Services\n{cds_phone} · intake@caringcds.com'
  };
  // vars: { caller, consumer, coordinator, abd (bool) }; resources: the Admin list.
  function fillTemplate(tpl, vars, resources) {
    const v = vars || {};
    let t = String(tpl || '').replace(/\[\[abd\]\]([\s\S]*?)\[\[\/abd\]\]/g, (_, inner) => v.abd ? inner : '');
    const map = { caller: v.caller || 'there', consumer: v.consumer || 'your family member', coordinator: v.coordinator || 'the Caring Companions team' };
    (resources || DEFAULT_RESOURCES).forEach(r => { map[r.key] = r.value; });
    return t.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  }
  // Her safeguard 6: no Medicaid identifiers or eligibility details in ordinary texts or emails.
  // ids: { dcn, codes } from the profile. Returns the reasons it was stopped, or [].
  function identifierProblems(body, ids) {
    const b = String(body || ''), out = [];
    const dcn = String((ids && ids.dcn) || '').replace(/\D/g, '');
    if (dcn.length >= 6 && b.replace(/\D/g, ' ').split(/\s+/).includes(dcn)) out.push('their DCN');
    if (/\bDCN\b|\bME\s*code\b|\bMO\s*HealthNet\s*(?:ID|number)\b|\bMedicaid\s*(?:ID|number)\b/i.test(b)) out.push('a Medicaid number or ME code');
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(b)) out.push('a Social Security number');
    if (/\b(?:eligible|not eligible|ineligible|managed care|spenddown|lock[- ]?ins?)\b/i.test(b)) out.push('eligibility details');
    return out;
  }
  // Her safeguard 4: warn about instructions sent recently (default 7 days), never block.
  function recentSends(sends, nowIso, days) {
    const since = new Date(new Date(nowIso).getTime() - (days || 7) * 864e5).toISOString();
    return (sends || []).filter(s => s.status !== 'failed' && String(s.at) >= since);
  }


  // ---- The first call (2026-11-04, her ask: one connected workflow from the moment someone calls) ----
  // C = { who: self|family|pair|solo|unsure, consumer: {first, last}, caller: {name, relation}, phone, medicaid: yes|no|applied|unsure,
  //       cds: new|move|unsure, agency, help: [], helpNote, attendant: has|find|unsure, attName, ready: yes|not_yet|'',
  //       dob (yyyy-mm-dd), dobSkip, dcn, dcnUnknown, county, appStage: help|plans (no Medicaid yet),   (guided call 2026-11-05)
  //       new to CDS only (her 11-05 ask, policy 3.25 Jan 2026, RSMo 208.900-.909, policy 4.10 Sept 2024):
  //       condition, handsOn: hands|reminders|unsure, selfDirect: yes|concern|unsure, guardian: no|yes|unsure,
  //       living: home|family|hospital|facility|unsure, other: none|agency|dmh|unsure,
  //       attRel (how the attendant is related), attCds: no|yes|unsure, consPhone, consEmail }
  // A transfer (cds 'move') is already approved by the state: only names, birth date, contacts and the attendant.
  // Unknown answers are fine; they become "still missing". Returns the Finish call plan.
  // Close to the state assessment's areas (policy 4.10): bathing, dressing and grooming, eating, toileting, mobility, meal prep, medications.
  const HELP = { bathing: 'bathing', dressing: 'dressing and grooming', eating: 'eating', toileting: 'toileting', mobility: 'getting around and transfers', meals: 'meals', meds: 'medications', housekeeping: 'housekeeping', errands: 'errands and rides' };
  // Answers that need a second look before a referral (her 11-05 decision: Samantha or Zach decides; nothing is told to the family here).
  // k: 'review' = Samantha or Zach looks first; 'att' = the attendant in mind cannot be the paid attendant.
  function callFlags(C) {
    C = C || {};
    const f = [];
    if (C.who === 'solo') return f;
    const age = ageOn(C.dob);
    if (C.cds !== 'move') {
      if (age !== null && age < 18) f.push({ k: 'review', t: 'Under 18. CDS is for adults 18 and older (policy 3.25).' });
      if (C.living === 'facility') f.push({ k: 'review', t: 'Lives in a nursing home, RCF or assisted living. People living there are not eligible for CDS (policy 3.25).' });
      if (C.selfDirect === 'concern') f.push({ k: 'review', t: 'May not be able to direct their own care (hire, train and supervise the attendant). Policy 3.25.' });
      if (C.guardian === 'yes') f.push({ k: 'review', t: 'Has a guardian or conservator. The law and policy 3.25 read differently here.' });
      if (C.other === 'dmh') f.push({ k: 'review', t: 'Gets DMH services. DMH self-directed services and CDS do not go together (policy 3.25).' });
      if (C.handsOn === 'reminders') f.push({ k: 'review', t: 'Mostly reminders or someone nearby. The state pays only for hands-on help (policy 3.25).' });
    }
    if (C.who !== 'pair' && C.attendant === 'has' || C.who === 'pair') {
      if (C.attRel === 'spouse') f.push({ k: 'att', t: 'The attendant in mind is their spouse. A spouse cannot be the paid attendant (RSMo 208.900).' });
      if (C.attRel === 'legal guardian') f.push({ k: 'att', t: 'The attendant in mind is their legal guardian. A legal guardian cannot be the attendant (policy 3.25).' });
      if (C.attCds === 'yes') f.push({ k: 'att', t: 'The attendant in mind gets CDS services too. A CDS consumer cannot be an attendant (policy 3.25).' });
    }
    return f;
  }
  const ageOn = dob => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob || '')); if (!m) return null; const t = new Date(), a = t.getFullYear() - +m[1] - ((t.getMonth() + 1 < +m[2] || (t.getMonth() + 1 === +m[2] && t.getDate() < +m[3])) ? 1 : 0); return a >= 0 && a < 125 ? a : null; };
  function callPlan(C) {
    C = C || {};
    const cn = [C.consumer && C.consumer.first, C.consumer && C.consumer.last].filter(Boolean).join(' ');
    const first = (C.consumer && C.consumer.first) || 'them';
    const caller = C.who === 'self' ? cn : (C.caller && C.caller.name) || '';
    const help = (C.help || []).map(h => HELP[h] || h);
    const about = C.who === 'self' ? '' : ' about ' + first;   // the consumer calling for themself is thanked, not told about themself
    const parts = [];
    if (C.who === 'solo') parts.push((caller || 'A caller') + ' wants to be a paid attendant and has no one to care for yet.');
    else {
      parts.push(C.who === 'self' ? (cn || 'The consumer') + ' called for themself.'
        : (caller || 'Someone') + (C.caller && C.caller.relation ? ' (' + C.caller.relation + ')' : '') + (C.who === 'pair' ? ', who would be the attendant,' : '') + ' called about ' + (cn || 'someone') + '.');
      const age = ageOn(C.dob);
      if (age !== null || C.county) parts.push([age !== null ? 'Age ' + age : '', C.county ? 'lives in ' + C.county + ' County' : ''].filter(Boolean).join(', ').replace(/^l/, 'L') + '.');
      parts.push({ yes: 'Has Medicaid' + (C.dcn ? ', DCN given.' : '.'), no: 'No Medicaid yet' + (STAGES[C.appStage] ? ', ' + STAGES[C.appStage] + '.' : '.'), applied: 'Applied for Medicaid, waiting.', unsure: 'Not sure about Medicaid.' }[C.medicaid] || (C.cds === 'move' ? '' : 'Medicaid not asked.'));
      parts.push({ new: 'New to CDS.', move: 'Has CDS now' + (C.agency ? ' with ' + C.agency : '') + ' and wants to switch.', unsure: 'Not sure if they have CDS.' }[C.cds] || '');
      if (C.condition) parts.push('Why they need help: ' + String(C.condition).trim().replace(/\.$/, '') + '.');
      parts.push({ hands: 'Needs hands-on help.', reminders: 'Mostly needs reminders or someone nearby.' }[C.handsOn] || '');
      parts.push({ yes: 'Can direct their own care.', concern: 'May not be able to direct their own care.' }[C.selfDirect] || '');
      parts.push({ yes: 'Has a guardian or conservator.' }[C.guardian] || '');
      parts.push({ home: 'Lives at home.', family: 'Lives with family.', hospital: 'In the hospital or rehab now.', facility: 'Lives in a nursing home, RCF or assisted living.' }[C.living] || '');
      parts.push({ agency: 'Gets help from another agency now.', dmh: 'Gets DMH services now.' }[C.other] || '');
      if (help.length || C.helpNote) parts.push('Needs help with ' + help.join(', ') + (help.length && C.helpNote ? '; ' : '') + (C.helpNote || '') + '.');
      if (C.who === 'pair') parts.push((caller || 'The caller') + ' would be the attendant.');
      else parts.push({ has: (C.attName || 'Someone') + ' may be the attendant.', find: 'Needs us to find an attendant.', unsure: 'Not sure about an attendant yet.' }[C.attendant] || '');
      if (C.attRel && (C.who === 'pair' || C.attendant === 'has')) parts.push('Attendant is their ' + C.attRel + '.');
      parts.push({ yes: 'They want to go ahead.', not_yet: 'Not ready to go ahead yet.' }[C.ready] || '');
    }
    const summary = parts.filter(Boolean).join(' ');
    const missing = [];
    const flags = callFlags(C);
    if (C.who !== 'solo' && C.cds === 'move') {
      // A transfer: the state already approved them. Names, birth date, contacts, the attendant.
      if (!cn) missing.push("the consumer's name");
      if (C.who !== 'self' && !caller) missing.push("the caller's name");
      if (!C.dob) missing.push('their date of birth');
      if (!String((C.who === 'self' ? C.phone : C.consPhone) || '').replace(/\D/g, '')) missing.push("the consumer's phone");
      if (C.who !== 'self' && !String(C.phone || '').replace(/\D/g, '')) missing.push("the caller's phone");
      if (!C.agency) missing.push('the agency they are leaving');
      if (C.who === 'pair' || C.attendant === 'has') { if (!(C.who === 'pair' ? caller : C.attName)) missing.push("the attendant's name"); }
      else if (!C.attendant || C.attendant === 'unsure') missing.push('whether they have an attendant');
    } else if (C.who !== 'solo') {
      if (!cn) missing.push("the consumer's name");
      if (C.who !== 'self' && !caller) missing.push("the caller's name");
      if (!String(C.phone || '').replace(/\D/g, '')) missing.push('a phone number');
      if (!C.dob) missing.push('their date of birth');
      if (!C.county) missing.push('their county');
      if (!C.medicaid || C.medicaid === 'unsure') missing.push('Medicaid (look them up in eMOMED by name and birth date)');
      else if (C.medicaid === 'yes' && !C.dcn) missing.push(C.dob ? 'their DCN (or look them up in eMOMED by name and birth date)' : 'their DCN or birth date, to look up their Medicaid');
      if (!C.cds || C.cds === 'unsure') missing.push('new to CDS or moving from another agency');
      if (!help.length && !C.helpNote) missing.push('the help they need at home');
      if (C.who !== 'pair' && (!C.attendant || C.attendant === 'unsure')) missing.push('whether they have an attendant in mind');
      if (!C.condition) missing.push('why they need help');
      if (!C.handsOn || C.handsOn === 'unsure') missing.push('hands-on help or reminders');
      if (!C.selfDirect || C.selfDirect === 'unsure') missing.push('whether they can direct their own care');
      if (!C.guardian || C.guardian === 'unsure') missing.push('guardian or conservator');
      if (!C.living || C.living === 'unsure') missing.push('where they live');
    } else {
      if (!caller) missing.push('their name');
      if (!String(C.phone || '').replace(/\D/g, '')) missing.push('a phone number');
    }
    // One recommended next step, most important first.
    let next, days, say;
    if (C.who === 'solo') { next = { k: 'pool', t: 'Move them to the Caregiver Pool' }; days = 0; say = "Thank you for calling Caring Companions CDS about being an attendant. We'll keep your name and number and reach out when a family near you needs someone."; }
    else if (C.ready === 'yes') { next = { k: 'start', t: 'Start ' + first + "'s profile" }; days = 1; say = "Thank you for calling" + about + ". We'll get started on the next steps and call you with what comes next."; }
    else if (C.medicaid === 'no' || C.medicaid === 'applied') { next = { k: 'medicaid', t: 'Send the Medicaid application instructions' }; days = FOLLOWUP_DAYS[C.medicaid === 'applied' ? 'applied' : (C.appStage || 'help')] || 3; say = "Thank you for calling" + about + ". CDS is paid for by Medicaid, so I'm sending you the steps to apply in a separate message."; }
    else if (!cn || !String(C.phone || '').replace(/\D/g, '')) { next = { k: 'callback', t: 'Call back for ' + (!cn ? "the consumer's name" : 'a phone number') }; days = 1; say = ''; }
    else if (!C.medicaid || C.medicaid === 'unsure' || C.medicaid === 'yes') { next = { k: 'emomed', t: 'Look ' + first + ' up in eMOMED' }; days = 2; say = "Thank you for calling" + about + ". We'll check a few things on our end and call you back."; }
    else { next = { k: 'callback', t: 'Call back to see if they are ready' }; days = 7; say = "Thank you for calling" + about + ". Take your time; we'll check back in with you."; }
    if (C.who !== 'solo' && flags.some(x => x.k === 'review') && next.k !== 'pool') { next = { k: 'review', t: 'Samantha or Zach looks at this before anything is sent to the state' }; days = 1; say = "Thank you for calling" + about + ". We'll look at a few things on our end and call you back."; }
    if (C.ready === 'not_yet' && next.k !== 'medicaid' && next.k !== 'pool' && next.k !== 'review') { next = { k: 'callback', t: 'Call back to see if they are ready' }; days = 7; say = "Thank you for calling" + about + ". Take your time; we'll check back in with you."; }
    return { summary, missing, next, followDays: days, say, consumerName: cn, callerName: caller, flags };
  }
  root.CDSStarting = { SOURCES, DEFAULT_RULES, FAM, normCodes, decide, medicaidState, startingSteps, readyGate, STEP_TITLES,
                       applicationFollowups, STAGES, FOLLOWUP_DAYS, isStarting, DEFAULT_RESOURCES, DEFAULT_TEMPLATES,
                       fillTemplate, identifierProblems, recentSends, callPlan, callFlags, HELP, startDateAlerts, ageOn };
})(typeof globalThis !== 'undefined' ? globalThis : this);
