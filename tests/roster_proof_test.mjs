// Background check proof for Roster attendants, brought in from GHL (2026-10-22).
// End to end on a local Postgres copy: the real SQL and server logic, a made-up GHL with files
// shaped like the real CDS contacts ("Upload FCSR" etc., "<Name> Prehire EDL.pdf").
//   PGLITE=/path/to/pglite/dist/index.js node tests/roster_proof_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createMatch } = await import(ROOT + '/supabase/functions/_shared/match/handlers.js');
const { practiceDeps } = await import(ROOT + '/caregiver-match/practice/deps.js');
const RP = await import(ROOT + '/supabase/functions/_shared/office/roster-proof.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const refuses = async (fn, re, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };

// ---------- pure parts ----------
ok(RP.checkOf('📄 Upload FCSR') === 'fcsr' && RP.checkOf('Upload EDL') === 'edl' && RP.checkOf('Anita Smith Prehire OIG Search Results.pdf') === 'oig', 'check named by field or file');
ok(RP.checkOf('Prehire EDL.pdf') === 'edl' && RP.checkOf('Employee ID/FCSR Registrant Number') === 'fcsr', 'file without a name still classified');
ok(RP.checkOf('FCSR and EDL.pdf') === null && RP.checkOf('Social Security Card') === null && RP.checkOf('MEDLINE.pdf') === null, 'two checks, none, or a word containing EDL: not classified');

const pdf = (meta, body = '') => new TextEncoder().encode('%PDF-1.7\n' + body + '\n' + meta + '\n%%EOF');
ok(RP.pdfDate(pdf('<< /CreationDate (D:20251017142233-05\'00\') /ModDate (D:20260101000000) >>'), '2026-10-22') === '2025-10-17', 'PDF saved-on date read');
ok(RP.pdfDate(pdf('<x:xmpmeta><xmp:CreateDate>2026-02-02T10:00:00</xmp:CreateDate>'), '2026-10-22') === '2026-02-02', 'XMP date read when no Info date');
ok(RP.pdfDate(pdf('/CreationDate (D:20270101000000)'), '2026-10-22') === '', 'a future date is not used');
ok(RP.pdfDate(pdf('/CreationDate (D:19800101000000)'), '2026-10-22') === '', 'an old date (like a birth date) is not used');
ok(RP.pdfDate(new TextEncoder().encode('PNG....'), '2026-10-22') === '' && RP.pdfDate(pdf(''), '2026-10-22') === '', 'not a PDF, or no date: empty (the office types it)');

ok(RP.kindOf('EDL Anita Smith CDS DEC 25', 'pdf') === 'edl' && RP.kindOf('CDS Attendant Application', 'pdf') === 'application' && RP.kindOf('Step 1: CDS Attendant Application', '') === 'application', 'recheck and application named');
ok(RP.kindOf('CDS_Attendant_Onboarding_Orientation_Documents', 'pdf') === 'onboarding', 'onboarding papers named');
ok(['Anita Smith E-Verify Case', 'Joan Hatch E-Verify', 'Social Security Card', 'SSN copy', 'Drivers License', 'Joan ID', 'I-9 Joan'].every(n => RP.kindOf(n, 'pdf') === null), 'E-Verify, SSN, license, ID and I-9 are never kept');
ok(RP.kindOf('image', 'jpg') === null && RP.kindOf('IMG_7511', 'png') === null && RP.kindOf('sign-timestamp-1766511338', 'png') === null && RP.kindOf('Application scan', 'jpg') === null, 'photos and images are never kept, whatever the name');
ok(RP.kindOf('E-Verify Application', 'pdf') === null, 'E-Verify wins over the word application');

const contacts = [{ id: 'c1', firstName: 'Joan', lastName: 'Hatch', phone: '+14179526432', email: 'joan@x.test' },
  { id: 'c2', firstName: 'Jo', lastName: 'Smith', phone: '+14175550000' }, { id: 'c3', firstName: 'Jo', lastName: 'Smith', phone: '+14175559999' }];
ok(RP.matchContact({ name: 'Somebody', phone: '(417) 952-6432' }, contacts).id === 'c1', 'match by phone first');
ok(RP.matchContact({ name: 'x', email: 'JOAN@x.test' }, contacts).id === 'c1', 'match by email');
ok(RP.matchContact({ name: 'Hatch, Joan' }, contacts).id === 'c1', 'match by name in either order');
ok(RP.matchContact({ name: 'Jo Smith' }, contacts) === null, 'two contacts with the same name and no phone: no match');

// ---------- database ----------
const pg = new PGlite();
const db = { query: (s, p) => pg.query(s, p) };
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(`create table if not exists agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key))`);
await pg.exec(strip(readFileSync(ROOT + '/oig_check.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/attendant_packet.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/consumer_packet.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/consumer_forms.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/roster_proof.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'roster_proof.sql runs twice');
const can = async (role, sql) => { await pg.exec('set role ' + role); try { await pg.query(sql); return true; } catch { return false; } finally { await pg.exec('reset role'); } };
ok(!(await can('anon', 'select * from cds_roster_proof')) && !(await can('authenticated', 'select * from cds_roster_proof')), 'nobody outside reads the proof table');

await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds','attendants',$1::jsonb)`, [JSON.stringify([
  { id: 'a1', name: 'Joan Hatch', phone: '417-952-6432', status: 'active' },
  { id: 'a2', name: 'Flo Montgomery', email: 'flo@x.test', status: 'active', edlDate: '2026-09-01' },
  { id: 'a3', name: 'Nobody InGhl', phone: '417-000-0000', status: 'active' },
  { id: 'a4', name: 'Left Already', phone: '417-111-1111', status: 'inactive' },
])]);

// A made-up GHL, shaped like the CDS sub-account.
const FIELDS = [{ id: 'fF', name: '📄 Upload FCSR' }, { id: 'fE', name: '📄 Upload EDL' }, { id: 'fO', name: '📄 Upload OIG' },
  { id: 'rF', name: '➡️ FCSR RESULTS' }, { id: 'rE', name: '➡️ EDL RESULTS' }, { id: 'rO', name: '➡️ OIG RESULTS' }, { id: 'fS', name: '⭐️ Social Security Card (Copy)' }];
const file = (name, url) => ({ ['u' + url.length]: { meta: { originalname: name, mimetype: 'application/pdf', size: 100 }, url } });
const GHL = {
  g1: { id: 'g1', firstName: 'Joan', lastName: 'Hatch', phone: '+14179526432', customFields: [
    { id: 'fF', value: file('Joan Hatch Prehire FCSR.pdf', 'https://storage.googleapis.com/msgsndr/x/fcsr1.pdf') },
    { id: 'fE', value: file('Joan Hatch Prehire EDL.pdf', 'https://storage.googleapis.com/msgsndr/x/edl1.pdf') },
    { id: 'fO', value: file('Joan Hatch Prehire OIG.pdf', 'https://storage.googleapis.com/msgsndr/x/oig1.pdf') },
    { id: 'fS', value: file('ssn card.jpg', 'https://storage.googleapis.com/msgsndr/x/ssn.jpg') },
    { id: 'rF', value: '✅ Clear' }, { id: 'rE', value: '✅ Not on EDL List - CLEAR' }, { id: 'rO', value: '✅ Not on List - CLEAR' }] },
  g2: { id: 'g2', firstName: 'Flo', lastName: 'Montgomery', email: 'flo@x.test', customFields: [
    { id: 'fE', value: file('Prehire EDL.pdf', 'https://storage.googleapis.com/msgsndr/x/edl2.pdf') },
    { id: 'fO', value: file('Prehire OIG Search Results.pdf', 'https://storage.googleapis.com/msgsndr/x/oig2.pdf') }] },
};
const doc = (id, name, extra = {}) => ({ id, name, type: 'file', extension: 'pdf', size: 1000, status: 'completed', createdAt: '2025-12-05T19:19:05.474Z', createdBy: { sourceName: 'Lydia Chapman' }, ...extra });
const DOCS = {
  g1: { internal: [{ id: 'cf', type: 'folder', name: 'Custom Fields', isStandardFolder: true },
      doc('d1', 'Joan Hatch CDS_Attendant_Application_-_Public_Document', { createdAt: '2026-02-10T12:00:00Z' }),
      doc('d2', 'EDL Joan Hatch CDS DEC 25'),
      doc('d3', 'Joan Hatch E-Verify'),
      doc('d4', 'image', { extension: 'jpg' }),
      doc('d5', 'Joan Hatch Prehire FCSR_27-6-2025_4:46:19:604'),
      doc('d6', 'sign-timestamp-1770828859', { extension: 'png' })],
    sent: [{ id: 'dc', type: 'folder', name: 'Documents and Contracts' }], received: [] },
  dc: [{ id: 'e1', type: 'file', name: 'Step 1: CDS Attendant Application', extension: '', size: 0, source: 'PROPOSAL_AND_CONTRACTS', status: 'completed', createdAt: '2025-07-03T17:46:30Z', updatedAt: '2025-07-07T03:42:04Z' },
    { id: 'e2', type: 'file', name: 'CDS Attendant Onboarding/Orientation Documents', extension: '', size: 0, source: 'PROPOSAL_AND_CONTRACTS', status: 'completed', createdAt: '2025-07-31T16:28:24Z', updatedAt: '2025-07-31T16:30:39Z' }],
  cf: [doc('x1', 'Joan Hatch Prehire FCSR')],
};
let docCalls = [];
const FILES = {
  'https://services.leadconnectorhq.com/documents/download/d1': pdf('/CreationDate (D:20260210100000)'),
  'https://services.leadconnectorhq.com/documents/download/d2': pdf(''),
  'https://storage.googleapis.com/msgsndr/x/fcsr1.pdf': pdf('/CreationDate (D:20260126094700)'),
  'https://storage.googleapis.com/msgsndr/x/edl1.pdf': pdf('/CreationDate (D:20260127100000)'),
  'https://storage.googleapis.com/msgsndr/x/oig1.pdf': pdf('/CreationDate (D:20260126120000)'),
  'https://storage.googleapis.com/msgsndr/x/edl2.pdf': pdf(''),
  'https://storage.googleapis.com/msgsndr/x/oig2.pdf': pdf('/CreationDate (D:20250703101010)'),
};
let fetched = [], ghlWrites = 0;
const base = practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' });
const deps = { ...base, mode: 'live',
  ghl: { ...base.ghl, upsert: async () => { ghlWrites++; }, update: async () => { ghlWrites++; },
    find: async query => Object.values(GHL).filter(c => [c.phone, c.email, c.firstName + ' ' + c.lastName].some(v => v && String(v).replace(/\D/g, '').includes(String(query).replace(/\D/g, '') || '#') || String(v || '').toLowerCase() === String(query).toLowerCase() || (c.firstName + ' ' + c.lastName).toLowerCase() === String(query).toLowerCase())),
    contact: async id => GHL[id], fields: async () => FIELDS,
    documents: async ({ contactId, documentType, folderId }) => { docCalls.push([contactId, documentType, folderId || null]);
      if (contactId === 'g2') throw new Error('GoHighLevel 401: not allowed');
      if (folderId) return DOCS[folderId] || []; return (DOCS[contactId] || {})[documentType] || []; } },
  files: { fetch: async url => { fetched.push(url); if (!FILES[url]) throw new Error('GHL file 404'); return { bytes: FILES[url], mime: 'application/pdf' }; } },
  media: { ...base.media, putFile: async ({ folder, mime, bytes, data, by }) => (await db.query(`insert into cds_media (pool_id, kind, mime, practice_data, bytes, created_by) values (null,'proof',$1,$2,$3,$4) returning id`, [mime, folder, (bytes || data || '').length, by])).rows[0].id } };
await pg.query(`insert into cds_match_settings (key, value, updated_by) values ('staff_emails', '["office@x.test"]'::jsonb, 't') on conflict (key) do update set value = excluded.value`);
const match = createMatch(deps);
const S = (a, i = {}) => match.handle('staff', a, { staff: 'office@x.test', ...i });

await refuses(() => match.handle('staff', 'rosterProofScan', { staff: 'stranger@x.test' }), /staff list/, 'someone not on the staff list is refused');
await refuses(() => match.handle('public', 'rosterProofScan', {}), /Unknown/, 'not reachable without signing in');

const r = await S('rosterProofScan');
ok(r.items.length === 9, 'nine brought in (Joan: 3 boxes + application, December EDL, 2 signed records; Flo: 2 boxes): ' + r.items.length);
ok(!fetched.some(u => /ssn|download\/d3|download\/d4|download\/d6/.test(u)), 'the SSN card, E-Verify, photos and signature stamps are never copied');
ok(!fetched.some(u => /download\/d5|download\/x1/.test(u)) && !docCalls.some(c => c[2] === 'cf'), 'a panel copy of an Upload box file, and GHL\'s Custom Fields folder, are skipped');
const joan = r.items.filter(x => x.name === 'Joan Hatch');
ok(joan.some(x => x.check === 'application' && x.url && /Application/.test(x.file_name)), 'the application PDF is copied');
ok(joan.some(x => x.check === 'application' && !x.url && /\/contacts\/detail\/g1\?view=documents$/.test(x.ghl_link) && /signed in GHL/.test(x.file_name)), 'a signed GHL application links to GHL');
ok(joan.some(x => x.check === 'onboarding' && x.ghl_link), 'onboarding papers kept');
const dec = joan.find(x => x.check === 'edl' && /DEC 25/.test(x.file_name));
ok(dec && dec.date_found === '2025-12-05', 'the December EDL recheck comes in, dated the day it went into GHL when the PDF has no date');
ok(r.skipped.some(x => x.name === 'Flo Montgomery' && /Documents panel/.test(x.why)), 'GHL refusing the Documents panel is said, not hidden');
ok(ghlWrites === 0, 'nothing written to GHL');
const by = (n, c) => r.items.find(x => x.name === n && x.check === c && /Prehire/.test(x.file_name));  // the Upload box files
ok(by('Joan Hatch', 'fcsr').date_found === '2026-01-26' && by('Joan Hatch', 'edl').date_found === '2026-01-27', 'dates read from the PDFs');
ok(by('Joan Hatch', 'edl').ghl_result === '✅ Not on EDL List - CLEAR', 'GHL result kept');
ok(by('Flo Montgomery', 'edl').date_found === '' && by('Flo Montgomery', 'edl').file_name === 'Prehire EDL.pdf', 'a PDF with no date comes back blank for the office to type');
ok(r.skipped.filter(x => /No GHL contact/.test(x.why)).length === 1 && r.skipped.find(x => /No GHL contact/.test(x.why)).name === 'Nobody InGhl', 'not found in GHL is listed, not hidden');
ok(!r.items.some(x => x.name === 'Left Already') && !r.skipped.some(x => x.name === 'Left Already'), 'inactive attendants are left out');
ok(r.roster.find(a => a.id === 'a2').edlDate === '2026-09-01', 'current Roster dates come back for the review');

fetched = [];
const r2 = await S('rosterProofScan');
ok(r2.items.length === 9 && fetched.length === 0 && r2.added === 0, 'running it again copies nothing twice');
ok((await pg.query('select count(*)::int n from cds_roster_proof')).rows[0].n === 9, 'nine rows');
const appRow = joan.find(x => x.check === 'application' && x.url);
ok((await S('rosterProofConfirm', { items: [{ id: appRow.id, checked_on: '2026-01-01' }] })).saved === 0, 'a date is only ever saved on a check, not on a paper');

await refuses(() => S('rosterProofConfirm', { items: [{ id: by('Joan Hatch', 'fcsr').id, checked_on: '2099-01-01' }] }), /between 2015 and today/, 'a future date is refused');
await refuses(() => S('rosterProofConfirm', { items: [] }), /Nothing/, 'empty save refused');
const c = await S('rosterProofConfirm', { items: [{ id: by('Joan Hatch', 'fcsr').id, checked_on: '2026-01-26' }, { id: by('Flo Montgomery', 'edl').id, checked_on: '2025-07-03' }] });
ok(c.saved === 2, 'office dates saved');
const row = (await pg.query(`select * from cds_roster_proof where id=$1`, [by('Flo Montgomery', 'edl').id])).rows[0];
ok(String(row.checked_on.toISOString ? row.checked_on.toISOString() : row.checked_on).slice(0, 10) === '2025-07-03' && row.confirmed_by === 'office@x.test', 'who confirmed is kept');

const l = await S('rosterProofList', { attendant_id: 'a1' });
ok(l.items.length === 7 && l.items.every(x => x.name === 'Joan Hatch') && l.items[0].check === 'application', 'one attendant\'s papers listed, application first');

await refuses(() => S('rosterProofAdd', { attendant_id: 'a1', check_key: 'edl', checked_on: '2026-10-22', result: 'clear' }), /PDF or screenshot/, 'a recheck needs proof');
await refuses(() => S('rosterProofAdd', { attendant_id: 'a1', check_key: 'edl', checked_on: '2026-10-22', result: 'not_clear', proof: { mime: 'application/pdf', data: 'data:application/pdf;base64,JVBERg==' } }), /call Samantha/, 'a not-clear result is not recorded here');
await refuses(() => S('rosterProofAdd', { attendant_id: 'a4', check_key: 'edl', checked_on: '2026-10-22', result: 'clear', proof: { mime: 'application/pdf', data: 'data:application/pdf;base64,JVBERg==' } }), /active Roster/, 'inactive attendant refused');
const add = await S('rosterProofAdd', { attendant_id: 'a1', check_key: 'edl', checked_on: '2026-10-20', result: 'clear', proof: { mime: 'application/pdf', name: 'EDL recheck.pdf', data: 'data:application/pdf;base64,JVBERg==' } });
ok(add.ok && add.item.check === 'edl' && add.item.checked_on === '2026-10-20' && add.item.source === 'hub', 'a recheck with proof is saved');
ok((await S('rosterProofList', { attendant_id: 'a1' })).items.filter(x => x.check === 'edl').length === 3, 'the pre-hire EDL and the December recheck are kept next to the new recheck');
ok((await pg.query(`select count(*)::int n from cds_audit where action like 'roster_proof%'`)).rows[0].n >= 4, 'actions are in the audit log');

// ---------- the hub page: Roster dates move forward only ----------
const HP = await import(ROOT + '/caregiver-match/hub-packet.js');
const pp = HP.proofPatches([
  { attendant_id: 'a1', check: 'edl', checked_on: '2026-01-27' }, { attendant_id: 'a1', check: 'edl', checked_on: '2026-10-20' },
  { attendant_id: 'a1', check: 'fcsr', checked_on: '2026-01-26' }, { attendant_id: 'a2', check: 'edl', checked_on: '2025-07-03' },
  { attendant_id: 'a2', check: 'oig', checked_on: '' }],
  [{ id: 'a1', name: 'Joan Hatch' }, { id: 'a2', name: 'Flo Montgomery', edlDate: '2026-09-01' }]);
ok(pp.length === 1 && pp[0].id === 'a1' && pp[0].patch.edlDate === '2026-10-20' && pp[0].patch.fcsrDate === '2026-01-26' && !('leieDate' in pp[0].patch), 'newest date per check goes on the Roster');
ok(!pp.some(p => p.id === 'a2'), 'an older date never replaces a newer Roster date; a blank date changes nothing');
const due = HP.rosterDue({ edlDate: '2026-01-27', fcsrDate: '2026-01-26' }, '2026-10-11', new Date('2026-10-22T12:00:00'));
ok(due.tone === 'r' && /EDL overdue/.test(due.label), 'a pre-hire EDL from January shows overdue (every 3 months)');

// ---------- a paper added by hand (a packet signed in GHL e-sign) ----------
await refuses(() => S('rosterProofAdd', { attendant_id: 'a2', check_key: 'application' }), /Add the PDF/, 'a paper needs its PDF');
const pa = await S('rosterProofAdd', { attendant_id: 'a2', check_key: 'application', proof: { mime: 'application/pdf', name: 'Flo application packet.pdf', data: 'data:application/pdf;base64,JVBERg==' } });
ok(pa.ok && pa.item.check === 'application' && pa.item.source === 'hub' && !pa.item.checked_on, 'the application packet PDF is added, with no check date');
await refuses(() => S('rosterProofAdd', { attendant_id: 'a2', check_key: 'ssn', proof: { mime: 'application/pdf', data: 'data:application/pdf;base64,JVBERg==' } }), /Pick FCSR/, 'only the kept kinds can be added');

console.log(`roster proof: ${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
