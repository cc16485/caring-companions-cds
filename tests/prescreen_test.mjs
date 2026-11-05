// The online pre-screen read (2026-11-05): found by phone or email only, the allowed fields only, read only, audited
// without answers. Made-up people and a stand-in GoHighLevel. node tests/prescreen_test.mjs
import '../supabase/functions/_shared/office/starting-rules.js';
import { pickContact, prescreenAnswers, createPrescreen } from '../supabase/functions/_shared/enroll/prescreen.js';
const S = globalThis.CDSStarting;
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL ' + m); } };
const K = {
  help: 'contact.does_the_person_needing_care_need_help_with_any_of_the_following_check_all_that_apply',
  self: 'contact.the_cds_program_requires_the_person_needing_care_to_be_able_to_direct_their_own_services__this_means_managing_their_caregivers_schedule_making_sure_they_clock_in_and_out_and_asking_for_the_help_they_need_is_the_person_needing_care_able_to_do_this',
  home: 'contact.does_this_person_live_at_home_not_in_a_nursing_facility_or_residential_care_community',
  dx: 'contact.please_provide_the_specific_diagnosis_or_medical_condition_that_causes_the_need_for_daily_assistance_for_example_stroke_heart_condition_arthritis_dementia',
};
const FIELDS = [
  { id: 'f1', fieldKey: K.help }, { id: 'f2', fieldKey: K.self }, { id: 'f3', fieldKey: K.home }, { id: 'f4', fieldKey: K.dx },
  { id: 'f5', fieldKey: 'contact.consumers_date_of_birth' }, { id: 'f6', fieldKey: 'contact.consumers_name' },
  { id: 'f7', fieldKey: 'contact.do_you_or_the_person_needing_care_have_active_missouri_medicaid' }, { id: 'f8', fieldKey: 'contact.consumers_medicaid_number' },
  { id: 'f9', fieldKey: 'contact.in_which_county_does_the_person_needing_care_live' }, { id: 'f10', fieldKey: 'contact.what_is_your_relationship_to_your_caregiver' },
  { id: 'x1', fieldKey: 'contact.new_consumer_or_provider_change' }, { id: 'x2', fieldKey: 'contact.social_security_number' },
  { id: 'x3', fieldKey: 'contact.internal_verification_outcomes' }, { id: 'x4', fieldKey: 'contact._copy_of_social_security_card' },
];
const LINDA = { id: 'g1', firstName: 'Linda', lastName: 'Example', phone: '+14175550188', email: 'linda@example.com',
  customFields: [
    { id: 'f1', value: ['Bathing', 'Dressing and grooming', 'Meal preparation', 'Companionship'] }, { id: 'f2', value: 'Yes' }, { id: 'f3', value: ['Yes'] },
    { id: 'f4', value: 'Stroke in 2025' }, { id: 'f5', value: '03/04/1944' }, { id: 'f6', value: 'Mae Example' }, { id: 'f7', value: 'Yes' },
    { id: 'f8', value: '12345678' }, { id: 'f9', value: ['Greene County'] }, { id: 'f10', value: 'Granddaughter' },
    { id: 'x1', value: 'New Consumer' }, { id: 'x2', value: '000-00-0000' }, { id: 'x3', value: 'Verified' }, { id: 'x4', value: { a: { url: 'https://x' } } },
  ] };

// The allowed list
ok(!S.PRESCREEN_KEYS.some(k => /new_consumer_or_provider_change|internal_verification|social_security|signature|upload|license/.test(k)), 'allowed list has no Workflow Trigger, SSN, ID or file fields');
const ans = prescreenAnswers(LINDA, FIELDS);
ok(ans.length === 10 && !ans.some(a => /new_consumer|social_security|internal_verification|_copy_of/.test(a.key)) && !JSON.stringify(ans).includes('000-00-0000'), 'only the pre-screen answers come back; never SSN or trigger fields');
ok(prescreenAnswers(LINDA, []).length === 0, 'no field list: nothing returned (never guessed by position)');

// Finding the contact
const RUTH = { id: 'g2', firstName: 'Mae', lastName: 'Example', phone: '4175550199' };
ok(pickContact([RUTH, LINDA], ['4175550188'], []).id === 'g1', 'found by phone');
ok(pickContact([RUTH, LINDA], [], ['linda@example.com']).id === 'g1', 'found by email');
ok(pickContact([RUTH], ['4175550188'], []) === null, 'same name, different phone: not a match');
ok(pickContact([LINDA, Object.assign({}, LINDA, { id: 'g3' })], ['4175550188'], []) === null, 'two contacts with the same phone: not a match');

// The mapping into the call
const m = S.mapPrescreen(ans, ['Greene', 'Christian']);
ok(m.set.help.join() === 'bathing,dressing,meals' && m.set.helpNote === 'companionship', 'help areas mapped; the rest kept in their words');
ok(m.set.selfDirect === 'yes' && m.set.living === 'home' && m.set.condition === 'Stroke in 2025', 'self-direction, lives at home, condition');
ok(m.set.dob === '1944-03-04' && m.set.first === 'Mae' && m.set.last === 'Example' && m.set.medicaid === 'yes' && m.set.dcn === '12345678', 'birth date, name, Medicaid, DCN');
ok(m.set.county === 'Greene' && m.set.attRel === 'grandchild', 'county and relationship');
ok(S.mapPrescreen([{ key: 'contact.in_which_county_does_the_person_needing_care_live', value: ['Jackson County'] }], ['Greene']).set.county === 'Other', 'a county outside ours: Another county');
ok(S.mapPrescreen([{ key: K.self, value: 'Maybe' }, { key: 'contact.consumers_date_of_birth', value: 'sometime in 1940' }], []).set.selfDirect === undefined, 'unclear answers fill nothing');
ok(S.mapPrescreen([{ key: 'contact.consumers_date_of_birth', value: 'sometime in 1940' }], []).set.dob === undefined && S.mapPrescreen([{ key: 'contact.consumers_date_of_birth', value: 'sometime in 1940' }], []).shown.length === 1, 'an unreadable birth date is shown, not filled');
ok(S.mapPrescreen([{ key: K.home, value: ['No'] }], []).set.living === 'facility', 'not at home: a facility (flagged on the call)');

// The server action: read only, audited without answers
const audits = [], writes = [];
const deps = { ghl: {
  find: async q => [RUTH, LINDA].filter(c => (c.phone || '').replace(/\D/g, '').endsWith(String(q).replace(/\D/g, '')) || c.email === q),
  contact: async id => [RUTH, LINDA].find(c => c.id === id), fields: async () => FIELDS,
  upsert: async () => writes.push('upsert'), update: async () => writes.push('update') } };
const P = createPrescreen({ audit: async (...a) => audits.push(a), fail: (m, s) => { const e = new Error(m); e.status = s; throw e; }, deps }).office;
let r = await P.prescreen({ staff: 'krystal@mo-care.com', person: { kind: 'lead', id: 'L1', phones: ['(417) 555-0188'], emails: [] } });
ok(r.found && r.contactId === 'g1' && r.answers.length === 10, 'staff read: found by phone');
ok(audits.length === 1 && audits[0][1] === 'prescreen_read' && audits[0][2] === 'lead:L1' && audits[0][3].answers === 10 && !JSON.stringify(audits).includes('12345678') && !JSON.stringify(audits).includes('Stroke'), 'audited without the answers');
ok(writes.length === 0, 'nothing written to GoHighLevel');
r = await P.prescreen({ staff: 'krystal@mo-care.com', person: { kind: 'call', phones: ['4175550100'], emails: [] } });
ok(!r.found && audits.length === 2, 'no contact: not found, audited');
r = await P.prescreen({ staff: 'krystal@mo-care.com', person: { kind: 'call', phones: [], emails: [] } });
ok(!r.found && audits.length === 2, 'no phone or email: nothing looked up');
let refused = false; try { await P.prescreen({ person: { phones: ['4175550188'] } }); } catch (e) { refused = e.status === 401; }
ok(refused, 'not signed in: refused');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
