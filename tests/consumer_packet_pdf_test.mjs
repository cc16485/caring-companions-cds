// CDS consumer enrollment packet: the PDFs, filled from made-up signed data.
//   PDFLIB=/path/to/pdf-lib/cjs/index.js node tests/consumer_packet_pdf_test.mjs [outdir]
// With an outdir, the filled PDFs are written there to look at.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDFLib = createRequire(import.meta.url)(process.env.PDFLIB || '/Users/samantha/Claude/Projects/.pdflib/node_modules/pdf-lib');
const { buildEnrollPdfs, BLANKS } = await import(ROOT + '/enroll/enroll-pdf.js');
const F = await import(ROOT + '/supabase/functions/_shared/enroll/forms.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };

const answers = { who: 'rep', rep_name: 'Linda Sample', rep_rel: 'Daughter, power of attorney', first: 'Margaret', last: 'Sample', street: '1200 E Example St', apt: 'Apt 2',
  city: 'Springfield', state: 'MO', zip: '65804', county: 'Greene', phone: '(417) 555-0142', email: 'm@x.test', dob: '1941-03-02', first_pay: '2026-11-03', evv: 'app',
  b1_name: 'Tom Sample', b1_rel: 'Son', b1_phone: '417-555-0199' };
const at = '2026-10-22T19:30:00Z';
const signed = (role = 'rep', name = 'Linda Sample') => ({ version: '2026-10-22', fingerprint: 'a'.repeat(64), answers, signed_name: name, signer_role: role, signed_at: at, signed_ip: '1.2.3.4' });
const kind = 'new';
const keys = F.formsFor(kind);
const forms = Object.fromEntries(keys.map(k => [k, k === 'mo2643a' ? signed('office', 'Samantha Troutman') : signed()]));
forms.f2678.agent_name = forms.mo2827.agent_name = 'Samantha Troutman'; forms.f2678.agent_at = forms.mo2827.agent_at = '2026-10-22T20:00:00Z';
const data = { kind, answers, ssn: '900123456', agency: F.AGENCY, esign_at: at, forms,
  docs: Object.fromEntries(keys.filter(k => F.FORMS[k].group === 'ours').map(k => [k, { title: F.FORMS[k].title, file: F.FORMS[k].file, doc: F.ourDoc(k, answers) }])),
  files: Object.fromEntries(keys.map(k => [k, { file: F.FORMS[k].file, title: F.FORMS[k].title }])) };
const blank = async name => readFileSync(ROOT + '/forms/' + name);

const out = await buildEnrollPdfs(PDFLib, data, { blank, consumer: { ein: '12-3456789', moTaxId: '' } });
ok(out.length === keys.length + 1 && out[out.length - 1].file === 'Signing-Record', 'one PDF per form plus the signing record');
ok(out.map(o => o.file).join() === 'Vendor-Acknowledgement,Employment-Numbers-Auth,Telephony-EVV-Consent,Emergency-Backup-Plan,IRS-SS-4,IRS-8821,IRS-2678,MO-2643A,MO-2827,Signing-Record', 'file names match Tax Setup (the splitter\'s names)');

const read = async key => PDFLib.PDFDocument.load(out.find(o => o.key === key).bytes);
const val = (doc, n) => { const f = doc.getForm().getFields().find(x => x.getName() === n); if (!f) return '(missing ' + n + ')'; return f.constructor.name === 'PDFTextField' ? f.getText() : String(f.acroField.dict.get(PDFLib.PDFName.of('V')) || ''); };
const I = 'topmostSubform[0].Page1[0].', I2 = 'topmostSubform[0].Page2[0].';

let d = await read('ss4');
ok(val(d, I + 'f1_2[0]') === 'Margaret Sample' && val(d, I + 'f1_11[0]') === '900-12-3456', 'SS-4: name and SSN');
ok(val(d, I + 'Line4ReadOrder[0].f1_5[0]') === '1331 N Stewart Ave Ste B' && val(d, I + 'f1_7[0]') === '1200 E Example St Apt 2', 'SS-4: mail to us, home address on 5a');
ok(val(d, I + 'c1_3[15]') === '/7' && val(d, I + 'f1_19[0]') === 'Household Employer (HCSR)', 'SS-4: 9a Other, Household Employer (HCSR)');
ok(val(d, I + 'c1_4[7]') === '/4' && val(d, I + 'c1_6[11]') === '/9' && val(d, I + 'c1_7[1]') === '/2' && val(d, I + 'c1_1[1]') === '/2', 'SS-4: 10 Other, 16 Other, 18 No, 8a No');
ok(val(d, I + 'f1_36[0]') === '11/03/2026' && val(d, I + 'f1_32[0]') === 'December' && val(d, I + 'f1_34[0]') === '4', 'SS-4: first pay, December, household employees');
ok(/Samantha Troutman c\/o Caring Companions Consumer Directed Services, LLC/.test(val(d, I + 'f1_40[0]')) && val(d, I + 'f1_43[0]') === '417-719-7870', 'SS-4: third party designee');
ok(val(d, I + 'f1_44[0]') === 'Linda Sample, legal representative for Margaret Sample', 'SS-4: signer name and title');
d = await read('f8821');
ok(/Margaret Sample/.test(val(d, I + 'f1_6[0]')) && val(d, I + 'f1_7[0]') === '900-12-3456' && val(d, I + 'f1_11[0]') === '0316-95995R', '8821: taxpayer, SSN, CAF');
ok(val(d, I + 'Table_Line3[0].BodyRow1[0].f1_21[0]') === '941, 940, 941-X, 940-X' && val(d, I + 'Table_Line3[0].BodyRow1[0].f1_22[0]') === 'Q1 2026 - Q4 2029', '8821: line 3, up to 3 years ahead');
d = await read('f2678');
ok(val(d, I + 'c1_1[0]') !== '' && val(d, I + 'c1_16[0]') !== '' && val(d, I + 'f1_3[0]') === 'Margaret Sample', '2678: appoint, home care, employer');
ok(val(d, I + 'Form2678-EIN[0].f1_2[0]') === '3456789', '2678: consumer EIN once known');
ok(val(d, I2 + 'f2_3[0]') === 'Caring Companions Consumer Directed Services, LLC' && val(d, I2 + 'f2_13[0]') === 'CEO', '2678: agent part');
ok(d.getForm().getFields().some(f => /AgentEIN/.test(f.getName()) && f.getText && f.getText() === '39'), '2678: agent EIN');
d = await read('mo2643a');
ok(val(d, 'Text7') === 'Margaret Sample' && val(d, 'Text8') === '900123456' && val(d, 'Text9') === '03021941' && val(d, '29county') === 'Greene', '2643A: owner, SSN, DOB, county');
ok(val(d, 'reason') === '/other' && val(d, '34ff') === '/Yes' && val(d, 'yesno38') === '/no' && val(d, '39signertitle') === 'CDS Program Manager', '2643A: reason, annual, not transient, office signer');
d = await read('mo2827');
ok(val(d, 'email1') === 'Margaret Sample' && val(d, 'SSN.2') === '3456' && val(d, 'Text19.2') === 'Caring Companions Consumer Directed Services, LLC' && val(d, 'Withholding') === '/yes' && val(d, 'rev') === '/no', '2827: taxpayer, SSN, representative, withholding, earlier POAs revoked');
ok(val(d, 'Check Box1.4') === '/Yes' && val(d, 'Text32.0') === '10222026' && val(d, 'Text28.0') === '10222026', '2827: fiduciary, agent date');

// A reissued form (a field gone) is refused, never guessed at.
let refused = '';
try { await buildEnrollPdfs(PDFLib, data, { blank: async n => (n === 'f8821.pdf' ? readFileSync(ROOT + '/forms/fss4.pdf') : blank(n)), consumer: {} }); } catch (e) { refused = e.message; }
ok(/has changed/.test(refused) && /Nothing was filled/.test(refused), 'a changed blank form is refused: ' + refused.slice(0, 60));
ok(Object.values(BLANKS).every(n => readFileSync(ROOT + '/forms/' + n).length > 50000), 'all 5 blank forms are in /forms');

if (process.argv[2]) { mkdirSync(process.argv[2], { recursive: true }); for (const o of out) writeFileSync(path.join(process.argv[2], o.file + '.pdf'), o.bytes); console.log('wrote', out.length, 'PDFs to', process.argv[2]); }
console.log(`${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
