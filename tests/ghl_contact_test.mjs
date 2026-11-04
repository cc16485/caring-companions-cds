// Address and county for the CDS GoHighLevel sync (_shared/office/ghl-contact.js), and that ghl-sync
// never reads the SSN, never puts tags on the upsert, and never blanks a GHL field.
//   node tests/ghl_contact_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = await import(ROOT + '/supabase/functions/_shared/office/ghl-contact.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

// Leads
eq(G.placeFor('pipeline', { name: 'Ann Lee', county: 'Greene', street: '12 Elm', city: 'Springfield', zip: '65802' }),
  { address: { address1: '12 Elm', city: 'Springfield', state: 'MO', postalCode: '65802' }, county: 'Greene', from: 'lead' }, 'lead own address, MO filled in');
eq(G.placeFor('pipeline', { name: 'Ann', referral: { street: '4 Oak', apt: 'Apt 2', city: 'Ozark', zip: '65721', county: 'Christian' } }),
  { address: { address1: '4 Oak Apt 2', city: 'Ozark', state: 'MO', postalCode: '65721' }, county: 'Christian', from: 'lead' }, 'lead referral address + county');
eq(G.placeFor('pipeline', { name: 'Ann', county: 'Polk' }), { address: {}, county: 'Polk', from: '' }, 'county only, no address');
eq(G.placeFor('pipeline', { name: 'Ann', city: '  ' }), { address: {}, county: '', from: '' }, 'blank sends nothing');

// Consumers: profile, then packet, then lead
const pipeline = [{ name: 'Bea  Cole', movedToConsumers: true, street: '9 Lead Rd', city: 'Nixa', zip: '65714', county: 'Christian' }];
const packets = [
  { consumer_id: null, sent_at: '2026-10-01', signed_at: '2026-10-02', first: 'Bea', last: 'Cole', street: '7 Packet Ln', city: 'Republic', zip: '65738', county: 'Greene' },
  { consumer_id: 'c9', sent_at: '2026-09-01', signed_at: '2026-09-02', first: 'Someone', last: 'Else', street: '1 Linked St', city: 'Bolivar', state: 'MO', zip: '65613', county: 'Polk' },
];
const bea = { id: 'c1', name: 'Bea Cole' };
eq(G.placeFor('consumers', { ...bea, facts: { street: '5 Typed Ave', city: 'Marshfield', zip: '65706' } }, { packets, pipeline }).from, 'profile', 'typed on profile wins');
eq(G.placeFor('consumers', bea, { packets, pipeline }),
  { address: { address1: '7 Packet Ln', city: 'Republic', state: 'MO', postalCode: '65738' }, county: 'Greene', from: 'packet' }, 'unlinked packet by name');
eq(G.placeFor('consumers', { id: 'c9', name: 'Different Name' }, { packets, pipeline }).address.city, 'Bolivar', 'linked packet by consumer id, whatever the name');
eq(G.placeFor('consumers', bea, { packets: [], pipeline }),
  { address: { address1: '9 Lead Rd', city: 'Nixa', state: 'MO', postalCode: '65714' }, county: 'Christian', from: 'lead' }, 'falls back to their lead');
eq(G.placeFor('consumers', { ...bea, county: 'Webster' }, { packets, pipeline }).county, 'Webster', 'county on the consumer wins');
eq(G.placeFor('consumers', { id: 'c2', name: 'Nobody' }, { packets, pipeline }), { address: {}, county: '', from: '' }, 'nothing known, nothing sent');
ok(G.packetFor({ id: 'c3', name: 'Bea Cole' }, [{ ...packets[0], sent_at: null }]) === null, 'never-sent packet is not used');
ok(G.leadFor(bea, [{ name: 'Bea Cole' }]) === null, 'lead must have moved to consumers');

// Attendants have none
eq(G.placeFor('attendants', { name: 'Al', county: 'Greene' }), { address: {}, county: '', from: '' }, 'attendants get nothing');

// County field
ok(G.countyField([{ id: 'a', name: 'Age' }, { id: 'b', name: 'County' }]).id === 'b', 'finds County');
ok(G.countyField([{ id: 'a', name: 'county ' }, { id: 'b', name: 'County' }]) === null, 'two County fields: refuse to guess');
ok(G.countyField([{ id: 'a', name: 'Counties served' }]) === null, 'not a near-miss name');
const pick = { id: 'b', name: 'County', picklistOptions: ['Greene County', 'Christian County'] };
eq(G.countyValue(pick, 'Greene'), 'Greene County', 'matches pick-list option');
eq(G.countyValue({ ...pick, picklistOptions: ['Greene'] }, 'greene county'), 'Greene', 'matches the other way');
eq(G.countyValue(pick, 'Texas'), null, 'not an option: left out');
eq(G.countyValue({ id: 'b', name: 'County' }, ' Polk '), 'Polk', 'text field takes it as typed');
eq(G.countyValue(null, 'Polk'), null, 'no field, no county');

// Audit counts, never values
const audit = G.fieldAudit([{ id: 'f1', name: 'County', dataType: 'TEXT' }, { id: 'f2', name: 'Old', dataType: 'TEXT' }, { id: 'f3', name: 'Files', dataType: 'FILE_UPLOAD' }],
  [{ customFields: [{ id: 'f1', value: 'Greene' }, { id: 'f2', value: '' }, { id: 'f3', value: { x: { url: 'u' } } }] }, { customFields: [{ id: 'f1', value: 'Polk' }, { id: 'f2', value: [] }] }, {}]);
eq(audit.map(a => [a.name, a.filled]), [['County', 2], ['Files', 1], ['Old', 0]], 'counts filled, most first');
ok(!JSON.stringify(audit).includes('Greene'), 'audit carries no values');

// ghl-sync itself
const src = readFileSync(ROOT + '/supabase/functions/ghl-sync/index.ts', 'utf8');
const sel = (src.match(/from\('cds_enroll_packets'\)\s*\.select\('([^']+)'\)/) || [])[1] || '';
ok(sel && !/ssn|answers(?!->>)|\*/.test(sel), 'packets read address and name only, never the SSN');
const upsert = src.slice(src.indexOf('/contacts/upsert`'), src.indexOf("source: 'CDS Hub'"));
ok(upsert && !/\btags\b/.test(upsert), 'the upsert carries no tags (tags only added, never replaced)');
ok(/\/contacts\/\$\{encodeURIComponent\(contactId\)\}\/tags/.test(src), 'tags go through add-tags');
ok(!/method: 'DELETE'/.test(src), 'nothing is ever deleted in GHL');
ok(/if \(dry\)[\s\S]{0,200}continue/.test(src), 'dry run sends nothing');

ok(!/SUPABASE_SERVICE_ROLE_KEY'\)\s*\n?\s*const \{ data: u/.test(src) && !/jwt === Deno\.env/.test(src), 'no server-key sign-in any more');
ok(/\^step-\[a-f0-9\]\{32,\}\$/.test(src) && /Date\.parse\(v\.expires\) < Date\.now\(\)/.test(src) && /SHA-256/.test(src), 'step code: long, hashed, expires');
console.log(`${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
