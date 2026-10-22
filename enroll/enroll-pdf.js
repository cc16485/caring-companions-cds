// CDS consumer enrollment packet: the signed PDFs (2026-10-22).
// Built in the browser from what the consumer signed (cds-match enrollPdfData), so a
// PDF carrying a Social Security number never sits on a server. Our own forms are
// drawn on letterhead; the IRS and Missouri forms are the official fillable PDFs in
// /forms, filled the way Samantha's GoHighLevel packet filled them.
//
// buildEnrollPdfs(PDFLib, data, { blank, consumer }) -> [{ key, file, title, bytes }]
//   data     : enrollPdfData from the server
//   blank    : async name -> ArrayBuffer of /forms/<name>
//   consumer : the Hub consumer record, for the EIN and Missouri Tax ID once known
// A form whose fields have moved (the IRS or Missouri reissued it) is refused, never guessed at.
// No em dashes in anything a person reads.

export const BLANKS = { ss4: 'fss4.pdf', f8821: 'f8821.pdf', f2678: 'f2678.pdf', mo2643a: 'mo-2643a.pdf', mo2827: 'mo-2827.pdf' };
const IRS = 'topmostSubform[0].Page1[0].';
const IRS2 = 'topmostSubform[0].Page2[0].';

const mdy = iso => { if (!iso) return ''; const s = String(iso).slice(0, 10).split('-'); return s.length === 3 ? s[1] + '/' + s[2] + '/' + s[0] : ''; };
const when = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Central';
const ssnFmt = d => (d && d.length === 9 ? d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5) : '');
const full = a => [a.first, a.last].filter(Boolean).join(' ');
const street = a => [a.street, a.apt].filter(Boolean).join(' ');
const phoneOf = a => a.phone || '';

// Who signed, in the words the forms use.
function signer(f, a) {
  if (!f) return null;
  const rep = f.signer_role === 'rep';
  return { name: f.signed_name, at: f.signed_at, date: mdy(new Date(f.signed_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })),
    title: rep ? 'Legal representative (' + (a.rep_rel || 'representative') + ') for ' + full(a) : 'HCSR Employer', rep };
}

// ---------- our own forms ----------
async function ourPdf(PDFLib, data, key) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const a = (data.forms[key] && data.forms[key].answers) || data.answers, f = data.forms[key], g = data.agency, d = data.docs[key];
  const doc = await PDFDocument.create();
  doc.setTitle(d.title); doc.setAuthor(g.dba); doc.setCreator('CDS Hub');
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const navy = rgb(0.05, 0.21, 0.37), gray = rgb(0.35, 0.37, 0.4);
  let page = doc.addPage([612, 792]), y = 740;
  const wrap = (text, fnt, size, width) => {
    const out = []; let line = '';
    for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (fnt.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line); return out;
  };
  const write = (text, { fnt = font, size = 11, color = rgb(0.1, 0.1, 0.1), gap = 4, x = 60, width = 492 } = {}) => {
    for (const l of wrap(text, fnt, size, width)) { if (y < 70) { page = doc.addPage([612, 792]); y = 740; } page.drawText(l, { x, y, size, font: fnt, color }); y -= size + gap; }
  };
  write(g.dba, { fnt: bold, size: 14, color: navy, gap: 2 });
  write(`${g.street}, ${g.city}, ${g.state} ${g.zip}   Office ${g.phone}   Fax ${g.fax}   ${g.email}`, { size: 9, color: gray });
  y -= 14;
  write(d.title, { fnt: bold, size: 16, color: navy }); y -= 6;
  for (const b of d.doc) {
    if (b.p) { write(b.p); y -= 8; }
    if (b.kv) { for (const [k, v] of b.kv) { write(k + ': ' + (v || ''), { fnt: bold, size: 11 }); } y -= 8; }
  }
  const s = signer(f, data.answers);
  y -= 10;
  page.drawLine({ start: { x: 60, y: y + 14 }, end: { x: 552, y: y + 14 }, thickness: 0.5, color: gray });
  write('Consumer name: ' + full(data.answers), { fnt: bold });
  y -= 14;
  write(s.name, { fnt: ital, size: 20, color: navy, gap: 6 });
  write((s.rep ? 'Signed by ' + s.name + ', ' + s.title : 'Signed by ' + s.name) + ', ' + when(s.at) + '.', { size: 10 });
  y -= 6;
  write('Signed electronically by typing their name, after agreeing to sign electronically on ' + when(data.esign_at) + '. Form version ' + f.version +
    '. Record ' + f.fingerprint.slice(0, 16) + (f.signed_ip ? '. From ' + f.signed_ip : '') + '.', { size: 8, color: gray });
  return doc.save();
}

// ---------- the official forms ----------
async function fill(PDFLib, bytes, key, must, fn) {
  const { PDFDocument, StandardFonts, PDFName, rgb } = PDFLib;
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  try { form.deleteXFA(); } catch (e) { /* not an XFA form */ }
  const have = {}; form.getFields().forEach(f => { have[f.getName()] = f; });
  const missing = must.filter(n => !have[n]);
  if (missing.length) throw new Error('The blank ' + BLANKS[key] + ' has changed (field "' + missing[0] + '" is gone). The IRS or Missouri probably reissued it. Nothing was filled. Send the new form to Claude.');
  const font = await doc.embedFont(StandardFonts.Helvetica), ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  // Long text gets a smaller font so it fits its box instead of being cut off.
  const text = (n, v) => {
    if (v == null || v === '' || !have[n]) return;
    const t = form.getTextField(n), s = String(v), max = t.getMaxLength();
    t.setText(max ? s.slice(0, max) : s);
    if (!t.isCombed() && !t.isMultiline()) {
      const r = t.acroField.getWidgets()[0].getRectangle(), w = font.widthOfTextAtSize(s, 1);
      if (w * 10 > r.width - 4) t.setFontSize(Math.max(6, Math.floor((r.width - 4) / w * 10) / 10));
    }
  };
  const lines = (n, arr) => { if (!have[n]) return; const t = form.getTextField(n); t.setText(t.isMultiline() ? arr.filter(Boolean).join('\n') : arr.filter(Boolean).join(', ')); };
  // Every tick box: the widget's own "on" value, set directly (the HCBS-1 way), so a
  // box whose export value is /7 or /Chck1 is ticked exactly as the form defines it.
  const tick = (n, wanted) => {
    if (!have[n]) return;
    const af = form.getField(n).acroField, ws = af.getWidgets();
    let hit = null;
    ws.forEach(w => { const on = w.getOnValue(); if (on && (!wanted || on.asString().replace(/^\//, '').toLowerCase() === String(wanted).toLowerCase())) hit = hit || on; });
    if (!hit) throw new Error('Could not tick ' + n + ' on ' + BLANKS[key] + '.');
    af.dict.set(PDFName.of('V'), hit);
    ws.forEach(w => { const on = w.getOnValue(); w.dict.set(PDFName.of('AS'), on && on.asString() === hit.asString() ? hit : PDFName.of('Off')); });
  };
  const sign = (pageNo, x, y, name, size = 12) => doc.getPage(pageNo).drawText(name, { x, y, size, font: ital, color: rgb(0.05, 0.21, 0.37) });
  const say = (pageNo, x, y, s, size = 9) => doc.getPage(pageNo).drawText(s, { x, y, size, font });
  // Date boxes with the slashes already printed in them (Form 2678).
  const sayDate = (pageNo, x, y, d, size = 10) => { const [m, dd, yy] = d.split('/'); say(pageNo, x, y, m, size); say(pageNo, x + 25, y, dd, size); say(pageNo, x + 49, y, yy, size); };
  fn({ text, lines, tick, sign, say, sayDate });
  form.updateFieldAppearances(font);
  return doc.save();
}

const TAX = {
  ss4: { must: [IRS + 'f1_2[0]', IRS + 'Line4ReadOrder[0].f1_5[0]', IRS + 'f1_11[0]', IRS + 'c1_3[15]', IRS + 'c1_4[7]', IRS + 'f1_40[0]', IRS + 'f1_44[0]'],
    run(o, data, s) {
      const a = data.answers, g = data.agency;
      o.text(IRS + 'f1_2[0]', full(a));
      o.text(IRS + 'Line4ReadOrder[0].f1_5[0]', g.street); o.text(IRS + 'Line4ReadOrder[0].f1_6[0]', g.city + ', ' + g.state + ' ' + g.zip);   // mail comes to us, as today
      o.text(IRS + 'f1_7[0]', street(a)); o.text(IRS + 'f1_8[0]', [a.city, (a.state || 'MO') + ' ' + (a.zip || '')].join(', '));
      o.text(IRS + 'f1_9[0]', (a.county || '') + ' County, MO');
      o.text(IRS + 'f1_10[0]', full(a)); o.text(IRS + 'f1_11[0]', ssnFmt(data.ssn));
      o.tick(IRS + 'c1_1[1]');                                                   // 8a LLC: No
      o.tick(IRS + 'c1_3[15]'); o.text(IRS + 'f1_19[0]', 'Household Employer (HCSR)');   // 9a Other
      o.tick(IRS + 'c1_4[7]'); o.text(IRS + 'f1_30[0]', 'Household Employer (HCSR)');    // 10 Other
      o.text(IRS + 'f1_32[0]', 'December');
      o.text(IRS + 'f1_34[0]', '4');                                             // 13 household employees, as on her packet
      o.text(IRS + 'f1_36[0]', mdy(a.first_pay));
      o.tick(IRS + 'c1_6[11]'); o.text(IRS + 'f1_37[0]', 'Household Employer (HCSR)');   // 16 Other
      o.tick(IRS + 'c1_7[1]');                                                   // 18: No
      o.text(IRS + 'f1_40[0]', g.signer + ' c/o ' + g.legal); o.text(IRS + 'f1_41[0]', g.phone);
      o.text(IRS + 'f1_42[0]', g.street + ' ' + g.city + ' ' + g.state + ' ' + g.zip); o.text(IRS + 'f1_43[0]', g.fax);
      o.text(IRS + 'f1_44[0]', s.name + ', ' + (s.rep ? 'legal representative for ' + full(a) : 'HCSR Employer')); o.text(IRS + 'f1_45[0]', phoneOf(a));
      o.sign(0, 88, 40, s.name, 11); o.say(0, 362, 40, s.date);
    } },
  f8821: { must: [IRS + 'f1_6[0]', IRS + 'f1_7[0]', IRS + 'f1_10[0]', IRS + 'f1_11[0]', IRS + 'Table_Line3[0].BodyRow1[0].f1_20[0]', IRS + 'f1_32[0]'],
    run(o, data, s) {
      const a = data.answers, g = data.agency, y = new Date(data.forms.f8821.signed_at).getFullYear();
      o.lines(IRS + 'f1_6[0]', [full(a), street(a), [a.city, (a.state || 'MO') + ' ' + (a.zip || '')].join(', ')]);
      o.text(IRS + 'f1_7[0]', ssnFmt(data.ssn)); o.text(IRS + 'f1_8[0]', phoneOf(a));
      o.lines(IRS + 'f1_10[0]', [g.signer + ' c/o ' + g.dba, g.street, g.city + ', ' + g.state + ' ' + g.zip]);
      o.tick(IRS + 'c1_2[0]');                                                   // send copies of notices
      o.text(IRS + 'f1_11[0]', g.caf); o.text(IRS + 'f1_13[0]', g.phone); o.text(IRS + 'f1_14[0]', g.fax);
      // The IRS records future periods up to 3 years after the year it receives the form.
      const rows = [['EMPLOYMENT TAXES', '941, 940, 941-X, 940-X', 'Q1 ' + y + ' - Q4 ' + (y + 3)], ['EMPLOYMENT TAXES', 'W-2 and W-3', y + ' - ' + (y + 3)], ['Authority to obtain EIN', 'SS-4, 8821', y + ' - ' + (y + 3)]];
      rows.forEach((r, i) => { const n = 20 + i * 4; [...r, 'NOT APPLICABLE'].forEach((v, j) => o.text(IRS + 'Table_Line3[0].BodyRow' + (i + 1) + '[0].f1_' + (n + j) + '[0]', v)); });
      o.text(IRS + 'f1_32[0]', s.name); o.text(IRS + 'f1_33[0]', s.rep ? 'Legal representative' : 'HCSR Employer');
      o.sign(0, 62, 140, s.name, 12); o.say(0, 440, 140, s.date, 10);
    } },
  f2678: { must: [IRS + 'c1_1[0]', IRS + 'f1_3[0]', IRS + 'c1_2[0]', IRS + 'c1_4[0]', IRS + 'c1_16[0]', IRS2 + 'f2_3[0]', IRS2 + 'c2_1[0]'],
    run(o, data, s, c) {
      const a = data.answers, g = data.agency, f = data.forms.f2678, ein = String((c && c.ein) || '').replace(/\D/g, '');
      o.tick(IRS + 'c1_1[0]');                                                   // appoint an agent
      if (ein.length === 9) { o.text(IRS + 'Form2678-EIN[0].f1_1[0]', ein.slice(0, 2)); o.text(IRS + 'Form2678-EIN[0].f1_2[0]', ein.slice(2)); }
      o.text(IRS + 'f1_3[0]', full(a)); o.text(IRS + 'f1_5[0]', street(a)); o.text(IRS + 'f1_6[0]', a.city); o.text(IRS + 'f1_7[0]', a.state || 'MO'); o.text(IRS + 'f1_8[0]', a.zip);
      o.tick(IRS + 'c1_2[0]'); o.tick(IRS + 'c1_4[0]');                          // 940 and 941, all employees
      o.tick(IRS + 'c1_16[0]');                                                  // home care service recipient (FUTA)
      o.text(IRS + 'f1_12[0]', s.name); o.text(IRS + 'f1_13[0]', s.rep ? 'Legal representative' : 'HCSR Employer'); o.text(IRS + 'f1_14[0]', phoneOf(a));
      o.sign(0, 106, 98, s.name, 13); o.sayDate(0, 135, 66, s.date);
      const e = g.ein.replace(/\D/g, '');
      o.text(IRS2 + 'AgentEIN-No\\.[0].f2_1[0]', e.slice(0, 2)); o.text(IRS2 + 'AgentEIN-No\\.[0].f2_2[0]', e.slice(2));
      o.text(IRS2 + 'f2_3[0]', g.legal); o.text(IRS2 + 'f2_4[0]', g.dba); o.text(IRS2 + 'f2_5[0]', g.street); o.text(IRS2 + 'f2_6[0]', g.city); o.text(IRS2 + 'f2_7[0]', g.state); o.text(IRS2 + 'f2_8[0]', g.zip);
      o.tick(IRS2 + 'c2_1[0]');
      o.text(IRS2 + 'f2_12[0]', g.signer); o.text(IRS2 + 'f2_13[0]', g.signer_title); o.text(IRS2 + 'f2_14[0]', g.phone);
      if (f.agent_at) { o.sign(1, 106, 490, f.agent_name, 13); o.sayDate(1, 135, 455, mdy(new Date(f.agent_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))); }
    } },
  mo2643a: { must: ['IRSFEIN', 'WithTax', 'reason', 'Text7', 'Text8', 'Text9', 'not', '20yesno', 'Check Box21.3', '34ff', '35yesno', '37text', 'yesno38', '38comment', '39signature', '39printname'],
    run(o, data, s, c) {
      const a = data.answers, g = data.agency, f = data.forms.mo2643a;
      o.text('IRSFEIN', String((c && c.ein) || '').replace(/\D/g, ''));
      o.tick('WithTax'); o.tick('reason', 'other'); o.text('ReasonForApplyOther', 'New Consumer-Directed Services (CDS) Participant.');
      o.text('Text7', full(a)); o.text('Text10.0.0', street(a)); o.text('Text10.1.0', a.email); o.text('Text10.0.1.0', a.city); o.text('Text10.0.1.1.0.0', a.state || 'MO'); o.text('Text10.0.1.1.0.1', a.zip);
      o.text('29county', a.county); o.text('Text8', data.ssn); o.text('Text9', mdy(a.dob).replace(/\//g, '')); o.text('Text10.1.1', String(phoneOf(a)).replace(/\D/g, ''));
      o.tick('not'); o.text('Text6.6.1', 'CDS Participant');
      o.tick('20yesno', 'no');
      o.tick('Check Box21.3');                                                   // forms mailed: employer withholding
      o.tick('34ff', 'Yes');                                                     // annually
      o.tick('35yesno', 'Yes');                                                  // parent company files
      o.text('37text', g.dba); o.text('37Street', g.street); o.text('37City', g.city); o.text('37county', g.county); o.text('37state', 'Missouri'); o.text('37zip', g.zip); o.text('37phone', g.phone.replace(/\D/g, ''));
      o.tick('yesno38', 'no');
      o.text('38comment', 'Self-directed Medicaid Services Recipient through Missouri Dept. Health & Senior Services; no services provided or products produced.');
      o.text('39signature', f.signed_name); o.text('39signertitle', g.mo_signer_title); o.text('39datesigned', mdy(new Date(f.signed_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })).replace(/\//g, ''));
      o.text('39printname', f.signed_name); o.text('39email', g.email);
    } },
  mo2827: { must: ['FEIN', 'SSN.0', 'email1', 'phone.0', 'Text19.2', 'Withholding', 'txreg.0', 'rev', 'Text27.0.0', 'Text30.0', 'Check Box1.4'],
    run(o, data, s, c) {
      const a = data.answers, g = data.agency, f = data.forms.mo2827, d = data.ssn || '';
      o.text('MOID.0.0', String((c && c.moTaxId) || '').replace(/\D/g, '')); o.text('FEIN', String((c && c.ein) || '').replace(/\D/g, ''));
      o.text('SSN.0', d.slice(0, 3)); o.text('SSN.1', d.slice(3, 5)); o.text('SSN.2', d.slice(5));
      // On this form the boxes' names do not match their labels; these follow where each box sits.
      o.text('email1', full(a)); o.text('phone.0', street(a)); o.text('Text19.1', a.city); o.text('Text20.1', a.state || 'MO'); o.text('email3', a.zip); o.text('telephone', String(phoneOf(a)).replace(/\D/g, '')); o.text('email', a.email);
      o.text('Text19.2', g.legal); o.text('Text20.2', g.street + ' ' + g.city + ' ' + g.state + ' ' + g.zip); o.text('phone.2', g.mo_rep_phone.replace(/\D/g, '')); o.text('email4', g.email);
      o.tick('Withholding'); o.tick('txreg.0'); o.tick('rev', 'no');   // the lower box: earlier powers of attorney are revoked, as on her packet
      o.text('Text27.0.0', s.name); o.text('Text27.0.1.0', s.rep ? 'Legal representative' : 'HCSR Employer'); o.text('Text28.0', s.date.replace(/\//g, '')); o.text('Text29.0', String(phoneOf(a)).replace(/\D/g, ''));
      o.sign(1, 62, 679, s.name, 12);
      o.text('Text30.0', g.legal); o.tick('Check Box1.4');
      if (f.agent_at) { o.sign(1, 254, 375, f.agent_name, 12); o.text('Text32.0', mdy(new Date(f.agent_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })).replace(/\//g, ''));   // these date boxes hold 8 digits
        o.text('Text31.0', g.signer + ', ' + g.signer_title); }
    } },
};

// The signing record: one page listing every form, who signed, when and from where.
async function recordPdf(PDFLib, data) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]); let y = 740;
  const w = (t, f = font, s = 10) => { page.drawText(t, { x: 50, y, size: s, font: f, color: rgb(0.1, 0.1, 0.1) }); y -= s + 6; };
  w('Enrollment packet signing record', bold, 15); w(data.agency.dba + ', ' + data.agency.street + ', ' + data.agency.city + ', MO ' + data.agency.zip, font, 9); y -= 6;
  w('Consumer: ' + full(data.answers), bold, 11);
  if (data.answers.who === 'rep') w('Signed by their legal representative: ' + data.answers.rep_name + ' (' + data.answers.rep_rel + ')');
  w('Agreed to sign electronically: ' + when(data.esign_at)); y -= 6;
  for (const [k, f] of Object.entries(data.forms)) {
    w(data.files[k].title, bold, 10);
    w('   ' + (f.signer_role === 'office' ? 'Signed by the office: ' : 'Signed: ') + f.signed_name + ', ' + when(f.signed_at) + (f.signed_ip ? ', from ' + f.signed_ip : '') + '. Version ' + f.version + ', record ' + f.fingerprint.slice(0, 16), font, 8.5);
    if (f.agent_at) w('   Signed as agent: ' + f.agent_name + ', ' + when(f.agent_at), font, 8.5);
  }
  return doc.save();
}

export async function buildEnrollPdfs(PDFLib, data, { blank, consumer } = {}) {
  const out = [];
  for (const [key, meta] of Object.entries(data.files)) {
    const f = data.forms[key];
    if (!f) continue;
    if (data.docs[key]) { out.push({ key, file: meta.file, title: meta.title, bytes: await ourPdf(PDFLib, data, key) }); continue; }
    const t = TAX[key];
    const bytes = await fill(PDFLib, await blank(BLANKS[key]), key, t.must, o => t.run(o, data, signer(f, data.answers), consumer));
    out.push({ key, file: meta.file, title: meta.title, bytes });
  }
  out.push({ key: 'record', file: 'Signing-Record', title: 'Enrollment packet signing record', bytes: await recordPdf(PDFLib, data) });
  return out;
}
