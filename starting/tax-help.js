// Tax setup help on a Starting profile (2026-11-17, her ask: "see how much you can help with the tax setup"; her yes to the
// plan). Two things, both on the Tax and EIN tab:
//   1. Copy-and-paste sheets: every answer the IRS EIN application (Form SS-4), Missouri registration (Form 2643A), DES
//      UInteract and Empeon ask for, filled from the consumer's signed enrollment packet, each with a Copy button. The office
//      pastes instead of typing. The SSN stays hidden until someone presses Show (the server logs every time it is read).
//      It never logs in anywhere, never fills a government website and never signs anything.
//   2. Read the IRS EIN letter (CP 575): drop the PDF, it finds the EIN, and "Use it" saves it on the consumer.
// Field order follows the paper forms (SS-4, 2643A); the websites ask the same things, sometimes in another order.
// No em dashes in anything a person reads (her rule).
(function () {
  'use strict';
  const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const st = { data: {}, err: {}, ssn: {}, ein: {} };
  const full = a => [a.first, a.middle, a.last].filter(Boolean).join(' ');
  const street = a => [a.street, a.apt].filter(Boolean).join(' ');
  const mdy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[2] + '/' + m[3] + '/' + m[1] : String(iso || ''); };
  const ssnFmt = d => { d = String(d || '').replace(/\D/g, ''); return d.length === 9 ? d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5) : ''; };
  const einFmt = d => { d = String(d || '').replace(/\D/g, ''); return d.length === 9 ? d.slice(0, 2) + '-' + d.slice(2) : ''; };

  // The rows for each website, from the packet (a = answers, g = agency, c = the consumer record).
  function sheets(data, c, showSsn) {
    const a = data.answers || {}, g = data.agency || {};
    const ssn = showSsn ? ssnFmt(data.ssn) : (data.ssn ? '***-**-' + String(data.ssn).replace(/\D/g, '').slice(-4) : '');
    const phone = a.phone || '', ein = einFmt(c.ein), mo = String(c.moTaxId || '');
    const home = [street(a), a.city, (a.state || 'MO') + ' ' + (a.zip || '')].filter(Boolean).join(', ');
    return [
      { key: 'ss4', title: 'IRS EIN application (Form SS-4)', link: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
        note: 'Household employer. The responsible party is the consumer. Mail comes to our office, as on the paper form.', rows: [
          ['Legal name (line 1)', full(a)], ['Mailing address (line 4a, our office)', g.street], ['City, state, ZIP (line 4b)', [g.city, g.state + ' ' + g.zip].join(', ')],
          ['Home street (line 5a)', street(a)], ['Home city, state, ZIP (line 5b)', [a.city, (a.state || 'MO') + ' ' + (a.zip || '')].join(', ')],
          ['County and state (line 6)', (a.county || '') + ' County, MO'], ['Responsible party (line 7a)', full(a)], ['SSN (line 7b)', ssn, 'ssn'],
          ['Type of entity (line 9a)', 'Other: Household Employer (HCSR)'], ['Reason for applying (line 10)', 'Other: Household Employer (HCSR)'],
          ['Closing month (line 12)', 'December'], ['Household employees (line 13)', '4'], ['First date wages paid (line 14)', mdy(a.first_pay)],
          ['Principal activity (line 16)', 'Other: Household Employer (HCSR)'], ['Applied before (line 18)', 'No'],
          ['Third party designee', g.signer + ' c/o ' + g.legal], ['Designee phone', g.phone], ['Designee fax', g.fax], ['Applicant phone', phone]] },
      { key: 'mo', title: 'Missouri tax registration (Form 2643A)', link: 'https://mytax.mo.gov/',
        note: 'Withholding tax, filed annually, the parent company (us) files. Needs the EIN first.', rows: [
          ['Federal EIN', ein || 'Not on file yet: get the EIN first'], ['Reason', 'Other: New Consumer-Directed Services (CDS) Participant.'],
          ['Legal name', full(a)], ['Street', street(a)], ['City', a.city], ['State', a.state || 'MO'], ['ZIP', a.zip], ['County', a.county], ['Email', a.email],
          ['SSN', ssn, 'ssn'], ['Date of birth', mdy(a.dob)], ['Phone', phone], ['Tax type', 'Employer withholding'], ['How often', 'Annually'],
          ['Parent company files', 'Yes: ' + g.dba], ['Parent address', [g.street, g.city, g.state, g.zip].join(' ')], ['Parent phone', g.phone],
          ['Comment', 'Self-directed Medicaid Services Recipient through Missouri Dept. Health & Senior Services; no services provided or products produced.'],
          ['Signer title', g.mo_signer_title], ['Email for contact', g.email]] },
      { key: 'des', title: 'Unemployment registration (DES UInteract)', link: 'https://uinteract.labor.mo.gov/',
        note: 'What UInteract asks for, from the packet. Needs the EIN first.', rows: [
          ['Federal EIN', ein || 'Not on file yet'], ['Missouri tax ID', mo || 'Not on file yet'], ['Legal name', full(a)], ['Business type', 'Household employer (CDS participant)'],
          ['Home address', home], ['County', a.county], ['Phone', phone], ['Email', a.email], ['First wages paid', mdy(a.first_pay)], ['Agent', g.legal]] },
      { key: 'empeon', title: 'Empeon (new consumer as an employer)', link: 'https://app.empeon.com',
        note: 'The numbers Empeon needs so payroll files under this consumer.', rows: [
          ['Employer name', full(a)], ['FEIN', ein || 'Not on file yet'], ['Missouri tax ID', mo || 'Not on file yet'], ['Address', home], ['County', a.county],
          ['Pay schedule', 'Weekly, paid Thursday (care week Sunday to Saturday)']] }
    ];
  }

  function html(c) {
    const lead = c.starting && c.starting.leadId;
    const d = st.data[c.id], e = st.err[c.id], found = st.ein[c.id];
    const copyBtn = (v, i) => v && !/^Not on file/.test(String(v)) ? '<button type="button" class="btn btn-sm btn-outline" data-copy="' + esc(String(v)) + '" onclick="TaxHelp.copy(this)">Copy</button>' : '';
    let body;
    if (e) body = '<div class="field-note" style="color:#9C6410">' + esc(e) + '</div>';
    else if (!d) body = '<div style="margin-top:6px"><button type="button" class="btn btn-sm btn-primary" onclick="TaxHelp.load(\'' + q(c.id) + '\')"' + (lead ? '' : ' disabled') + '>Open the copy-and-paste sheets</button>' +
      (lead ? '' : ' <span class="field-note">No packet on this profile yet.</span>') + '</div>';
    else body = sheets(d, c, !!st.ssn[c.id]).map(sh => '<details class="st-box" style="margin-top:8px"><summary style="cursor:pointer"><b>' + esc(sh.title) + '</b> <a href="' + esc(sh.link) + '" target="_blank" rel="noopener" style="font-size:12px;margin-left:6px">open the website</a></summary>' +
        '<div class="lt-sub" style="margin:4px 0 6px">' + esc(sh.note) + '</div>' +
        sh.rows.map(([k, v, kind]) => '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-top:1px solid var(--gray-200);font-size:13px"><span style="min-width:190px;color:var(--gray-600)">' + esc(k) + '</span>' +
          '<span style="flex:1;min-width:0;overflow-wrap:anywhere">' + esc(v || '') + '</span>' +
          (kind === 'ssn' && !st.ssn[c.id] ? '<button type="button" class="btn btn-sm btn-outline" onclick="TaxHelp.showSsn(\'' + q(c.id) + '\')">Show</button>' : copyBtn(v)) + '</div>').join('') + '</details>').join('');
    const letter = '<div class="st-box" style="margin-top:12px"><b style="color:var(--primary)">Read the IRS EIN letter</b>' +
      '<div class="lt-sub">Drop the CP 575 letter (PDF) the IRS gave you. It finds the EIN; press Use it to save it here.</div>' +
      '<input type="file" id="thLetter" accept="application/pdf,.pdf" onchange="TaxHelp.readLetter(\'' + q(c.id) + '\')" style="margin-top:6px">' +
      (found ? '<div style="margin-top:6px">' + (found.ein ? 'Found EIN <b>' + esc(found.ein) + '</b>' + (found.name ? ' for ' + esc(found.name) : '') + (c.ein ? ' <span class="lt-sub">On file now: ' + esc(c.ein) + '</span>' : '') + ' ' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="TaxHelp.useEin(\'' + q(c.id) + '\')">Use it</button>' : '<span style="color:#9C6410">' + esc(found.err || 'No EIN found in this PDF.') + '</span>') + '</div>' : '') + '</div>';
    return '<div class="st-box" style="margin-top:14px"><b style="color:var(--primary)">Copy-and-paste sheets for the tax websites</b>' +
      '<div class="lt-sub">From the signed enrollment packet. Open a website, then copy each answer across. Nothing is sent anywhere from here.</div>' + body + '</div>' + letter;
  }
  function mount(c) { const el = document.getElementById('thHelp'); if (el) el.innerHTML = html(c); }
  const consumer = id => getData('consumers').find(x => String(x.id) === String(id));
  async function load(id) {
    const c = consumer(id); if (!c) return;
    try { st.data[id] = await cdsMatchApi('enrollPdfData', { lead_id: c.starting && c.starting.leadId }); delete st.err[id]; }
    catch (e) { st.err[id] = /not signed/i.test(String(e.message || e)) ? 'The sheets open once the consumer has signed every form in their packet.' : 'Could not open the packet: ' + (e.message || e); }
    mount(c);
  }
  function showSsn(id) { st.ssn[id] = true; mount(consumer(id)); }
  async function copy(btn) {
    const v = btn.getAttribute('data-copy');
    try { await navigator.clipboard.writeText(v); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1200); }
    catch (e) { btn.textContent = 'Select it'; }
  }
  // The CP 575 letter: "EMPLOYER IDENTIFICATION NUMBER: 12-3456789", and the name it was issued to.
  function findEin(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    const m = /EMPLOYER IDENTIFICATION NUMBER[^0-9]{0,40}(\d{2}-\d{7})/i.exec(t) || /\b(?:EIN|E\.I\.N\.)[^0-9]{0,20}(\d{2}-\d{7})/i.exec(t) || /\b(\d{2}-\d{7})\b/.exec(t);
    if (!m) return { err: 'No EIN found in this PDF. Is it the IRS letter (CP 575)?' };
    const n = /assigned you an? EIN[^.]*?\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){1,3})\b/.exec(t);
    return { ein: m[1], name: n ? n[1] : '' };
  }
  async function readLetter(id) {
    const c = consumer(id), inp = document.getElementById('thLetter'), file = inp && inp.files && inp.files[0];
    if (!c || !file) return;
    try { await prLoadPdfJs(); st.ein[id] = findEin(await pdfText(file)); }
    catch (e) { st.ein[id] = { err: 'Could not read this PDF (' + (e.message || e) + ').' }; }
    mount(c);
  }
  function useEin(id) {
    const f = st.ein[id]; if (!f || !f.ein) return;
    const list = getData('consumers'), c = list.find(x => String(x.id) === String(id)); if (!c) return;
    const was = c.ein || '';
    c.ein = f.ein;
    c.medicaid = c.medicaid || {}; (c.medicaid.log = c.medicaid.log || []).push({ at: new Date().toISOString(), by: (typeof _acWho === 'function' ? String(_acWho() || '').split('@')[0] : '') || 'Office', text: 'EIN ' + f.ein + ' read from the IRS letter' + (was ? ' (was ' + was + ')' : '') + '.' });
    setData('consumers', list);
    if (typeof _ghlToast === 'function') _ghlToast('✅ EIN ' + f.ein + ' saved on ' + c.name + '.');
    delete st.ein[id]; mount(c);
  }
  window.TaxHelp = { sheets, findEin, mount, load, showSsn, copy, readLetter, useEin };
})();
