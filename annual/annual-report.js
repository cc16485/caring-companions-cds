// CDS Hub · Annual Service Report helper (2026-11-13, her ask: "An Annual Service Report builder").
// window.CDSAnnual. Money > Start annual report (#annualreport).
// What MMAC's form really asks for, read from the form itself ("Consumer Directed Services Vendor Annual Report",
// CDS-Annual-Service-Report-1.0-1.pdf, footer 10/22/2026): the vendor's legal name, NPI, phone and business email; whether
// the agency had any authorized CDS clients in the past calendar year; THREE examples of how our services helped
// participants, for the agency as a whole, with no names and no DCNs; and a signed line that all four quarterly reports
// were sent. No counts are on it: consumers, units and attendants are on the quarterly form only. It goes to MMAC with
// the fourth quarter report. Rule: 19 CSR 15-8.400(5)(I), RSMo 208.918.2(2). Due Jan 30 (Personal Care Provider Manual;
// MMAC's notice says Jan 31, the earlier date is safe).
// This screen gathers the answers and prints a worksheet to copy into MMAC's own form. It sends nothing. No em dashes.
(function (root) {
  'use strict';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FORM_URL = 'https://mmac.mo.gov/wp-content/uploads/CDS-Annual-Service-Report-1.0-1.pdf';
  const SEND_TO = 'MMAC.CDS@dss.mo.gov';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // The year the report is about: last year from January through March (it is due Jan 30), this year after that.
  function reportYear(now) { now = now || new Date(); return now.getMonth() <= 2 ? now.getFullYear() - 1 : now.getFullYear(); }
  function dueDate(year) { return (year + 1) + '-01-30'; }
  // Each quarter of that year: was it marked sent on Deadlines for that year's due date?
  function quartersSent(qs, year) {
    qs = qs || {};
    const due = { q1: year + '-04-30', q2: year + '-07-31', q3: year + '-10-31', q4: (year + 1) + '-01-31' };
    return ['q1', 'q2', 'q3', 'q4'].map((k, i) => ({ key: k, label: 'Quarter ' + (i + 1), due: due[k], sent: qs[k] === 'submitted' && qs[k + '_for'] === due[k] }));
  }
  // MMAC: "do not include any participant names or MO HealthNet IDs (DCNs)". Whole-word match on the first and last
  // names of the hub's consumers and attendants (3 letters or more), and any 8-digit number.
  function privacyFlags(text, people) {
    const t = String(text || '');
    const words = new Set();
    (people || []).forEach(n => String(n || '').split(/[\s,]+/).forEach(w => { w = w.replace(/[^A-Za-z'-]/g, ''); if (w.length >= 3) words.add(w.toLowerCase()); }));
    const found = [];
    (t.match(/[A-Za-z][A-Za-z'-]+/g) || []).forEach(w => { if (words.has(w.toLowerCase()) && /^[A-Z]/.test(w) && !found.includes(w)) found.push(w); });
    return { names: found, dcn: /\b\d{8}\b/.test(t) };
  }
  // Had any authorized CDS client in that calendar year? yes when any consumer's start date or an authorization touches it.
  function anyClients(consumers, auths, year) {
    const y = String(year);
    const inYear = (from, to) => (from || '0000') <= y + '-12-31' && (to || '9999') >= y + '-01-01';
    if (Object.values(auths || {}).some(a => a && (a.planStart || a.planEnd) && inYear(a.planStart, a.planEnd))) return true;
    return (consumers || []).some(c => c && c.cdsStartDate && String(c.cdsStartDate).slice(0, 4) <= y && String(c.status || '').toLowerCase() !== 'starting');
  }
  // Our own records for the year, to help write the examples. Counts only. None of these are on MMAC's form.
  function yearFacts(consumers, year) {
    const y = String(year); let calls = 0, visits = 0, started = 0;
    (consumers || []).forEach(c => {
      Object.entries((c && c.contacts) || {}).forEach(([month, log]) => { if (log && String(month).slice(0, 4) === y) calls++; });
      (Array.isArray(c && c.homeVisits) ? c.homeVisits : []).forEach(v => { if (v && String(v.date || '').slice(0, 4) === y) visits++; });
      if (c && String(c.cdsStartDate || '').slice(0, 4) === y) started++;
    });
    return { calls, visits, started };
  }

  // ---------------------------------------------------------------- the page
  let year = null;
  const G = k => (typeof root.getObj === 'function' ? root.getObj(k) : {}) || {};
  const who = () => { const el = root.document && root.document.getElementById('header_user'); return el ? el.textContent.trim() : ''; };
  const people = () => (root.getData('consumers') || []).map(c => c.name).concat((root.getData('attendants') || []).map(a => a.name));
  function rec() {
    const all = G('annualReport'), r = Object.assign({}, all[year] || {});
    if (r.legal === undefined) r.legal = (root.CDSRules && root.CDSRules.VENDOR_LEGAL) || '';
    if (r.npi === undefined) r.npi = '1548725682';
    if (r.phone === undefined) r.phone = '417-218-2888';
    if (r.email === undefined) r.email = '';
    if (r.any === undefined) r.any = anyClients(root.getData('consumers'), (G('authorizations').records) || {}, year) ? 'yes' : '';
    return r;
  }
  function save(field, value) {
    const all = Object.assign({}, G('annualReport')), r = Object.assign({}, rec());
    r[field] = value; r.updatedBy = who(); r.updatedAt = new Date().toISOString();
    all[year] = r; root.setObj('annualReport', all);
    if (/^ex[123]$/.test(field) || field === 'any') draw();
  }
  function flagHtml(text) {
    const f = privacyFlags(text, people());
    if (!f.names.length && !f.dcn) return '';
    return '<div class="alert alert-danger" style="font-size:12.5px;margin-top:6px"><div><strong>Take these out before it goes to MMAC.</strong> ' +
      (f.names.length ? 'This looks like a name: ' + f.names.map(esc).join(', ') + '. ' : '') + (f.dcn ? 'This has an 8-digit number that could be a DCN. ' : '') +
      'MMAC asks for no participant names and no DCNs.</div></div>';
  }
  function draw() {
    const host = root.document.getElementById('annualWrap'); if (!host) return;
    if (year === null) year = reportYear();
    const r = rec(), q = quartersSent(G('quarterStatus'), year), allSent = q.every(x => x.sent);
    const facts = yearFacts(root.getData('consumers'), year);
    const today = iso(new Date()), due = dueDate(year);
    const sentMark = G('quarterStatus').annual === 'submitted' && G('quarterStatus').annual_for === due;
    const inp = (f, label, ph) => '<div class="form-group" style="margin-bottom:10px"><label style="font-size:12.5px;font-weight:700">' + esc(label) + '</label>' +
      '<input type="text" value="' + esc(r[f] || '') + '" placeholder="' + esc(ph || '') + '" onchange="CDSAnnual.save(\'' + f + '\',this.value.trim())" style="width:100%;font-size:13.5px;padding:8px 10px;border:1.5px solid var(--gray-300);border-radius:6px"></div>';
    const ex = n => '<div class="form-group" style="margin-bottom:12px"><label style="font-size:12.5px;font-weight:700">Example ' + n + '</label>' +
      '<textarea rows="4" onchange="CDSAnnual.save(\'ex' + n + '\',this.value.trim())" placeholder="What changed for the people we serve, in a few sentences. No names." style="width:100%;font-size:13.5px;padding:8px 10px;border:1.5px solid var(--gray-300);border-radius:6px;font-family:inherit">' + esc(r['ex' + n] || '') + '</textarea>' +
      flagHtml(r['ex' + n]) + '</div>';
    const filled = [r.legal, r.npi, r.phone, r.email, r.any, r.ex1, r.ex2, r.ex3, r.signer, r.title].filter(x => String(x || '').trim()).length;
    const clean = [r.ex1, r.ex2, r.ex3].every(t => { const f = privacyFlags(t, people()); return !f.names.length && !f.dcn; });
    host.innerHTML =
      '<div class="section-header"><div class="section-title">Annual Service Report for ' + year + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="CDSAnnual.setYear(' + (year - 1) + ')">' + (year - 1) + '</button>' +
        '<button class="btn btn-outline btn-sm" onclick="CDSAnnual.setYear(' + (year + 1) + ')">' + (year + 1) + '</button></div></div>' +
      '<div class="alert alert-info" style="font-size:13px"><div>MMAC\'s form is one page: who we are, three examples of how our services helped the people we serve, and a signed line that all four quarterly reports were sent. ' +
        'It goes to MMAC with the fourth quarter report, <strong>by ' + esc(root._niceDay ? root._niceDay(due) : due) + '</strong>. Fill it in here, print the worksheet, then copy it into ' +
        '<a href="' + FORM_URL + '" target="_blank" rel="noopener" style="font-weight:700">MMAC\'s own form</a> and sign it.</div></div>' +
      '<div class="card"><div class="card-title"><span class="icon">🏢</span> Who we are</div>' +
        inp('legal', 'Legal Name of CDS Vendor') + inp('npi', 'National Provider Identifier (NPI)') + inp('phone', 'Telephone Number') + inp('email', 'Business Email', 'The address MMAC should write back to') +
        '<div class="form-group"><label style="font-size:12.5px;font-weight:700">Has your agency had any authorized CDS clients during the past calendar year?</label><div style="display:flex;gap:8px;margin-top:4px">' +
          ['yes', 'no'].map(v => '<button class="btn btn-sm ' + (r.any === v ? 'btn-primary' : 'btn-outline') + '" onclick="CDSAnnual.save(\'any\',\'' + v + '\')">' + (v === 'yes' ? 'Yes' : 'No') + '</button>').join('') + '</div></div></div>' +
      '<div class="card"><div class="card-title"><span class="icon">🌱</span> Three examples of positive impact</div>' +
        '<p style="font-size:13px;color:var(--gray-600);margin-bottom:10px">Three examples from ' + year + ' that show how our CDS services helped the people we serve. They speak for the agency as a whole, not one example per consumer. <strong>No names and no DCNs.</strong></p>' +
        '<div style="font-size:12.5px;background:var(--gray-100);border-radius:8px;padding:10px 12px;margin-bottom:12px"><strong>From the Hub for ' + year + ', to help you write them</strong> (these numbers are not on MMAC\'s form): ' +
          facts.started + ' consumer' + (facts.started === 1 ? '' : 's') + ' started, ' + facts.calls + ' monthly check-in call' + (facts.calls === 1 ? '' : 's') + ' logged, ' + facts.visits + ' face-to-face visit' + (facts.visits === 1 ? '' : 's') + ' logged.</div>' +
        ex(1) + ex(2) + ex(3) + '</div>' +
      '<div class="card"><div class="card-title"><span class="icon">✅</span> The four quarterly reports for ' + year + '</div>' +
        '<p style="font-size:13px;color:var(--gray-600);margin-bottom:8px">The signer certifies that every quarterly report for the year was sent to MMAC.</p>' +
        q.map(x => '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--gray-200);font-size:13.5px"><span><strong>' + x.label + '</strong> <span style="color:var(--gray-600)">due ' + esc(root._niceDay ? root._niceDay(x.due) : x.due) + '</span></span>' +
          '<span style="font-weight:700;color:' + (x.sent ? 'var(--success)' : (x.due > today ? 'var(--gray-600)' : 'var(--danger)')) + '">' + (x.sent ? 'Marked sent' : x.due > today ? 'Not due yet' : 'Not marked sent in the Hub') + '</span></div>').join('') +
        (allSent ? '' : '<div class="field-note" style="margin-top:8px;font-size:12.5px">Mark a report sent on <a href="#" onclick="showPage(\'calendar\');return false" style="font-weight:700">Help &gt; Deadlines</a>. If one truly was not sent, send it before signing this.</div>') + '</div>' +
      '<div class="card"><div class="card-title"><span class="icon">✍️</span> Who signs</div>' +
        inp('signer', 'Printed Name of Authorized Signer') + inp('title', 'Title of Authorized Signer') +
        '<p style="font-size:12.5px;color:var(--gray-600)">MMAC rejects a report that is not signed or has no printed name and title. The signature and date go on MMAC\'s own form.</p></div>' +
      '<div class="card"><div class="card-title"><span class="icon">📤</span> Finish</div>' +
        '<div style="font-size:13.5px;margin-bottom:10px">' + filled + ' of 10 answers filled in.' + (clean ? '' : ' <strong style="color:var(--danger)">An example still has a name or a DCN in it.</strong>') + (allSent ? '' : ' <strong style="color:var(--danger)">Not every quarterly report is marked sent.</strong>') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" onclick="CDSAnnual.print()">Print the worksheet</button>' +
          '<a class="btn btn-outline" href="' + FORM_URL + '" target="_blank" rel="noopener">Open MMAC\'s form</a>' +
          (sentMark ? '<span style="align-self:center;font-weight:700;color:var(--success)">Marked sent</span>' : '<button class="btn btn-outline" onclick="CDSAnnual.markSent()">I sent it to MMAC</button>') + '</div>' +
        '<p style="font-size:12.5px;color:var(--gray-600);margin-top:10px">Send it with the fourth quarter report to ' + SEND_TO + ', by fax to 573-526-4375, or by mail to PO Box 6500, Jefferson City, MO 65102-6500. Keep a copy.</p></div>';
  }
  function setYear(y) { year = y; draw(); }
  function markSent() {
    const due = dueDate(year);
    if (!root.confirm('Mark the ' + year + ' Annual Service Report as sent to MMAC?')) return;
    const qs = Object.assign({}, G('quarterStatus')); qs.annual = 'submitted'; qs.annual_for = due;
    root.setObj('quarterStatus', qs); draw();
  }
  function print() {
    const r = rec(), w = root.open('', '_blank');
    if (!w) { root.alert('Your browser blocked the window. Allow pop-ups for this page and try again.'); return; }
    const row = (l, v) => '<tr><td style="width:44%;font-weight:700;vertical-align:top;padding:7px 10px;border:1px solid #999">' + esc(l) + '</td><td style="padding:7px 10px;border:1px solid #999;white-space:pre-wrap">' + esc(v || '') + '</td></tr>';
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Annual Service Report worksheet ' + year + '</title><style>body{font-family:Georgia,serif;font-size:13.5px;line-height:1.5;max-width:760px;margin:0 auto;padding:24px;color:#222}h1{font-size:18px}h2{font-size:14px;margin:18px 0 6px}table{border-collapse:collapse;width:100%}@media print{.noprint{display:none}}</style></head><body>' +
      '<div class="noprint" style="background:#0e3860;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:18px;font-family:sans-serif">This is a worksheet, not the form. Copy each answer into MMAC\'s own form, sign it, and send it with the fourth quarter report. <button onclick="window.print()" style="margin-left:10px">Print</button></div>' +
      '<h1>Consumer Directed Services Vendor Annual Report: worksheet for ' + year + '</h1>' +
      '<h2>Participant Information</h2><table>' + row('Legal Name of CDS Vendor', r.legal) + row('National Provider Identifier (NPI)', r.npi) + row('Telephone Number', r.phone) + row('Business Email', r.email) +
        row('Has your agency had any authorized CDS clients during the past calendar year?', r.any === 'yes' ? 'Yes' : r.any === 'no' ? 'No' : '') + '</table>' +
      '<h2>Positive Impact Examples</h2><table>' + row('Example 1', r.ex1) + row('Example 2', r.ex2) + row('Example 3', r.ex3) + '</table>' +
      '<h2>Annual Certification</h2><p>"I certify to the best of my knowledge and belief that all quarterly CDS service and financial reports required by 19 CSR 15-8.400 were submitted to MMAC during the past calendar year."</p>' +
      '<table>' + row('Authorized Signature', '(sign on MMAC\'s form)') + row('Date', '') + row('Printed Name of Authorized Signer', r.signer) + row('Title of Authorized Signer', r.title) + '</table>' +
      '<p style="font-size:12px;color:#555;margin-top:18px">Send to ' + SEND_TO + ' with the fourth quarter report by ' + esc(dueDate(year)) + '. Fax 573-526-4375. PO Box 6500, Jefferson City, MO 65102-6500.</p></body></html>');
    w.document.close();
  }
  root.CDSAnnual = { render: draw, save, setYear, markSent, print, reportYear, dueDate, quartersSent, privacyFlags, anyClients, yearFacts, FORM_URL };
})(typeof window !== 'undefined' ? window : globalThis);
