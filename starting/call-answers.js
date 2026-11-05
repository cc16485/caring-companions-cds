// CDS Hub · answers from a recorded call (2026-11-05, Samantha: "Mock up recorded calls filling the lead answers for the
// office to OK, then build it"; mockup https://claude.ai/artifact/W47w6qkzLLB3FF91iEJ8J1). window.CallAnswers.
// The server's call note (cds-comms, switch call_notes) carries the answers heard on the call, the same questions as the
// first call screen. Here: what each answer is next to what the lead already has (new, the same, or different), and,
// when someone presses OK, the ticked ones written onto the lead, each remembering the call it came from (p.fromCalls).
// A different answer is never ticked for them: the office listens first. Nothing is sent to anyone. No em dashes.
(function (root) {
  'use strict';
  const HELP = { bathing: 'bathing', dressing: 'dressing and grooming', eating: 'eating', toileting: 'toileting', mobility: 'getting around and transfers',
    meals: 'meals', meds: 'medications', housekeeping: 'housekeeping', errands: 'errands and rides' };
  const WHO = { self: 'For themself', family: 'For a family member', pair: 'Caregiver with a consumer', solo: 'Caregiver, no consumer' };
  const MED = { yes: 'Has Medicaid', no: 'No Medicaid', applied: 'Applied, waiting' };
  const CDS = { new: 'New to CDS', move: 'Moving from another agency' };
  const LABEL = { who: 'Who called', name: 'Name', dob: 'Date of birth', county: 'County', medicaid: 'Medicaid', dcn: 'DCN', cds: 'New or moving',
    agency: 'Agency now', help: 'Help needed', attendant: 'Attendant' };
  const ORDER = ['who', 'name', 'dob', 'county', 'medicaid', 'dcn', 'cds', 'agency', 'help', 'attendant'];
  const MED_OF = { active: 'yes', inactive: 'no', pending: 'applied' };
  const MED_TO = { yes: 'active', no: 'inactive', applied: 'pending' };
  const low = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const phone = d => { d = String(d || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : ''; };
  const isoDay = v => { const t = String(v || '').trim(); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : ''; };
  const niceDay = iso => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const ageOn = (dob, today) => { const a = dob.split('-').map(Number), b = String(today || '').split('-').map(Number); if (a.length < 3 || b.length < 3) return null; return b[0] - a[0] - (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2]) ? 1 : 0); };
  // A lead named by who called ("Caller: Kim", "Unknown caller") has no name of its own yet.
  const placeholder = n => !String(n || '').trim() || /^(caller:|unknown caller|no name)/i.test(String(n).trim());
  const cdsOf = p => p.cdsHistory || (p.type === 'pccp' ? 'move' : p.type === 'referral' ? 'new' : '');

  // One row per answer heard on the call: { k, label, value, current, state: new | same | differs, tick }.
  function rows(p, a, today) {
    a = a || {}; p = p || {};
    const out = [];
    const add = (k, value, current, same) => { if (!value) return; const state = !current ? 'new' : same ? 'same' : 'differs'; out.push({ k, label: LABEL[k], value, current: current || '', state, tick: state === 'new' }); };
    if (a.who) add('who', WHO[a.who], p.whoCalled && p.whoCalled !== 'unsure' ? (WHO[p.whoCalled] || '') : '', p.whoCalled === a.who);
    const nm = [a.first, a.last].filter(Boolean).join(' ');
    if (nm) add('name', nm, placeholder(p.name) ? '' : p.name, low(p.name) === low(nm) || (!a.last && low(p.name).split(' ')[0] === low(a.first)));
    if (a.dob) { const cur = isoDay(p.dob || (p.referral || {}).dob), age = ageOn(a.dob, today); add('dob', niceDay(a.dob) + (age != null && age >= 0 ? ' (' + age + ')' : ''), cur ? niceDay(cur) : '', cur === a.dob); }
    if (a.county) add('county', cap(a.county), p.county || '', low(p.county).replace(/ county$/, '') === low(a.county));
    if (a.medicaid) add('medicaid', MED[a.medicaid], MED[MED_OF[p.medicaidStatus]] || '', MED_OF[p.medicaidStatus] === a.medicaid);
    if (a.dcn) { const cur = String(p.dcn || (p.referral || {}).dcn || '').replace(/\D/g, ''); add('dcn', a.dcn, cur, cur === a.dcn); }
    if (a.cds) add('cds', CDS[a.cds], CDS[cdsOf(p)] || '', cdsOf(p) === a.cds);
    if (a.agency) add('agency', a.agency, p.leavingAgency || p.currentAgency || '', low(p.leavingAgency || p.currentAgency) === low(a.agency));
    if ((a.help || []).length || a.help_note) {
      const have = Array.isArray(p.helpNeeded) ? p.helpNeeded : [], more = (a.help || []).filter(h => !have.includes(h));
      const words = (a.help || []).map(h => HELP[h] || h).join(', ');
      const value = cap([words, a.help_note].filter(Boolean).join('; '));
      out.push({ k: 'help', label: LABEL.help, value, current: have.map(h => HELP[h] || h).join(', '), state: !have.length ? 'new' : more.length || (a.help_note && !p.helpNote) ? 'adds' : 'same', tick: !have.length || more.length > 0 || (!!a.help_note && !p.helpNote) });
    }
    if (a.attendant === 'has' && a.att_name) {
      const cur = (p.attendant && p.attendant.name) || '';
      add('attendant', [a.att_name, a.att_relation, phone(a.att_phone)].filter(Boolean).join(', '), cur, low(cur) === low(a.att_name));
    } else if (a.attendant === 'find') add('attendant', 'Needs us to find one', p.caregiverPlan === 'find' ? 'Needs us to find one' : (p.attendant && p.attendant.name) || '', p.caregiverPlan === 'find');
    out.sort((x, y) => ORDER.indexOf(x.k) - ORDER.indexOf(y.k));
    return out;
  }

  // Write the ticked answers onto the lead (the same fields the first call screen writes). meta = { id, at, by }.
  function apply(p, a, keys, meta) {
    a = a || {}; meta = meta || {};
    const did = [];
    const mark = k => { did.push(k); p.fromCalls = Object.assign({}, p.fromCalls, { [k]: { id: meta.id || '', at: meta.at || '' } }); };
    const on = new Set(keys || []);
    if (on.has('who') && a.who) { p.whoCalled = a.who; p.whoCalledBy = meta.by || 'office'; p.whoCalledAt = new Date().toISOString(); mark('who'); }
    if (on.has('name') && (a.first || a.last)) { p.name = [a.first, a.last].filter(Boolean).join(' '); p.firstName = a.first || ''; p.lastName = a.last || ''; mark('name'); }
    if (on.has('dob') && a.dob) { p.dob = a.dob; if (p.referral) p.referral.dob = a.dob; mark('dob'); }
    if (on.has('county') && a.county) { p.county = cap(a.county); mark('county'); }
    if (on.has('medicaid') && MED_TO[a.medicaid]) {
      p.medicaidStatus = MED_TO[a.medicaid];
      if (a.medicaid !== 'yes') { p.medicaid = p.medicaid || {}; const stage = a.medicaid === 'applied' ? 'applied' : 'help'; if (!p.medicaid.application || p.medicaid.application.stage !== stage) p.medicaid.application = { stage, at: new Date().toISOString(), by: meta.by || 'office' }; }
      mark('medicaid');
    }
    if (on.has('dcn') && a.dcn) { p.dcn = a.dcn; if (p.referral) p.referral.dcn = a.dcn; mark('dcn'); }
    if (on.has('cds') && a.cds) { p.cdsHistory = a.cds; if (a.cds === 'move') p.type = 'pccp'; mark('cds'); }
    if (on.has('agency') && a.agency) { p.leavingAgency = a.agency; mark('agency'); }
    if (on.has('help') && ((a.help || []).length || a.help_note)) {
      p.helpNeeded = [...new Set((Array.isArray(p.helpNeeded) ? p.helpNeeded : []).concat(a.help || []))];
      if (a.help_note) p.helpNote = p.helpNote ? p.helpNote + '; ' + a.help_note : a.help_note;
      mark('help');
    }
    if (on.has('attendant')) {
      if (a.attendant === 'has' && a.att_name) {
        const same = p.attendant && low(p.attendant.name) === low(a.att_name);
        p.attendant = Object.assign({}, same ? p.attendant : {}, { name: a.att_name, phone: phone(a.att_phone) || (same && p.attendant.phone) || null }, a.att_relation ? { relation: a.att_relation } : {});
        p.caregiverPlan = 'has'; mark('attendant');
      } else if (a.attendant === 'find') { p.caregiverPlan = 'find'; mark('attendant'); }
    }
    return did;
  }
  // "from the call Nov 5, 2:14 PM" for a field that came from a call.
  function fromLabel(p, k) {
    const f = p && p.fromCalls && p.fromCalls[k];
    if (!f || !f.at) return '';
    const d = new Date(f.at);
    return isNaN(d) ? '' : 'from the call ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  root.CallAnswers = { rows, apply, fromLabel, LABEL, HELP, ORDER };
})(typeof globalThis !== 'undefined' ? globalThis : this);
