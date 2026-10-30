// Contacts and linking (2026-10-29, her mockup 6CxaqzDSJABjRYnGxc6tZg): a family member or attendant who
// came in as a lead is linked to the person they called about, their number points there in the phone
// book, and unlinking puts it all back.
//   node tests/link_callers_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;
const { phoneBookRows, resolve } = await import(ROOT + '/supabase/functions/_shared/office/comms.js');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const NOW = '2026-10-29T15:00:00.000Z';
const fresh = () => ({
  consumers: [{ id: '100', name: 'Walter Briggs', phone: '(417) 555-0102', status: 'Active' }],
  pipeline: [
    { id: 'k1', name: 'Kim Tran', phone: '417-555-0177', type: 'lead', status: 'nurturing', followup: '2026-10-30', notes: [{ date: '2026-10-28', text: 'Asked about hours' }] },
    { id: 'w1', name: 'Wanda Briggs', phone: '417-555-0300', type: 'lead', status: 'new' },
    { id: 'x1', name: 'Old Lead', phone: '417-555-0400', type: 'lead', status: 'closed_ni' }
  ]
});

// ── link a lead to a consumer ──
{
  const d = fresh();
  const r = R.linkLead(d, 'k1', { kind: 'consumer', id: '100' }, { role: 'attendant', relation: 'Granddaughter', phone: '417-555-0177', by: 'krystal', now: NOW });
  ok(r.ok, 'links');
  const w = d.consumers[0], k = d.pipeline[0];
  ok(R.relatedPeople(w).length === 1, 'Walter has one contact');
  const c = R.relatedPeople(w)[0];
  ok(c.name === 'Kim Tran' && c.role === 'attendant' && c.relation === 'Granddaughter' && c.fromLead === 'k1' && c.prevStatus === 'nurturing' && c.by === 'krystal', 'the contact carries who, role, relation, lead');
  ok(k.status === 'closed_linked' && k.linkedTo.id === '100' && k.linkedTo.kind === 'consumer' && k.linkedTo.name === 'Walter Briggs', 'Kim\'s lead closes as linked');
  ok(k.followup === '' && /Linked to Walter Briggs as Granddaughter, attendant \(by krystal\)/.test(k.notes[k.notes.length - 1].text), 'call back cleared, note says so');
  ok(R.CLOSED.includes('closed_linked'), 'linked is a closed status everywhere');
  const card = R.leadCard(k, [], '2026-10-29');
  ok(card.step === 'closed' && card.due === 'Linked to Walter Briggs', 'the Leads row says who: ' + card.due);
  ok(R.linkLead(d, 'k1', { kind: 'consumer', id: '100' }, { role: 'family' }).error, 'cannot link twice');

  // unlink puts it back
  const u = R.unlinkContact(d, w, c.id, { by: 'zach', now: NOW });
  ok(u.ok && R.relatedPeople(w).length === 0, 'unlink takes them off');
  ok(k.status === 'nurturing' && !k.linkedTo && !k.closedAt, 'their lead opens again as it was');
  ok(/Unlinked from Walter Briggs \(by zach\)/.test(k.notes[k.notes.length - 1].text), 'unlink note');
}

// ── refusals ──
{
  const d = fresh();
  ok(/Pick who/.test(R.linkLead(d, 'k1', null, { role: 'family' }).error), 'no target');
  ok(/not the same/.test(R.linkLead(d, 'k1', { kind: 'lead', id: 'k1' }, { role: 'family' }).error), 'not to itself');
  ok(/not in the hub/.test(R.linkLead(d, 'k1', { kind: 'consumer', id: 'nope' }, { role: 'family' }).error), 'unknown consumer');
  ok(/closed/.test(R.linkLead(d, 'k1', { kind: 'lead', id: 'x1' }, { role: 'family' }).error), 'not to a closed lead');
  ok(/family, attendant/.test(R.linkLead(d, 'k1', { kind: 'consumer', id: '100' }, {}).error), 'role is needed');
  ok(d.pipeline[0].status === 'nurturing' && !d.consumers[0].relatedPeople, 'a refusal changes nothing');
}

// ── two leads become one; contacts come along ──
{
  const d = fresh();
  R.addContact(d.pipeline[0], { name: 'Ana', phone: '417-555-0901', role: 'family', relation: 'mother' }, { by: 'krystal' });
  ok(R.relatedPeople(d.pipeline[0]).length === 1, 'a contact typed by hand');
  ok(R.addContact(d.pipeline[0], { name: '', role: 'family' }).error, 'a hand contact needs a name');
  R.linkLead(d, 'k1', { kind: 'lead', id: 'w1' }, { role: 'family', by: 'krystal', now: NOW });
  const wanda = d.pipeline[1];
  ok(R.relatedPeople(wanda).map(x => x.name).join(',') === 'Kim Tran,Ana', 'Kim and her contact move onto Wanda\'s lead');
  ok(R.relatedPeople(d.pipeline[0]).length === 0, 'Kim\'s lead keeps no contacts');
}

// ── the phone book points linked callers at the consumer ──
{
  const d = fresh();
  R.linkLead(d, 'k1', { kind: 'consumer', id: '100' }, { role: 'attendant', relation: 'Granddaughter', now: NOW });
  const rows = phoneBookRows({ pipeline: d.pipeline, consumers: d.consumers });
  const kim = rows.filter(r => r.phone10 === '4175550177');
  ok(kim.length === 1 && kim[0].ref === 'family:consumer:100' && kim[0].kind === 'attendant', 'Kim\'s number points at Walter, as his attendant');
  ok(/^Granddaughter, attendant for Walter Briggs$/.test(kim[0].detail), 'detail: ' + kim[0].detail);
  ok(resolve(kim).state === 'known', 'one person, so no Who is this card');
  ok(!rows.some(r => r.ref === 'lead:k1'), 'the linked lead is gone from the phone book');

  // a contact on a lead points at the consumer once that lead is a consumer (same name)
  const d2 = fresh();
  R.addContact(d2.pipeline[1], { name: 'Joe', phone: '417-555-0999', role: 'family' });
  d2.consumers.push({ id: '200', name: 'Wanda Briggs', phone: '417-555-0300' });
  const j = phoneBookRows(d2).find(r => r.phone10 === '4175550999');
  ok(j && j.ref === 'family:consumer:200' && j.kind === 'family', 'a lead\'s contact follows them to Consumers');
  const before = phoneBookRows(fresh()).find(r => r.phone10 === '4175550177');
  ok(before && before.ref === 'lead:k1', 'before linking, Kim was her own lead');
}

// ── the son or daughter called first (her ask 10-29): the lead becomes the parent's ──
{
  const d = fresh();
  const k = d.pipeline[0];
  ok(/same name/.test(R.careFor(k, { name: 'kim tran' }).error), 'not the caller\'s own name');
  ok(/Add the name/.test(R.careFor(k, { name: ' ' }).error), 'a name is needed');
  const r = R.careFor(k, { name: 'Rosa Tran', phone: '', relation: 'daughter', role: 'family' }, { by: 'krystal', now: NOW });
  ok(r.ok && k.name === 'Rosa Tran' && k.phone === '', 'the lead is now the mother\'s, with no phone of hers yet');
  ok(k.followup === '2026-10-30' && k.status === 'nurturing' && k.notes[0].text === 'Asked about hours', 'everything else stays: call back date, step, notes');
  const c = R.relatedPeople(k)[0];
  ok(c.name === 'Kim Tran' && c.phone === '417-555-0177' && c.relation === 'daughter' && c.role === 'family' && c.caller, 'Kim is on Contacts with her number');
  ok(/Kim Tran \(daughter\) called for Rosa Tran/.test(k.notes[k.notes.length - 1].text), 'a note says what happened');
  ok(k.callerWas.name === 'Kim Tran', 'who the caller was is kept');
  ok(R.leadCard(k, [], '2026-10-29').who === 'Last note: "Asked about hours"', 'the Leads row shows the real call note, not the link note');
  const rows = phoneBookRows(d).filter(x => x.phone10 === '4175550177');
  ok(rows.length === 1 && rows[0].ref === 'family:lead:k1' && /daughter, family for Rosa Tran/.test(rows[0].detail), 'Kim\'s number points at Rosa\'s lead as family: ' + (rows[0] || {}).detail);
  ok(resolve(rows).state === 'known', 'one person, so no Who is this card');
}

// ── what a linked caller told us shows on the client ──
{
  const d = fresh();
  d.pipeline[0].notes.push({ date: '2026-10-27', text: 'Mom fell twice this month, needs help bathing', fromForm: false });
  R.linkLead(d, 'k1', { kind: 'consumer', id: '100' }, { role: 'family', relation: 'son', now: NOW });
  const ln = R.linkedNotes(d.consumers[0], d.pipeline);
  ok(ln.length === 2 && ln[0].date === '2026-10-27' && ln[0].from === 'Kim Tran (son)', 'Kim\'s notes show on Walter, oldest first');
  ok(!ln.some(n => /^Linked to /.test(n.text)), 'not the "Linked to" note itself');
}

// ── the page ──
{
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  ok(html.includes('id="linkLeadModal"') && html.includes('id="contactModal"'), 'the two windows are on the page');
  ok(/'closed_linked'\]/.test(html), 'the hub counts linked as closed');
  ok(html.includes("rpCardHtml('consumer', c)") && html.includes("rpCardHtml('lead', p)"), 'Contacts card on both profiles');
  ok(html.includes("openLinkLead(document.getElementById('cl_id').value)"), 'Close offers: they called for someone else');
  ok(html.includes('function lkChooseNew()') && html.includes('CDSRules.careFor(lead,'), 'the window can make this lead the parent\'s');
  ok(html.includes("CDSRules.linkedNotes(p, getData('pipeline'))") && html.includes("CDSRules.linkedNotes(c, getData('pipeline'))"), 'linked notes on the lead and consumer');
  ok(html.includes('consumers[consumers.length - 1].relatedPeople = CDSRules.relatedPeople(L)') && html.includes("x.linkedTo, { kind: 'consumer', id: id }"), 'Move to Consumers moves the contacts and repoints linked leads');
  ok(html.includes('data-names="') && html.includes('function chFilter('), 'Calls and texts names contacts and filters by person');
  ok(!/\u2014/.test(html.slice(html.indexOf('CONTACTS AND LINKING'), html.indexOf('function renderLeadProfile()'))), 'no em dashes in the new copy');
}

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
