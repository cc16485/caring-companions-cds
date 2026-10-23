// A signed attendant form as the office (or an auditor) reads it (2026-10-22, Samantha: "add View and
// Print for each signed form on the attendant profile"). Built from what was stored when they signed:
// the answers snapshot, initials, typed name, time, IP and device. Never shows a Social Security
// number, a date of birth or anything sealed. No em dashes in anything a person reads.
import { RELATIONS, DAYS, MO_QUESTIONS } from './rules.js';

const yn = v => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v ? String(v) : '');
const SECRET = /ssn|sealed|dob|birth|social/i;

// answers -> [{ h, rows: [[label, value]] }], empty sections left out.
export function answerSections(a = {}) {
  const S = [], add = (h, rows) => { const r = rows.filter(([, v]) => v !== '' && v != null); if (r.length) S.push({ h, rows: r }); };
  const safe = Object.fromEntries(Object.entries(a || {}).filter(([k]) => !SECRET.test(k)));
  const x = safe;
  add('About you', [['Name', [x.first, x.mi, x.last].filter(Boolean).join(' ')], ['Other names used', x.aliases || ''],
    ['Address', [x.street, x.apt, [x.city, x.state].filter(Boolean).join(', '), x.zip].filter(Boolean).join(' ')], ['Phone', x.phone || ''], ['Email', x.email || '']]);
  add('Your consumer', [['Has a consumer', yn(x.has_consumer)], ['Consumer', x.consumer_name || ''], ['Related', yn(x.related)],
    ['How related', x.relation ? (RELATIONS[x.relation] || x.relation) : '']]);
  add('Qualifications', [['Meets the qualifications', yn(x.qualified)],
    ...Object.entries(MO_QUESTIONS).map(([k, m]) => [m.q, yn(x[k])])]);
  add('Caregiver list', [['List me', x.list === 'join' ? 'Yes' : x.list === 'no' ? 'No' : ''], ['Prefers', x.prefer || ''], ['On call', yn(x.on_call)],
    ['Days', x.days ? DAYS.filter(d => x.days[d]).map(d => d + ' ' + x.days[d]).join('; ') : ''], ['Tasks', Array.isArray(x.tasks) ? x.tasks.join(', ') : '']]);
  const jobs = Array.isArray(x.jobs) ? x.jobs.filter(j => j && j.co) : [];
  add('Work history', [['Not working now', x.not_working ? 'Yes' : ''], ['Gaps explained', x.gaps || ''],
    ...jobs.map((j, i) => [(i === 0 && !x.not_working ? 'Current job' : 'Past job ' + (x.not_working ? i + 1 : i)),
      [j.co, j.city, j.from || j.to ? (j.from || '') + ' to ' + (j.to || 'now') : '', j.sup ? 'supervisor ' + j.sup + (j.ph ? ' ' + j.ph : '') : '',
        j.duties ? 'duties: ' + j.duties : '', j.why ? 'left: ' + j.why : '', j.call ? 'may call: ' + yn(j.call) : ''].filter(Boolean).join(' · ')])]);
  add('Education', [['High school', [x.hs, x.hs_years, x.hs_grad ? 'graduated: ' + yn(x.hs_grad) : ''].filter(Boolean).join(' · ')],
    ['College', [x.col, x.col_years, x.col_grad ? 'graduated: ' + yn(x.col_grad) : ''].filter(Boolean).join(' · ')]]);
  add('References', (Array.isArray(x.refs) ? x.refs.filter(r => r && r.name) : []).map((r, i) => ['Reference ' + (i + 1), [r.name, r.rel, r.ph, r.em].filter(Boolean).join(' · ')]));
  add('Background', [['Convicted, found guilty, or pleaded guilty or no contest (not minor traffic)', yn(x.convicted)],
    ...(Array.isArray(x.offenses) ? x.offenses.filter(o => o && o.what) : []).map((o, i) => ['Offense ' + (i + 1), [o.what, o.when, o.where].filter(Boolean).join(' · ')]),
    ['Has a Good Cause Waiver', yn(x.gcw)], ['Registered with the FCSR', x.fcsr === 'notsure' ? 'Not sure' : yn(x.fcsr)],
    ['Lived only in Missouri the last 5 years', x.mo_only === 'mo' ? 'Yes' : x.mo_only === 'more' ? 'No, more than one state' : ''],
    ['Gender', x.gender === 'm' ? 'Male' : x.gender === 'f' ? 'Female' : ''],
    ...(Array.isArray(x.addrs) ? x.addrs.filter(o => o && o.a) : []).map((o, i) => ['Address ' + (i + 1) + ' (last 7 years)', [o.a, o.d].filter(Boolean).join(' · ')])]);
  return S;
}

// The document blocks with names filled in, the same text the fingerprint was made from.
export function docBlocks(form, vars = {}) {
  return (form && form.doc || []).map(b => ({ h: b.h ? fillIn(b.h, vars) : undefined, p: b.p ? fillIn(b.p, vars) : undefined }));
}
const fillIn = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
