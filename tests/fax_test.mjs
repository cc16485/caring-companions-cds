// One-click fax (2026-10-25): what can be sent, to where, receipts, incoming faxes, the switch.
//   PGLITE=/path/to/pglite/dist/index.js node tests/fax_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createFax, FAX_FORMS, describe, base64ToBytes, bytesToBase64, niceNumber } = await import(ROOT + '/supabase/functions/_shared/office/fax.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const refuses = async (fn, want, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { ok(want instanceof RegExp ? want.test(e.message) : e.message === want, m + ': ' + e.message); } };

const pg = new PGlite();
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
  create table public.agency_data (id uuid primary key default gen_random_uuid(), agency_id uuid, data_key text, data_value jsonb);`);
const SQL = readFileSync(ROOT + '/fax.sql', 'utf8'); await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'fax.sql runs twice');
const grants = (await pg.query(`select count(*)::int n from information_schema.role_table_grants where table_name='cds_fax' and grantee in ('anon','authenticated')`)).rows[0].n;
eq(grants, 0, 'nobody outside can read the fax table');

const files = { 'mg1/packet/GASPER_MICHAEL_IRS-8821.pdf': new Uint8Array([37, 80, 68, 70, 1]), 'mg1/packet/GASPER_MICHAEL_MO-2643A.pdf': new Uint8Array([37, 80, 68, 70, 2]) };
const store = { async download(p) { if (!files[p]) throw new Error('nf'); return files[p]; }, async upload(p, b) { files[p] = b; } };
let T = Date.parse('2026-10-26T15:00:00Z'), n = 0;
const db = { query: (t, p) => pg.query(t, p) };
const F = createFax({ db, store, now: () => T, token: () => 'tok' + (++n).toString().padStart(5, '0') });
const setLive = async v => { await pg.query(`delete from public.agency_data where data_key='faxLive'`); await pg.query(`insert into public.agency_data (data_key, data_value) values ('faxLive', $1)`, [JSON.stringify({ live: v })]); };
await pg.query(`insert into public.agency_data (data_key, data_value) values ('consumers', $1)`, [JSON.stringify([
  { id: 'mg1', name: 'Michael Gasper', ein: '', packetForms: [{ file: 'IRS-8821', name: 'GASPER_MICHAEL_IRS-8821.pdf', path: 'mg1/packet/GASPER_MICHAEL_IRS-8821.pdf' },
    { file: 'MO-2643A', name: 'GASPER_MICHAEL_MO-2643A.pdf', path: 'mg1/packet/GASPER_MICHAEL_MO-2643A.pdf' }] },
  { id: 'db2', name: 'David Example', ein: '12-1111111', packetForms: [] }])]);

// ---------- the forms and numbers ----------
eq(Object.keys(FAX_FORMS), ['IRS-8821', 'MO-2643A', 'MO-2827'], 'only the three faxable forms (no SS-4, no 2678)');
eq([FAX_FORMS['IRS-8821'].to, FAX_FORMS['MO-2643A'].to, FAX_FORMS['MO-2827'].to], ['18552147522', '15735221722', '15735221722'], 'the same numbers as the Tax Setup steps');
eq(niceNumber('18552147522'), '(855) 214-7522', 'numbers shown the usual way');

// ---------- switch off ----------
await setLive(false);
await refuses(() => F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'IRS-8821' }), /switched off/, 'off: nothing can be queued');
eq(await F.google({ kind: 'next' }), { ok: true, off: true, faxes: [] }, 'off: the script gets nothing to send');
eq((await F.google({ kind: 'incoming', from: '4175551234', pdf: bytesToBase64(new Uint8Array([1])) })).off, true, 'off: incoming faxes are not taken in');
eq((await F.hub('zach@caringcds.com', { action: 'list' })).live, false, 'the hub sees it is off');

// ---------- what can be queued ----------
await setLive(true);
await refuses(() => F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'IRS-SS-4' }), 'That form cannot be faxed from here.', 'the SS-4 cannot be faxed from here');
await refuses(() => F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'IRS-2678' }), 'That form cannot be faxed from here.', 'the 2678 is mail only');
await refuses(() => F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'nobody', formKey: 'IRS-8821' }), /not found/, 'unknown consumer');
await refuses(() => F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'db2', formKey: 'IRS-8821' }), /no signed Form 8821 saved for David Example/, 'no signed form saved: refused');
await refuses(() => F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'MO-2643A' }), /until the IRS issues the EIN/, 'Missouri forms wait for the EIN');
let r = await F.hub('Zach@CaringCDS.com', { action: 'queue', consumerId: 'mg1', formKey: 'IRS-8821', to: '19995551212', path: 'someone-else.pdf' });
eq([r.fax.status, r.fax.to, r.fax.requestedBy], ['queued', '(855) 214-7522', 'zach@caringcds.com'], 'queued to the 8821 number, whatever the page sends');
const row1 = (await pg.query(`select * from public.cds_fax where id=$1`, [r.fax.id])).rows[0];
eq([row1.doc_path, row1.token], ['mg1/packet/GASPER_MICHAEL_IRS-8821.pdf', 'CDS-FAX-tok00001'], 'the saved signed form, with a reference');
await refuses(() => F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'IRS-8821' }), /already on its way/, 'no double send');

// ---------- the Google script sends it ----------
let nx = await F.google({ kind: 'next' });
eq(nx.faxes.length, 1, 'one fax to send');
const f = nx.faxes[0];
eq([f.to, f.subject, f.filename], ['18552147522@efaxsend.com', 'Form 8821 for Michael Gasper · CDS-FAX-tok00001', 'GASPER_MICHAEL_IRS-8821.pdf'], 'addressed to eFax, reference in the subject');
eq(Array.from(base64ToBytes(f.pdf)), [37, 80, 68, 70, 1], 'the signed form attached');
ok(/sent to the IRS/.test(f.body) && /417-719-7870/.test(f.body) && !/—/.test(f.body + f.subject), 'cover note, no em dashes');
eq((await F.google({ kind: 'next' })).faxes.length, 0, 'not handed out twice');
await F.google({ kind: 'sent', id: f.id, gmailId: 'g-out-1' });
let list = await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' });
eq([list.out[0].status, list.out[0].stale, list.problems.length], ['sent', false, 0], 'sent, waiting for the receipt');
T += 121 * 60000;
list = await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' });
eq([list.out[0].stale, list.problems.length], [true, 1], 'no receipt after 2 hours: a problem on Today');

// ---------- the receipt ----------
eq((await F.google({ kind: 'result', token: 'CDS-FAX-nothing', ok: true })).matched, false, 'unknown reference: not matched');
r = await F.google({ kind: 'result', token: 'cds-fax-TOK00001', ok: true, text: 'Successful transmission to 18552147522', pdf: bytesToBase64(new Uint8Array([9, 9])), gmailId: 'g-rcpt-1' });
eq([r.matched, r.status], [true, 'delivered'], 'receipt matched by its reference');
list = await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' });
eq([list.out[0].status, list.out[0].receiptPath, list.problems.length], ['delivered', 'mg1/filings/fax-IRS-8821-' + f.id.slice(0, 8) + '-receipt.pdf', 0], 'delivered, receipt saved with the consumer\'s filings');
ok(files[list.out[0].receiptPath], 'the receipt file is stored');
await F.hub('zach@caringcds.com', { action: 'applied', id: f.id });
ok((await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' })).out[0].applied, 'marked as written to the Tax Setup step');

// ---------- a failure, matched by number ----------
r = await F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'IRS-8821' });
nx = await F.google({ kind: 'next' }); await F.google({ kind: 'sent', id: nx.faxes[0].id });
r = await F.google({ kind: 'result', to: '1 (855) 214-7522', ok: false, text: 'Unsuccessful transmission: busy' });
eq([r.matched, r.status], [true, 'failed'], 'no reference: matched by the fax number, failed');
list = await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' });
eq([list.problems.length, list.problems[0].resultText], [1, 'Unsuccessful transmission: busy'], 'a failed fax is a problem on Today');
const failedId = list.problems[0].id;
T += 1000;
const again = await F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'IRS-8821' });
ok(!!again.fax, 'after a failure it can be sent again');
eq((await F.hub('zach@caringcds.com', { action: 'list' })).problems.filter(p => p.id === failedId).length, 0, 'sent again: the failed one drops off Today by itself');
await F.hub('zach@caringcds.com', { action: 'cancel', id: again.fax.id });
eq((await F.hub('zach@caringcds.com', { action: 'list' })).problems.filter(p => p.id === failedId).length, 1, 'cancelled the resend: the failure is back');
await F.hub('zach@caringcds.com', { action: 'dismiss', id: failedId });
eq((await F.hub('zach@caringcds.com', { action: 'list' })).problems.filter(p => p.status === 'failed').length, 0, 'dismissed: off Today');
await F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'IRS-8821' });

// ---------- cancel, and a form missing from storage ----------
const q2 = (await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' })).out.find(o => o.status === 'queued');
await F.hub('zach@caringcds.com', { action: 'cancel', id: q2.id });
eq((await F.google({ kind: 'next' })).faxes.length, 0, 'cancelled: not sent');
await pg.query(`update public.agency_data set data_value = jsonb_set(data_value, '{0,ein}', '"12-3456789"') where data_key='consumers'`);
delete files['mg1/packet/GASPER_MICHAEL_MO-2643A.pdf'];
const q3 = await F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'MO-2643A' });
eq((await F.google({ kind: 'next' })).faxes.length, 0, 'form file missing: not sent');
list = await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' });
const m3 = list.out.find(o => o.id === q3.fax.id);
eq([m3.status, m3.problem], ['failed', true], 'and it says so (no silent failures)');
// Gmail refused it
files['mg1/packet/GASPER_MICHAEL_MO-2643A.pdf'] = new Uint8Array([1]);
const q4 = await F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'MO-2643A' });
await F.google({ kind: 'next' }); await F.google({ kind: 'sent', id: q4.fax.id, error: 'Service invoked too many times' });
eq((await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' })).out.find(o => o.id === q4.fax.id).resultText, 'Gmail could not send it from intake@caringcds.com: Service invoked too many times', 'Gmail refusal shown');
// Not picked up: is the script running?
const q5 = await F.hub('zach@caringcds.com', { action: 'queue', consumerId: 'mg1', formKey: 'MO-2643A' });
T += 11 * 60000;
ok((await F.hub('zach@caringcds.com', { action: 'list', consumerId: 'mg1' })).out.find(o => o.id === q5.fax.id).stale, 'not picked up in 10 minutes: shown as a problem');

// ---------- incoming ----------
r = await F.google({ kind: 'incoming', gmailId: 'g-in-1', from: '+1 573-751-5860', subject: 'eFax message from "5737515860" - 2 page(s)', pdf: bytesToBase64(new Uint8Array([5, 5])), receivedAt: '2026-10-26T16:00:00Z' });
ok(r.id, 'incoming fax kept');
eq((await F.google({ kind: 'incoming', gmailId: 'g-in-1', from: '5737515860' })).already, true, 'the same email twice: kept once');
list = await F.hub('krystal@mo-care.com', { action: 'list' });
eq(list.incoming.map(i => [i.status, i.from, i.filePath]), [['new', '(573) 751-5860', 'fax/incoming/' + r.id + '.pdf']], 'on Today for anyone signed in');
await F.hub('Zach@caringcds.com', { action: 'handled', id: r.id, note: 'Michael Gasper MO Tax ID letter, attached to his 2643A' });
list = await F.hub('krystal@mo-care.com', { action: 'list' });
eq([list.incoming[0].status, list.incoming[0].handledBy, list.incoming[0].note], ['handled', 'zach@caringcds.com', 'Michael Gasper MO Tax ID letter, attached to his 2643A'], 'handled: who and what');
T += 3 * 864e5;
await pg.query(`update public.cds_fax set handled_at = now() - interval '3 days' where id = $1`, [r.id]);
eq((await F.hub('krystal@mo-care.com', { action: 'list' })).incoming.length, 0, 'handled ones drop off after 2 days');

await refuses(() => F.google({ kind: 'queue' }), 'not allowed', 'the script cannot queue a fax');
await refuses(() => F.hub('zach@caringcds.com', { action: 'next' }), 'Unknown request.', 'the hub cannot take the script\'s actions');
ok(!/—/.test(readFileSync(ROOT + '/supabase/functions/_shared/office/fax.js', 'utf8')), 'no em dashes in the fax rules');
console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
