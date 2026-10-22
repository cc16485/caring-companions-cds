// The CDS consumer enrollment packet (2026-10-22, Samantha: "build the consumer
// packet into the hub to send easily with the click of a button"). Wording comes
// from her GoHighLevel packet (CDS_Consumer_Enrollment_Packet-2.pdf) with the
// fixes she approved in the preview (claude.ai/artifact/9W6GJLThKTgqE5o7sTWu1W):
// Suite B, clocking in = WellSky app or home phone, Training Acknowledgement moved
// to the end of consumer orientation, moving consumers skip SS-4 and 2643A.
// Changing ANY word means a new VERSION: the server fingerprints the text and
// every signature keeps the version and fingerprint it was signed against.
// No em dashes (her rule).

// The vendor as it appears on the tax forms today (her GoHighLevel packet).
export const AGENCY = {
  legal: 'Caring Companions Consumer Directed Services, LLC',
  dba: 'Caring Companions Consumer Directed Services',
  long: 'Caring Companions Consumer Directed Services, LLC DBA Caring Companions Consumer Directed Services',
  ein: '39-2504813',
  caf: '0316-95995R',
  street: '1331 N Stewart Ave Ste B', city: 'Springfield', state: 'MO', zip: '65802', county: 'Greene',
  phone: '866-863-5151', fax: '417-719-7870', mo_rep_phone: '417-234-8494',
  email: 'intake@caringcds.com',
  signer: 'Samantha Troutman', signer_title: 'CEO', mo_signer_title: 'CDS Program Manager',
};
export const AGENCY_ADDRESS = `${AGENCY.street}, ${AGENCY.city}, ${AGENCY.state} ${AGENCY.zip}`;

const V = '2026-10-22';
// who: 'consumer' = signed by the consumer (or their legal representative);
// 'office' = filled from the consumer's answers and signed by the office (2643A, as today).
// path: which consumers get it ('new' = new to CDS, 'move' = moving from another agency).
// agent: the office signs a second part after the consumer (2678 Part 3, 2827 representative).
export const FORMS = {
  vendor:  { version: V, group: 'ours', who: 'consumer', file: 'Vendor-Acknowledgement', title: 'Consumer Vendor Acknowledgement', what: 'You chose us as your CDS vendor.' },
  numbers: { version: V, group: 'ours', who: 'consumer', file: 'Employment-Numbers-Auth', title: 'Authorization to Obtain Employment Numbers', what: 'Lets us look up your employer numbers for you.' },
  evv:     { version: V, group: 'ours', who: 'consumer', file: 'Telephony-EVV-Consent', title: 'Clocking In and Out (EVV) Consent', what: 'How your attendant clocks in and out.' },
  backup:  { version: V, group: 'ours', who: 'consumer', file: 'Emergency-Backup-Plan', title: 'Consumer Emergency Back-Up Plan', what: 'Who helps if your attendant cannot come.' },
  prev:    { version: V, group: 'ours', who: 'consumer', path: 'move', file: 'Previous-Vendor-Auth', title: 'Previous CDS Vendor Authorization', what: 'Lets us get your tax numbers from your old agency.' },
  ss4:     { version: V, group: 'tax', who: 'consumer', path: 'new', file: 'IRS-SS-4', title: 'IRS Form SS-4: Employer ID Number (EIN)',
    what: 'Every employer needs their own EIN. You are your attendant\'s employer, so you need one. We apply online for you, which is the fastest way.',
    agree: 'I authorize Caring Companions to apply for my EIN, receive it, and answer questions about this application. Under penalties of perjury, I declare that I have examined this application, and to the best of my knowledge and belief, it is true, correct, and complete.' },
  f8821:   { version: V, group: 'tax', who: 'consumer', file: 'IRS-8821', title: 'IRS Form 8821: Tax Information Authorization',
    what: 'Lets us see and talk to the IRS about your payroll tax forms.',
    agree: 'I authorize Caring Companions to inspect and receive my confidential employment tax information for the forms and years shown. If I am signing for the taxpayer, I certify that I have the legal authority to do so.' },
  f2678:   { version: V, group: 'tax', who: 'consumer', agent: true, file: 'IRS-2678', title: 'IRS Form 2678: Employer Appointment of Agent',
    what: 'Names us as your agent to file and pay federal payroll taxes for your attendant.',
    agree: 'I am a home care service recipient, and I appoint Caring Companions as my agent to report, deposit and pay my federal employment taxes, including FUTA. I authorize the IRS to share my confidential tax information with my agent for this appointment.' },
  mo2643a: { version: V, group: 'tax', who: 'office', path: 'new', file: 'MO-2643A', title: 'Missouri Form 2643A: Tax Registration',
    what: 'Sets up your Missouri Tax ID for state withholding. We fill it in and sign it, as your vendor.' },
  mo2827:  { version: V, group: 'tax', who: 'consumer', agent: true, file: 'MO-2827', title: 'Missouri Form 2827: Power of Attorney',
    what: 'Lets us handle your Missouri withholding taxes for you.',
    agree: 'Under penalties of perjury, I certify that I am the taxpayer named on this form, or that I have the authority to sign this power of attorney for them. I appoint Caring Companions for Missouri withholding tax, all tax periods.' },
};
export const ORDER = ['vendor', 'numbers', 'evv', 'backup', 'prev', 'ss4', 'f8821', 'f2678', 'mo2643a', 'mo2827'];
export const formsFor = kind => ORDER.filter(k => !FORMS[k].path || FORMS[k].path === kind);
export const consumerForms = kind => formsFor(kind).filter(k => FORMS[k].who === 'consumer');

export const EVV_CHOICES = {
  phone: 'Yes, my attendant may use my home phone to clock in and out.',
  app: 'No. My attendant will use the WellSky app, not my home phone.',
  none: 'I do not have a home phone. My attendant will use the WellSky app.',
};

const full = a => [a.first, a.last].filter(Boolean).join(' ');
const line = (...xs) => xs.filter(Boolean).join(', ');
const mdy = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.slice(5, 7) + '/' + d.slice(8) + '/' + d.slice(0, 4) : '');
const who = (n, rel) => (n ? n + (rel ? ' (' + rel + ')' : '') : '');

// The words of each of our own forms, filled in, as blocks ({h} heading, {p} paragraph, {kv} pairs).
export function ourDoc(key, a) {
  const n = full(a) || 'the consumer';
  if (key === 'vendor') return [{ p: `I, ${n}, acknowledge that I have selected ${AGENCY.long} as my authorized Consumer Directed Services (CDS) vendor. I understand that by choosing ${AGENCY.dba}, they will provide administrative support, manage payroll for my attendant, and ensure compliance with all CDS program requirements. I recognize that I am responsible for directing my own care, selecting my personal care attendant, and ensuring services are performed according to my care plan. This agreement reflects my informed decision to choose ${AGENCY.dba} as my CDS vendor.` }];
  if (key === 'numbers') return [{ p: `I, ${n}, authorize a representative from ${AGENCY.long} to obtain my Federal Employer Identification Number, Missouri Identification Number, and my Division of Employment Security Number via the internet. I understand these numbers are needed so that I can legally be an employer and pay an attendant to provide services authorized by the Missouri Department of Health and Senior Services for the Consumer Directed Services program.` }];
  if (key === 'evv') return [
    { p: 'Missouri requires Electronic Visit Verification (EVV) for every shift. Your attendant clocks in and out with the WellSky app on their phone, or by calling a toll-free number from your home phone.' },
    { p: 'Home phone calls are used only to clock in and out. No personal calls. You are never charged for these calls.' },
    { kv: [['My choice', EVV_CHOICES[a.evv] || 'Not chosen yet']] }];
  if (key === 'backup') return [
    { p: 'Every consumer keeps a back-up plan in case their attendant is sick, has a personal emergency, or cannot travel in bad weather. The back-up plan is used whenever the attendant cannot provide services.' },
    { kv: [['Back-up person', line(who(a.b1_name, a.b1_rel), a.b1_phone)], ['Emergency contact', line(who(a.b2_name, a.b2_rel), a.b2_phone) || 'None given']] },
    { p: `I, ${n}, have prepared this emergency back-up plan to keep my care going when my attendant is unavailable.` }];
  if (key === 'prev') return [
    { p: `I, ${n}, authorize ${AGENCY.long} to request Tax ID details and information on my behalf from any previous vendors that I have received services through. I was previously with:` },
    { kv: [['Vendor 1', line(a.v1, a.v1_phone)], ...(a.v2 ? [['Vendor 2', line(a.v2, a.v2_phone)]] : [])] },
    { p: 'We send your old agency the second half of this form to fill in your EIN, Missouri Tax ID, PIN and unemployment (SUTA) number, for tax purposes only, as Missouri Medicaid Audit and Compliance (MMAC) rules require.' }];
  return [];
}

// What each tax form will say, in plain rows, for the consumer to check before signing.
export function taxRows(key, a, ssnLast4) {
  const home = line(a.street + (a.apt ? ' ' + a.apt : ''), a.city, (a.state || 'MO') + ' ' + (a.zip || ''));
  const ssn = 'XXX-XX-' + (ssnLast4 || '____');
  const y = new Date().getFullYear();
  if (key === 'ss4') return [['Employer', full(a)], ['SSN', ssn], ['Home address', home], ['County', (a.county || '') + ', MO'], ['Mail goes to', 'Caring Companions, ' + AGENCY_ADDRESS],
    ['Type', 'Household Employer (HCSR)'], ['First pay date', mdy(a.first_pay) || 'Not sure yet'], ['Third party designee', AGENCY.signer + ' c/o ' + AGENCY.legal]];
  if (key === 'f8821') return [['Taxpayer', full(a)], ['SSN', ssn], ['Designee', AGENCY.signer + ' c/o ' + AGENCY.dba], ['Tax matters', `Employment taxes: 941, 940, 941-X, 940-X, W-2 and W-3, ${y} to ${y + 4}`]];
  if (key === 'f2678') return [['Employer', full(a)], ['Agent', AGENCY.legal], ['Forms', '940 and 941, all employees'], ['Home care service recipient', 'Yes'], ['Agent signs', AGENCY.signer + ' (office signs after you)']];
  if (key === 'mo2643a') return [['Owner', full(a)], ['Tax type', 'Missouri employer withholding'], ['Signed by', AGENCY.signer + ', ' + AGENCY.mo_signer_title]];
  if (key === 'mo2827') return [['Taxpayer', full(a)], ['SSN', ssn], ['Representative', AGENCY.legal], ['Tax type', 'Withholding, all tax periods'], ['Representative signs', AGENCY.signer + ' (office signs after you)']];
  return [];
}

// The exact text a signature is made against (fingerprinted by the server).
export function formText(key, a, ssnLast4) {
  const f = FORMS[key];
  if (!f) return null;
  const body = f.group === 'ours'
    ? ourDoc(key, a).map(b => b.p || (b.kv || []).map(r => r.join(': ')).join('\n')).join('\n')
    : taxRows(key, a, ssnLast4).map(r => r.join(': ')).join('\n') + (f.agree ? '\n' + f.agree : '');
  return '## ' + f.title + ' (' + f.version + ')\n' + body;
}
