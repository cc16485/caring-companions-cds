// CDS Caregiver Match, Phase 1: end-to-end test on a local Postgres copy.
// Runs the real Phase 1 SQL and the real server logic with practice plumbing.
//   PGLITE=/path/to/pglite/dist/index.js node tests/caregiver_match_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE);
const { createMatch } = await import(ROOT + '/supabase/functions/_shared/match/handlers.js');
const R = await import(ROOT + '/supabase/functions/_shared/match/rules.js');
const { practiceDeps } = await import(ROOT + '/caregiver-match/practice/deps.js');
const { seed, CAREGIVERS } = await import(ROOT + '/caregiver-match/practice/seed.js');
const { proofDoc } = await import(ROOT + '/caregiver-match/practice/portraits.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; } else { failN++; console.log('FAIL', m); } };
const throwsLike = async (fn, re, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };

const pg = new PGlite();
const db = { query: (s, p) => pg.query(s, p) };
const strip = s => s.replace(/notify pgrst[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
const phase1 = strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8'));
await pg.exec(phase1);
await pg.exec(phase1);
// Communication Center (2026-10-22) adds cds_tasks.area; Caregiver Match reads only area 'match'.
await pg.exec(strip(readFileSync(ROOT + '/comm_center.sql', 'utf8')));
ok(true, 'Phase 1 SQL runs twice');
// The attendant application tables (Caregiver Match lists leave out applicants with a consumer unless they chose to be listed).
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(strip(readFileSync(ROOT + '/attendant_packet.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/fcsr_waiver.sql', 'utf8')));

const match = createMatch(practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' }));
const H = (role, a, i) => match.handle(role, a, i);
const S = (a, i) => H('staff', a, { staff: 'linda@caringcds.com', ...i });
const t0 = Date.now();
const seeded = await seed(match, db);
console.log('seeded in', Date.now() - t0, 'ms');

// ---------- lockdown ----------
const grants = (await pg.query(`select count(*)::int n from information_schema.role_table_grants where table_schema='public' and table_name like 'cds_%' and grantee in ('anon','authenticated')`)).rows[0].n;
ok(grants === 0, 'no anon/authenticated grants on any cds_ table (got ' + grants + ')');
const rls = (await pg.query(`select count(*)::int n from pg_tables where schemaname='public' and tablename like 'cds_%' and not rowsecurity`)).rows[0].n;
ok(rls === 0, 'RLS on for every cds_ table');
await pg.exec('set role anon');
let anonRead = false; try { await pg.query('select * from cds_cg_profiles'); anonRead = true; } catch {}
await pg.exec('reset role');
ok(!anonRead, 'public key cannot read caregiver profiles');
await pg.exec('set role anon');
await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone, fcsr_registered_answer, office_reviewed_at, office_reviewed_by, ghl_contact_id) values ('x','Anon','Test','1','not_sure', now(), 'me', 'g1')`);
await pg.exec('reset role');
const anonRow = (await pg.query(`select * from attendant_pool where first_name='Anon'`)).rows[0];
ok(anonRow.fcsr_registered_answer === 'not_sure' && anonRow.office_reviewed_at === null && anonRow.office_reviewed_by === null && anonRow.ghl_contact_id === null,
  'public sign-up keeps the FCSR answer but cannot mark itself office-reviewed');

// ---------- listing rules ----------
const cgs = (await S('caregivers', {})).caregivers;
const byName = n => cgs.find(c => c.first_name === n);
ok(byName('Teresa').eligible && byName('Teresa').listing.state === 'complete', 'Teresa: all checks verified -> Screening complete');
ok(byName('Marisol').listing.state === 'not_listed' && byName('Marisol').listing.reason === 'Screening in progress' && !byName('Marisol').eligible, 'Marisol: screening pending -> hidden from families until complete');
ok(byName('Luis').listing.state === 'not_listed' && byName('Luis').listing.reason === 'Screening in progress', 'Luis: instructions sent -> hidden from families until complete');
ok(byName('Kayla').listing.state === 'not_listed' && /not approved/.test(byName('Kayla').listing.reason), 'Kayla: profile waiting for review -> not listed');
ok(byName('Denise').listing.state === 'not_listed' && !byName('Denise').reviewed, 'New sign-up (Denise) never appears automatically');
const ov = (await S('overview', {})).tiles;
ok(ov.eligible === 3 && ov.listed === 3, 'listed = fully verified caregivers only (3), her rule 2026-10-16');

// ---------- family sign-in ----------
const inv = seeded.familyLinks.dale;
const st = await H('family', 'startSignIn', { invite: inv });
ok(st.open && st.channels.length === 2 && !JSON.stringify(st).includes('4175550144'), 'sign-in shows masked contacts only');
await throwsLike(() => H('family', 'startSignIn', { invite: 'forged-token' }), /recognize/, 'a made-up invitation is refused');
const sc = await H('family', 'sendCode', { invite: inv, channel: 'sms' });
ok(sc.sent && /^\d{6}$/.test(sc.practice_code), 'code requested -> recorded in outbox (practice shows it)');
const outCode = (await S('outbox', {})).messages[0];
ok(outCode.template === 'fam_code' && outCode.automatic && outCode.status === 'practice' && outCode.to_display.includes('44'), 'code message recorded, automatic, to the contact on file');
await throwsLike(() => H('family', 'verifyCode', { invite: inv, code: '000000' }), /doesn.t match/, 'wrong code refused');
const sess = (await H('family', 'verifyCode', { invite: inv, code: sc.practice_code })).session;
ok(!!sess, 'right code -> session');
await throwsLike(() => H('family', 'verifyCode', { invite: inv, code: sc.practice_code }), /expired|new one/, 'a code works only once');

// ---------- browse ----------
const all = await H('family', 'browse', { session: sess, filters: {} });
ok(all.caregivers.length === 3, 'browse shows only the 3 screening-complete caregivers');
ok(all.caregivers.length === 3 && all.caregivers.every(c => c.section === 'complete'), 'families only see screening-complete caregivers');
const leak = JSON.stringify(all);
ok(!/Practice|example\.com|41755|ssn|staff_notes|fcsr|screen_/.test(leak), 'family view has no last names, contacts, or screening data');
const am = await H('family', 'browse', { session: sess, filters: { county: 'Christian', parts: ['am'] } });
ok(am.caregivers.map(c => c.first_name).sort().join() === 'Brenda,Teresa', 'filters: Christian County mornings -> Brenda, Teresa (got ' + am.caregivers.map(c => c.first_name) + ')');
ok(am.caregivers[0].match.reasons.includes('Works in Christian County'), 'match reasons are stated facts');
const sp = await H('family', 'browse', { session: sess, filters: { language: 'Spanish' } });
ok(sp.caregivers.length === 0, 'Spanish speakers still in screening stay hidden (got ' + sp.caregivers.map(c => c.first_name) + ')');
const vid = await H('family', 'browse', { session: sess, filters: { video: true } });
ok(vid.caregivers.every(c => c.has_video), 'video filter');
const prof = await H('family', 'profile', { session: sess, id: seeded.ids.teresa });
ok(prof.caregiver.about_me && prof.caregiver.certs_verified.includes('cpr') && prof.caregiver.video_url, 'profile shows approved content, verified certs, video');
await throwsLike(() => H('family', 'profile', { session: sess, id: seeded.ids.kayla }), /isn.t available/, 'unlisted caregiver profile refused');

// ---------- introduction ----------
await H('family', 'requestIntro', { session: sess, pool_id: seeded.ids.jordan, how: 'video', preferred_times: 'Saturdays' });
await throwsLike(() => H('family', 'requestIntro', { session: sess, pool_id: seeded.ids.jordan, how: 'home' }), /already asked/, 'no duplicate open requests');
let mine = (await H('family', 'myRequests', { session: sess })).requests;
ok(mine.length === 1 && mine[0].status_text === 'Sent', 'My requests shows Sent');
const introId = mine[0].id;
const tasks1 = (await S('tasks', {})).tasks;
ok(tasks1.some(t => t.kind === 'ask_caregiver' && t.intro_id === introId), 'office task created: ask the caregiver');
const ask = await S('askCaregiver', { intro_id: introId });
ok(ask.status === 'practice' && ask.practice_link, 'office asks caregiver (practice message recorded)');
mine = (await H('family', 'myRequests', { session: sess })).requests;
ok(mine[0].status_text === 'Caregiver is considering', 'family sees: Caregiver is considering');
const jLink = new URL(ask.practice_link.split('#')[0]).searchParams.get('c');
const jHome = await H('caregiver', 'home', { link: jLink });
ok(jHome.intros.some(i => i.id === introId && i.family === 'Dale and June'), 'caregiver sees the request with family first name and town only');
ok(!JSON.stringify(jHome.intros).includes('4175550144'), 'caregiver never sees the family phone');
await H('caregiver', 'respondIntro', { link: jLink, id: introId, answer: 'yes' });
await throwsLike(() => H('caregiver', 'respondIntro', { link: jLink, id: introId, answer: 'no' }), /already/, 'cannot answer twice');
mine = (await H('family', 'myRequests', { session: sess })).requests;
ok(mine[0].status_text === 'Caregiver would like to meet', 'family sees: Caregiver would like to meet');
await throwsLike(() => S('updateIntro', { intro_id: introId, status: 'scheduled' }), /date and time/, 'scheduling needs a date');
await throwsLike(() => S('updateIntro', { intro_id: introId, status: 'met' }), /doesn.t follow/, 'cannot skip to Met');
await S('updateIntro', { intro_id: introId, status: 'scheduled', meet_at: '2026-10-25T15:00:00Z', meet_details: 'Google Meet link (practice)' });
const md = await S('sendMeetDetails', { intro_id: introId });
ok(md.family === 'practice' && md.caregiver === 'practice', 'meet details recorded for both');
mine = (await H('family', 'myRequests', { session: sess })).requests;
ok(mine[0].status_text === 'Meeting set' && mine[0].meet_details, 'family sees the meeting');
const hired = JSON.stringify(await S('intros', {}));
ok(!/hired|reserved|assigned/i.test(hired), 'nothing says hired, reserved or assigned');

// ---------- saved caregivers and the family's needs ----------
let me = await H('family', 'me', { session: sess });
ok(!me.has_needs && me.saved_count === 0, 'new family: no needs yet, nothing saved');
await H('family', 'saveCaregiver', { session: sess, pool_id: seeded.ids.teresa, saved: true });
await H('family', 'saveCaregiver', { session: sess, pool_id: seeded.ids.brenda, saved: true });
const sv1 = await H('family', 'saveCaregiver', { session: sess, pool_id: seeded.ids.brenda, saved: true });
ok(sv1.saved_count === 2, 'saving twice doesn\'t duplicate');
await throwsLike(() => H('family', 'saveCaregiver', { session: sess, pool_id: seeded.ids.kayla, saved: true }), /isn.t available/, 'cannot save an unlisted caregiver');
const svList = await H('family', 'saved', { session: sess });
ok(svList.saved.length === 2 && svList.saved.every(x => x.saved && x.first_name && x.availability), 'saved list returns full profiles for comparing');
ok((await H('family', 'browse', { session: sess, filters: {} })).caregivers.find(c => c.id === seeded.ids.teresa).saved, 'browse marks saved caregivers');
ok((await H('family', 'profile', { session: sess, id: seeded.ids.teresa })).saved, 'profile knows it is saved');
const outboxBefore = (await S('outbox', {})).messages.length;
const tasksBefore = (await S('tasks', {})).tasks.length;
await H('family', 'saveCaregiver', { session: sess, pool_id: seeded.ids.jordan, saved: true });
ok((await S('outbox', {})).messages.length === outboxBefore && (await S('tasks', {})).tasks.length === tasksBefore, 'saving never messages anyone or creates office work');
ok(!JSON.stringify(await H('caregiver', 'home', { link: seeded.caregiverLinks.teresa })).includes('Dale'), 'caregivers never see who saved them');
await H('family', 'saveCaregiver', { session: sess, pool_id: seeded.ids.jordan, saved: false });
ok((await H('family', 'me', { session: sess })).saved_count === 2, 'unsave works');
// needs
await H('family', 'setNeeds', { session: sess, needs: { county: 'Christian', days: ['mon', 'wed', 'fri'], parts: ['am'], hours: 20, help: ['memory_care', 'personal_care'], drives: true, junk: 'x' } });
me = await H('family', 'me', { session: sess });
ok(me.has_needs && me.needs.county === 'Christian' && me.needs.hours === 20 && !('junk' in me.needs), 'needs saved and cleaned');
const fit = await H('family', 'browse', { session: sess, filters: {}, useNeeds: true });
ok(fit.using_needs && fit.caregivers.every(c => c.counties.includes('Christian')), 'matches for your needs: only caregivers who work in the family\'s county');
const brendaFit = fit.caregivers.find(c => c.first_name === 'Brenda');
ok(brendaFit && brendaFit.match.reasons.some(r => /memory loss/.test(r)) && brendaFit.match.total === 6, 'fit explains each need (6 needs counted)');
await H('family', 'setNeeds', { session: sess, needs: { county: 'Christian', days: ['sat'], parts: ['am'], hours: 20, help: ['memory_care', 'personal_care'], drives: true } });
const satFit = await H('family', 'browse', { session: sess, filters: {}, useNeeds: true });
const brendaSat = satFit.caregivers.find(c => c.first_name === 'Brenda');
ok(brendaSat && brendaSat.match.gaps.some(g => /Not listed for/.test(g)), 'gaps are shown as worth-asking-about, not hidden');
ok(satFit.caregivers.length === fit.caregivers.length && fit.caregivers.length === 2, 'needs mode never hides caregivers in the county just for a partial fit');
await H('family', 'setNeeds', { session: sess, needs: { county: 'Christian', days: ['mon', 'wed', 'fri'], parts: ['am'], hours: 20, help: ['memory_care', 'personal_care'], drives: true } });
const elg = await S('eligibility', { prospect_id: (await (async () => (await S('prospects', {})).prospects.find(p => p.first_name === 'Dale and June'))()).id });
ok(elg.saved_caregivers.length === 2 && elg.family_needs.county === 'Christian', 'office sees the family\'s saved caregivers and needs');

// ---------- screening rules ----------
const kayla = seeded.ids.kayla;
await throwsLike(() => S('recordScreening', { id: kayla, step: 'screen_pending', method: 'phone' }), /Verify the registration first/, 'cannot request screening before registration is verified');
await throwsLike(() => S('recordScreening', { id: kayla, step: 'reg_verified' }), /proof/, 'registration verified needs proof');
await S('recordScreening', { id: kayla, step: 'reg_verified', proof: proofDoc('lookup') });
await S('recordScreening', { id: kayla, step: 'screen_pending', method: 'online' });
ok((await pg.query('select count(*)::int n from cds_screening_secret where pool_id=$1', [kayla])).rows[0].n === 1, 'encrypted SSN held while screening is pending');
const secret = (await pg.query('select ssn_ciphertext from cds_screening_secret where pool_id=$1', [kayla])).rows[0].ssn_ciphertext;
ok(!/9000/.test(secret) && secret.includes('.'), 'SSN is stored encrypted, not readable');
let kdet = await S('caregiver', { id: kayla });
ok(kdet.screening.request_form && kdet.screening.request_form.first === 'Kayla' && kdet.screening.request_form.dob && /Troutman Enterprises/.test(kdet.screening.request_form.employer), 'office sees the FCSR request fields ready to copy');
ok(!JSON.stringify(kdet).match(/\d{3}-\d{2}-\d{4}/), 'the full SSN is not in the normal office view');
const rv = await S('revealSsn', { id: kayla });
ok(/^9\d{2}-\d{2}-\d{4}$/.test(rv.ssn), 'staff can reveal the full SSN for the FCSR request');
ok((await pg.query(`select count(*)::int n from cds_audit where action='ssn_viewed_for_fcsr' and target=$1`, ['pool:' + kayla])).rows[0].n === 1, 'every SSN view is recorded');
await S('recordScreening', { id: kayla, step: 'screen_complete', result: 'no_findings', proof: proofDoc('result') });
await throwsLike(() => S('revealSsn', { id: kayla }), /deleted once the FCSR result/, 'after the result, the full SSN is gone and can\'t be revealed');
ok((await pg.query('select count(*)::int n from cds_screening_secret where pool_id=$1', [kayla])).rows[0].n === 0, 'full SSN deleted once the result is recorded');
let kd = await S('caregiver', { id: kayla });
ok(!kd.screening.eligible && kd.screening.missing.length === 6, 'registered + screened is still not eligible without the other checks');
await throwsLike(() => S('recordCheck', { id: kayla, check_key: 'oig', result: 'clear' }), /proof/, 'a check needs proof');
for (const k of ['edl', 'edr', 'oig', 'mo_medicaid', 'id_match']) await S('recordCheck', { id: kayla, check_key: k, result: 'clear', proof: proofDoc(k) });
await S('recordCheck', { id: kayla, check_key: 'age18', result: 'clear' });
kd = await S('caregiver', { id: kayla });
ok(kd.screening.eligible && kd.screening.steps[7].done, 'every check verified -> Eligible to begin CDS services');
ok(kd.listing.state === 'not_listed', 'eligible but profile not approved -> still not listed');
await S('reviewProfile', { id: kayla, decision: 'approve', verified_certs: [] });
kd = await S('caregiver', { id: kayla });
ok(kd.listing.state === 'complete', 'approved -> Screening complete section');
await S('recordCheck', { id: kayla, check_key: 'oig', result: 'not_clear', note: 'possible match' });
kd = await S('caregiver', { id: kayla });
ok(!kd.screening.eligible && kd.listing.state === 'not_listed', 'a newer not-clear check removes eligibility and the listing');
ok((await S('tasks', {})).tasks.some(t => t.kind === 'owner_review' && t.pool_id === kayla), 'owner review task created');
// findings hide the caregiver
const marisol = seeded.ids.marisol;
await S('recordScreening', { id: marisol, step: 'screen_complete', result: 'findings', proof: proofDoc('findings') });
const after = await H('family', 'browse', { session: sess, filters: {} });
ok(!after.caregivers.some(c => c.first_name === 'Marisol'), 'FCSR findings remove the caregiver from the directory');

// ---------- caregiver controls ----------
const tLink = seeded.caregiverLinks.teresa;
await H('caregiver', 'saveAvailability', { link: tLink, availability: { sat: ['am'] }, hours_min: 5, hours_max: 10 });
const t2 = await H('family', 'profile', { session: sess, id: seeded.ids.teresa });
ok(t2.caregiver.availability_text.startsWith('Sat') && t2.caregiver.confirmed_text === 'today', 'availability change shows to families right away');
await H('caregiver', 'saveProfile', { link: tLink, draft: { about_me: 'Changed text' } });
const t3 = await H('family', 'profile', { session: sess, id: seeded.ids.teresa });
ok(t3.caregiver.about_me !== 'Changed text', 'profile text changes wait for office approval');
// direct video upload: start gives an address, finish refuses until the file is there
await throwsLike(() => H('caregiver', 'startVideoUpload', { link: tLink, mime: 'video/mp4', size: 51 * 1024 * 1024 }), /limit is 50 MB/, 'video over 50 MB refused before upload');
await throwsLike(() => H('caregiver', 'startVideoUpload', { link: tLink, mime: 'image/png', size: 1000 }), /choose a video/, 'non-video refused');
const vu = await H('caregiver', 'startVideoUpload', { link: tLink, mime: 'video/mp4', size: 5000 });
ok(vu.media_id && vu.upload_url.startsWith('practice-upload:'), 'start returns a one-time upload address');
await throwsLike(() => H('caregiver', 'finishVideoUpload', { link: tLink, media_id: vu.media_id }), /didn't finish/, 'finish refused before the file arrives');
await throwsLike(() => H('caregiver', 'finishVideoUpload', { link: seeded.caregiverLinks.jordan, media_id: vu.media_id }), /could not be found/, 'another caregiver cannot claim the video');
await db.query('update cds_media set practice_data=$2 where id=$1', [vu.media_id, 'data:video/mp4;base64,AAAA']);
await H('caregiver', 'finishVideoUpload', { link: tLink, media_id: vu.media_id });
ok((await db.query('select video_draft from cds_cg_profiles where pool_id=$1', [seeded.ids.teresa])).rows[0].video_draft === vu.media_id, 'finished video waits as a draft for review');
await H('caregiver', 'withdrawConsent', { link: tLink, kind: 'video' });
const t4 = await H('family', 'profile', { session: sess, id: seeded.ids.teresa });
ok(!t4.caregiver.video_url, 'withdrawing video consent takes the video down');
await H('caregiver', 'setPaused', { link: tLink, paused: true });
ok(!(await H('family', 'browse', { session: sess, filters: {} })).caregivers.some(c => c.first_name === 'Teresa'), 'paused caregiver hidden');
await H('caregiver', 'setPaused', { link: tLink, paused: false });
await H('caregiver', 'withdrawListing', { link: tLink });
ok(!(await H('family', 'browse', { session: sess, filters: {} })).caregivers.some(c => c.first_name === 'Teresa'), 'withdrawn caregiver gone');
await throwsLike(() => H('caregiver', 'submitAuthorization', { link: tLink, legal_first: 'A', legal_last: 'B', dob: '1990-01-01', ssn: '123-45-6789', agree: true }), /starts with 9/, 'practice mode refuses a real-looking SSN');

// ---------- access ----------
const ruthP = seeded.families.ruth;
await S('revokeAccess', { prospect_id: ruthP });
const ruthInv = seeded.familyLinks.ruth;
const rs = await H('family', 'startSignIn', { invite: ruthInv });
ok(rs.open === false, 'revoked invitation shows "ended"');
const pros = (await S('prospects', {})).prospects;
ok(pros.find(p => p.first_name === 'Ann').access.expires_at === null, 'active consumer gets ongoing access');
const dale = pros.find(p => p.first_name === 'Dale and June');
ok(dale.access.days_left >= 44 && dale.access.days_left <= 45, 'prospect access is 45 days');
await S('extendAccess', { prospect_id: dale.id, days: 30 });
const dale2 = (await S('prospects', {})).prospects.find(p => p.id === dale.id);
ok(dale2.access.days_left >= 74, 'office can extend');
ok(pros.find(p => p.first_name === 'Walter').stage === 'new_request', 'Request access form creates a New directory request');
ok((await S('tasks', {})).tasks.some(t => t.kind === 'call_inquiry' && t.family === 'Walter' && /permission to check Medicaid/.test(t.title)), 'and a task to call and ask permission to check Medicaid');

// ---------- public request form ----------
await throwsLike(() => H('public', 'requestAccess', { first_name: 'Zed', phone: '4175550190' }), /town/, 'step 1 needs a town');
await throwsLike(() => H('public', 'requestAccess', { first_name: 'Zed', phone: '555', town: 'Ava' }), /area code/, 'step 1 needs a real phone');
const rq = await H('public', 'requestAccess', { first_name: 'Zed', phone: '4175550190', town: 'Ava', program: 'not_sure' });
ok(!!rq.followup, 'step 1 alone is enough to send a request');
await H('public', 'requestAccessMore', { followup: rq.followup, email: 'zed@example.com', relationship: 'parent', county: 'Douglas' });
const zed = (await S('prospects', {})).prospects.find(p => p.first_name === 'Zed');
ok(zed.county === 'Douglas' && zed.needs.relationship === 'parent' && zed.needs.program === 'not_sure', 'step 2 adds the optional details');
await throwsLike(() => H('public', 'requestAccessMore', { followup: rq.followup, email: 'x@example.com' }), /expired/, 'step 2 token works once');
await H('public', 'requestAccess', { first_name: 'Zed', phone: '(417) 555-0190', town: 'Ava' });
ok((await S('prospects', {})).prospects.filter(p => p.first_name === 'Zed').length === 1, 'asking again with the same phone updates the same family, no duplicate');
ok((await S('tasks', {})).tasks.some(t => t.family === 'Zed' && /asked again/.test(t.title)), 'a repeat request gives the office a call-back task');
const harold = (await S('prospects', {})).prospects.find(p => p.first_name === 'Harold');
ok(harold.needs.program === 'ihs', 'IHS answer saved for the office');
await H('public', 'requestAccess', { first_name: 'Iris', phone: '4175550191', town: 'Nixa', program: 'ihs' });
ok((await S('tasks', {})).tasks.some(t => t.family === 'Iris' && /present every provider choice/.test(t.title)), 'IHS request reminds the office to present provider choice');
const before = (await H('public', 'counts', {})).counts;
await H('caregiver', 'setPaused', { link: seeded.caregiverLinks.brenda, paused: true });
const afterPause = (await H('public', 'counts', {})).counts;
ok((before.Christian || 0) - (afterPause.Christian || 0) === 1, 'county counts drop when a screened caregiver pauses introductions');
ok(!Object.keys(afterPause).some(k => k === 'Lawrence'), 'in-progress caregivers never count (Marisol, Lawrence)');
await H('caregiver', 'setPaused', { link: seeded.caregiverLinks.brenda, paused: false });
await pg.query(`update cds_cg_profiles set availability_confirmed_at = now() - interval '50 days' where pool_id=$1`, [seeded.ids.brenda]);
const stale = (await H('public', 'counts', {})).counts;
ok((before.Christian || 0) - (stale.Christian || 0) === 1, 'availability not confirmed in 45 days drops out of the public count');
await pg.query(`update cds_cg_profiles set availability_confirmed_at = now() where pool_id=$1`, [seeded.ids.brenda]);

// ---------- Medicaid eligibility and the directory-access gate ----------
const P = async name => (await S('prospects', {})).prospects.find(p => p.first_name === name);
const walter = await P('Walter');
ok(walter.access_status === 'pending' && !walter.gate.ok, 'new request: access pending, invitation blocked');
await throwsLike(() => S('invite', { prospect_id: walter.id }), /can.t be sent yet.*not approved/, 'cannot invite before approval');
await throwsLike(() => S('recordMedicaidCheck', { prospect_id: walter.id, method: 'emomed_web', coverage: 'active' }), /permission/, 'cannot check Medicaid before permission is recorded');
await throwsLike(() => S('approveAccess', { prospect_id: walter.id, path: 'potential_cds', note: 'x' }), /active Medicaid check from the last 30 days/, 'potential path needs an active Medicaid check');
await S('recordConsent', { prospect_id: walter.id, from: 'consumer', how: 'Verbally on the phone' });
ok((await P('Walter')).stage === 'medicaid_needed', 'permission given -> Medicaid verification needed');
await throwsLike(() => S('recordMedicaidCheck', { prospect_id: walter.id, method: 'emomed_web', coverage: 'active', note: 'DCN 123456789' }), /ID numbers/, 'Medicaid ID numbers are refused in notes');
await S('recordMedicaidCheck', { prospect_id: walter.id, method: 'emomed_web', coverage: 'active' });
let wr = await P('Walter');
ok(wr.stage === 'cds_review_pending' && wr.statuses.medicaid_verified && !wr.statuses.cds_eligibility_confirmed && !wr.statuses.directory_access_approved && !wr.statuses.services_authorized,
  'active Medicaid is verified but is NOT CDS eligibility, access, or service authorization');
await throwsLike(() => S('approveAccess', { prospect_id: walter.id, path: 'potential_cds' }), /review note/, 'potential path needs an office review note');
await throwsLike(() => S('approveAccess', { prospect_id: walter.id, path: 'cds_consumer' }), /isn.t confirmed/, 'CDS consumer path needs DSDS confirmation');
await S('markPotential', { prospect_id: walter.id, note: 'Exploring' });
await S('approveAccess', { prospect_id: walter.id, path: 'potential_cds', note: 'Office reviewed' });
wr = await P('Walter');
ok(wr.stage === 'access_approved' && wr.gate.ok && !wr.statuses.cds_eligibility_confirmed, 'approved as potential CDS consumer: can invite, CDS eligibility still separate');
await throwsLike(() => S('setStage', { prospect_id: walter.id, stage: 'ready_to_begin' }), /service authorization/, 'directory access is not service approval');
await throwsLike(() => S('authorizeServices', { prospect_id: walter.id, date: '2026-11-01' }), /DSDS must confirm/, 'services can\'t be authorized without DSDS CDS eligibility');
// stale Medicaid check blocks the invite and the referral
await pg.query(`update cds_medicaid_checks set checked_on = (now() - interval '40 days')::date where prospect_id=$1`, [walter.id]);
wr = await P('Walter');
ok(wr.gate.ok && wr.access_status === 'approved' && !wr.recheck_due && /move toward a CDS referral/.test(wr.next_verification.label),
  'EXPIRED CHECK after approval: access and invitation stay open, no recheck nag while browsing');
await throwsLike(() => S('setStage', { prospect_id: walter.id, stage: 'transition_requested' }), /Recheck Medicaid/, 'CDS referral needs a current Medicaid check');
// IHS legal hold
const har = await P('Harold');
ok(har.access_status === 'approved' && !har.gate.ok && /legal review/.test(har.gate.why), 'IHS prospect: approved but invitation held for legal review');
await throwsLike(() => S('invite', { prospect_id: har.id }), /legal review/, 'IHS invitation refused while the legal hold is on');
// inactive Medicaid -> hold with follow-up, history kept
const glo = await P('Gloria');
ok(glo.stage === 'on_hold' && glo.access_status === 'on_hold' && /inactive/.test(glo.hold_reason), 'inactive Medicaid puts the request on hold with the reason');
ok((await S('tasks', {})).tasks.some(t => t.family === 'Gloria' && t.kind === 'needs_attention' && /inactive/.test(t.title) && /Next:/.test(t.title)), 'INACTIVE: Needs attention item with explanation and next action');
ok(!!glo.next_owner && !!glo.next_action && !!glo.next_due, 'INACTIVE: owner, next action and due date set');
const gloEl = await S('eligibility', { prospect_id: glo.id });
ok(gloEl.events.length >= 3 && gloEl.checks.length === 1, 'history is kept (events and checks)');
// streamlined existing consumer
const ann = await P('Ann');
ok(ann.access_status === 'approved' && ann.statuses.cds_eligibility_confirmed && !ann.medicaid, 'existing CDS consumer approved without a duplicate eMOMED check');
// not eligible ends access but keeps the record
await S('markNotEligible', { prospect_id: glo.id, reason: 'Not on Medicaid; talked about private pay options' });
ok((await P('Gloria')).stage === 'not_eligible', 'not eligible: record kept, stage recorded');
// privacy: nothing about eligibility reaches families or caregivers
const famJson = JSON.stringify(await H('family', 'me', { session: sess })) + JSON.stringify(await H('family', 'browse', { session: sess, filters: {} }));
ok(!/medicaid|dsds|eligib|emomed/i.test(famJson), 'families never see eligibility data');
const cgJson = JSON.stringify(await H('caregiver', 'home', { link: seeded.caregiverLinks.teresa }));
ok(!/medicaid|dsds|emomed/i.test(cgJson), 'caregivers never see eligibility data');
const eg = (await pg.query(`select count(*)::int n from information_schema.role_table_grants where table_name in ('cds_eligibility','cds_medicaid_checks','cds_prospect_events') and grantee in ('anon','authenticated')`)).rows[0].n;
ok(eg === 0, 'eligibility tables have no public or signed-in grants');

// ---------- service month, expiry, inactive and authorization holds (her rules 2026-10-15) ----------
const ymNow = (await pg.query(`select to_char(now(),'YYYY-MM-DD') d, to_char(now() + interval '1 month','YYYY-MM-15') nextm, to_char(date_trunc('month', now()) - interval '1 day','YYYY-MM-DD') prevlast`)).rows[0];
const elig = async name => S('eligibility', { prospect_id: (await P(name)).id });
// Walter: fresh check this month lets him move toward enrollment.
await S('recordMedicaidCheck', { prospect_id: walter.id, method: 'emomed_web', coverage: 'active' });
await S('setStage', { prospect_id: walter.id, stage: 'transition_requested', note: 'Wants CDS with Brenda' });
ok((await P('Walter')).stage === 'transition_requested', 'fresh same-month check: can move to CDS referral');
let we = await elig('Walter');
ok(/set an expected start date/.test(we.next_verification.label), 'enrollment without a start date: asks for the service month');
// MONTH CHANGE: start this month -> today's check counts; move start to next month -> new check required
await S('setExpectedStart', { prospect_id: walter.id, date: ymNow.d });
we = await elig('Walter');
ok(/^Done for the/.test(we.next_verification.label) && we.readiness.items.find(i => i.key === 'medicaid').ok, 'service month = this month: this month\'s check satisfies it');
const moved = await S('setExpectedStart', { prospect_id: walter.id, date: ymNow.nextm });
we = await elig('Walter');
ok(moved.new_month_check_needed && !we.readiness.items.find(i => i.key === 'medicaid').ok && /^In /.test(we.next_verification.label) && !we.next_verification.due,
  'MONTH CHANGE: start moved to next month -> a new check is required in that month (not due yet)');
ok(we.events.some(ev => /New month/.test(ev.note || '')), 'month change is written to the history');
// "Even if the previous check was less than 30 days ago": a check from the last day of last month doesn't count for this month's start.
await pg.query(`delete from cds_medicaid_checks where prospect_id=$1`, [walter.id]);
await pg.query(`insert into cds_medicaid_checks (prospect_id, checked_on, method, coverage, checked_by) values ($1,$2,'emomed_web','active','linda@caringcds.com')`, [walter.id, ymNow.prevlast]);
await S('setExpectedStart', { prospect_id: walter.id, date: ymNow.d });
we = await elig('Walter');
ok(!we.readiness.items.find(i => i.key === 'medicaid').ok && we.next_verification.due, 'check from last month (under 30 days) does NOT cover a service start this month; flagged due');
ok((await P('Walter')).recheck_due, 'and the board flags Medicaid recheck due');
// AUTHORIZATION HOLDS
await throwsLike(() => S('setStage', { prospect_id: walter.id, stage: 'ready_to_begin' }), /service authorization/, 'HOLD: no DSDS service authorization');
await throwsLike(() => S('authorizeServices', { prospect_id: walter.id, date: ymNow.d }), /DSDS must confirm/, 'HOLD: authorization needs DSDS CDS eligibility first');
await S('setDsds', { prospect_id: walter.id, dsds_cds: 'confirmed', dsds_cds_on: ymNow.d });
await S('authorizeServices', { prospect_id: walter.id, date: ymNow.d });
await throwsLike(() => S('setStage', { prospect_id: walter.id, stage: 'ready_to_begin' }), /Medicaid active, checked in.*Attendant chosen/, 'HOLD: lists the service-month Medicaid check and attendant still needed');
await S('setChosenCaregiver', { prospect_id: walter.id, pool_id: seeded.ids.luis });
await throwsLike(() => S('markOnboardingDone', { prospect_id: walter.id }), /isn.t fully screened/, 'HOLD: attendant who is not fully screened can\'t complete onboarding');
await S('setChosenCaregiver', { prospect_id: walter.id, pool_id: seeded.ids.brenda });
await S('markOnboardingDone', { prospect_id: walter.id });
await throwsLike(() => S('setStage', { prospect_id: walter.id, stage: 'ready_to_begin' }), /Medicaid active, checked in/, 'HOLD: still blocked only by the service-month Medicaid check');
await S('recordMedicaidCheck', { prospect_id: walter.id, method: 'emomed_web', coverage: 'active' });
await S('setStage', { prospect_id: walter.id, stage: 'ready_to_begin', note: 'All set' });
we = await elig('Walter');
ok(we.prospect.stage === 'ready_to_begin' && we.readiness.ok && we.statuses.services_authorized && we.statuses.cds_eligibility_confirmed, 'all six readiness items met -> Ready to begin services');
await S('setChosenCaregiver', { prospect_id: walter.id, pool_id: seeded.ids.teresa });
ok(!(await elig('Walter')).readiness.items.find(i => i.key === 'onboarding').ok, 'changing the attendant resets onboarding');
// INACTIVE after approval: access stays, needs attention, services blocked
const dale2p = await P('Dale and June');
await S('recordMedicaidCheck', { prospect_id: dale2p.id, method: 'emomed_phone', coverage: 'inactive', note: 'Ended this month' });
const dale3 = await P('Dale and June');
ok(dale3.access_status === 'approved' && dale3.gate.ok, 'INACTIVE after approval: directory access is not revoked');
ok((await S('tasks', {})).tasks.some(t => t.prospect_id === dale3.id && t.kind === 'needs_attention' && /services can.t begin/.test(t.title)), 'INACTIVE after approval: needs attention item explains services can\'t begin');
// RESTRICTED coverage: needs attention without a hold
const ruthP2 = await P('Ruth');
await S('recordMedicaidCheck', { prospect_id: ruthP2.id, method: 'emomed_web', coverage: 'active', restrictions: 'Spend-down' });
ok((await S('tasks', {})).tasks.some(t => t.prospect_id === ruthP2.id && t.kind === 'needs_attention' && /restriction/.test(t.title)), 'RESTRICTED: needs attention item created');
ok((await P('Ruth')).access_status !== 'on_hold', 'RESTRICTED: not put on hold');
// last verification date and who are shown
const brd = await P('Ruth');
ok(brd.medicaid.checked_by && brd.medicaid.checked_on && brd.next_verification.label, 'board shows last check date, who checked, and the next required check');

// ---------- messages ----------
const ob = (await S('outbox', {})).messages;
ok(ob.every(m => m.status === 'practice'), 'practice mode: every message recorded as practice, none sent');
ok(ob.every(m => !/—/.test(m.body)), 'no em dashes in any message');
const steps = ob.find(m => m.template === 'cg_fcsr_steps');
ok(steps && steps.body.includes('$16.57') && steps.body.includes('Troutman Enterprises, LLC') && steps.body.includes('Personal Care, In-Home Services') && !/to confirm/.test(steps.body), 'FCSR message is complete: fee, employer and registration type, no placeholders');

// live mode with messages off -> held, never sent
const liveDeps = { ...practiceDeps(db, { familyBase: 'https://x.test/d/', caregiverBase: 'https://x.test/c/' }), mode: 'live', send: async () => { throw new Error('must not send'); } };
const live = createMatch(liveDeps);
await throwsLike(() => live.handle('staff', 'invite', { staff: 'linda@caringcds.com', prospect_id: dale.id }), /staff list/, 'live: a Hub sign-in not on the staff list is refused');
await throwsLike(() => live.handle('staff', 'revealSsn', { staff: 'stranger@example.com', id: seeded.ids.teresa }), /staff list/, 'live: SSN reveal refused for anyone not on the staff list');
const staffList = (await db.query(`select value from cds_match_settings where key='staff_emails'`)).rows[0].value;
ok(Array.isArray(staffList) && staffList.includes('samantha@caringcds.com'), 'staff list starts with Samantha only');
await db.query(`update cds_match_settings set value = value || '["Linda@CaringCDS.com"]'::jsonb where key='staff_emails'`);
const r = await live.handle('staff', 'invite', { staff: 'linda@caringcds.com', prospect_id: dale.id });
ok(r.status === 'held' && /switched off/.test(r.error), 'live mode with messages off: held, with a visible reason');
// test phones: real send while messages are off, everyone else still held
const sentTo = [];
const live2 = createMatch({ ...liveDeps, send: async m => { sentTo.push(m.to); } });
const annPhone = (await db.query(`select g.phone from cds_prospects p join practice_ghl_contacts g on g.id = p.ghl_contact_id where p.first_name='Ann'`)).rows[0].phone;
await db.query(`insert into cds_match_settings (key, value) values ('test_recipients', $1::jsonb) on conflict (key) do update set value=excluded.value`, [JSON.stringify({ phones: [annPhone], emails: [] })]);
const tc = await live2.handle('family', 'sendCode', { invite: seeded.familyLinks.ann, channel: 'sms' });
ok(tc.sent !== false && sentTo.length === 1, 'messages off: a listed test phone still gets a real text');
const r2 = await live2.handle('staff', 'invite', { staff: 'linda@caringcds.com', prospect_id: dale.id });
ok(r2.status === 'held' && sentTo.length === 1, 'messages off: anyone not on the test list is still held');
await db.query(`delete from cds_match_settings where key='test_recipients'`);
const lc = await live.handle('family', 'sendCode', { invite: seeded.familyLinks.ann, channel: 'sms' });
ok(lc.sent === false && /call us/.test(lc.message), 'a held code tells the family to call, not silence');

// ---------- caregiver sign-up + office alert (2026-10-16) ----------
ok(R.COUNTIES.length === 27 && R.COUNTIES.includes('Phelps') && R.COUNTIES.includes('Vernon') && !R.COUNTIES.includes('Howell') && !R.COUNTIES.includes('Miller'), 'the 27 counties match caringcds.com/service-area');
const signupSql = strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8'));
await pg.exec(signupSql);
await pg.exec(signupSql);
ok(true, 'sign-up alert SQL runs twice');
const alertCfg = (await db.query(`select value from cds_match_settings where key='office_alerts'`)).rows[0].value;
ok(alertCfg.live === false && alertCfg.emails.length === 4 && alertCfg.emails.includes('zach@mo-care.com'), 'office alerts: 4 addresses, switched off to start');
const joinIn = { first_name: 'Jane', last_name: 'Tester', phone: '417-555-0100', city: 'Ozark', counties: ['Christian', 'Greene', 'Nowhere'],
  availability: ['Weekday mornings'], hours_wanted: 'Part time, around 10 to 25 hours a week', experience: 'I have cared for a family member',
  has_potential_consumer: 'Yes', consumer_name: 'Mom Tester', consumer_relationship: 'Parent', consumer_has_medicaid: 'Yes, active Medicaid',
  fcsr_registered_answer: 'no', background_ok: true };
await throwsLike(() => H('public', 'joinList', { ...joinIn, background_ok: false }), /screening box/, 'sign-up needs the screening box');
await throwsLike(() => H('public', 'joinList', { ...joinIn, counties: ['Nowhere'] }), /county/, 'sign-up needs a real county');
await throwsLike(() => H('public', 'joinList', { ...joinIn, phone: '555' }), /10-digit/, 'sign-up needs a full phone');
const j1 = await H('public', 'joinList', joinIn);
const jRow = (await db.query(`select * from attendant_pool where phone='(417) 555-0100'`)).rows;
ok(j1.ok && jRow.length === 1 && jRow[0].source === 'findcdscaregivers.com' && jRow[0].status === 'new', 'sign-up saved to the caregiver list');
ok(JSON.stringify(jRow[0].counties) === '["Christian","Greene"]', 'unknown counties dropped');
const jTask = (await db.query(`select * from cds_tasks where pool_id=$1 and kind='cg_signup'`, [jRow[0].id])).rows;
ok(jTask.length === 1 && jTask[0].title.startsWith('Has someone to care for. New caregiver sign-up: Jane Tester, Ozark (Christian, Greene). Has their profile link.') && jTask[0].due_at, 'Hub to-do made by the database: ' + (jTask[0] || {}).title);
// Straight to their profile: the link opens, already started with what they told us.
ok(typeof j1.link === 'string' && j1.link.includes('/caregiver/?c='), 'new sign-up gets a private profile link back');
const sTok = new URL(j1.link).searchParams.get('c');
const sHome = await H('caregiver', 'home', { link: sTok });
ok(sHome.first_name === 'Jane' && JSON.stringify(sHome.draft.counties) === '["Christian","Greene"]' && sHome.draft.town === 'Ozark', 'the link opens their profile, started with their town and counties');
ok(Array.isArray(sHome.checklist) && sHome.checklist.length > 0, 'their checklist loads');
const jText = (await db.query(`select * from cds_outbox where pool_id=$1 and audience='caregiver'`, [jRow[0].id])).rows;
ok(jText.length === 1 && jText[0].template === 'cg_profile_link' && jText[0].automatic === true && jText[0].status === 'practice', 'a copy of the link is queued as a text (held while messages are off)');
const jPool = (await db.query(`select office_reviewed_at from attendant_pool where id=$1`, [jRow[0].id])).rows[0];
ok(!jPool.office_reviewed_at, 'signing up does not count as office review');
const sStaff = await S('caregiver', { id: jRow[0].id });
ok(sStaff.listing.state === 'not_listed', 'nobody is listed just by signing up');
const jMail = (await db.query(`select * from cds_outbox where pool_id=$1 and audience='office'`, [jRow[0].id])).rows;
ok(jMail.length === 4 && jMail.every(m => m.status === 'practice'), 'one office email per address, practice mode records only');
ok(jMail[0].body.startsWith('Has someone to care for. New CDS caregiver sign-up: Jane T.') && jMail[0].body.includes('Yes (parent). Medicaid: Yes, active Medicaid') && !jMail[0].body.includes('Mom Tester'), 'email subject flags it, and leaves out the person they care for');
ok(jMail.every(m => !/—/.test(m.body)), 'no em dashes in the office email');
const jAgain = await H('public', 'joinList', { ...joinIn, phone: '(417) 555-0100', city: '' });
ok(jAgain.repeat === true && !jAgain.link, 'same phone again: NO link on screen (could be someone else)');
const jRow2 = (await db.query(`select * from attendant_pool where right(regexp_replace(phone,'[^0-9]','','g'),10)='4175550100'`)).rows;
ok(jRow2.length === 1 && jRow2[0].city === 'Ozark', 'same phone again: one person, blank answers keep what we had');
ok((await db.query(`select count(*)::int n from cds_tasks where pool_id=$1 and kind='cg_signup' and done_at is null`, [jRow[0].id])).rows[0].n === 2, 'signing up again adds a "signed up again" to-do');
// A direct insert from the old page (anon) still gets its to-do.
await pg.exec(`set role anon; insert into attendant_pool (agency_id, first_name, last_name, phone, counties, source, background_ok) values ('caring-companions-cds','Old','Form','4175550111','["Taney"]','findcdscaregivers.com',true); reset role;`).catch(e => ok(false, 'anon insert: ' + e.message));
const oldT = (await db.query(`select t.title from cds_tasks t join attendant_pool p on p.id=t.pool_id where p.first_name='Old' and p.last_name='Form'`)).rows;
ok(oldT.length === 1 && /New caregiver sign-up: Old Form \(Taney\)/.test(oldT[0].title), 'direct insert from the old page still makes the to-do');
// Live with alerts off: held with a reason. Live and on, failing: the to-do says so.
const liveJ = createMatch({ ...practiceDeps(db, { familyBase: 'https://x.test/d/', caregiverBase: 'https://x.test/c/' }), mode: 'live', send: async () => { throw new Error('GHL down'); } });
await liveJ.handle('public', 'joinList', { ...joinIn, phone: '4175550122', first_name: 'Held' });
const held = (await db.query(`select o.status, o.error from cds_outbox o join attendant_pool p on p.id=o.pool_id where p.first_name='Held' and o.audience='office'`)).rows;
ok(held.length === 4 && held.every(m => m.status === 'held' && /switched off/.test(m.error)), 'live, alerts off: held with a visible reason');
await db.query(`update cds_match_settings set value = jsonb_set(value, '{live}', 'true') where key='office_alerts'`);
await liveJ.handle('public', 'joinList', { ...joinIn, phone: '4175550133', first_name: 'Failed' });
const fT = (await db.query(`select t.title from cds_tasks t join attendant_pool p on p.id=t.pool_id where p.first_name='Failed'`)).rows;
ok(fT.length === 1 && /Email alert failed, see Messages\.$/.test(fT[0].title), 'a failed email shows on the to-do');
await db.query(`update cds_match_settings set value = jsonb_set(value, '{live}', 'false') where key='office_alerts'`);
// Sending the profile link closes the sign-up to-dos.
await S('markReviewed', { id: jRow[0].id });
await S('sendProfileLink', { id: jRow[0].id });
ok((await db.query(`select count(*)::int n from cds_tasks where pool_id=$1 and kind='cg_signup' and done_at is null`, [jRow[0].id])).rows[0].n === 0, 'sending the profile link closes the sign-up to-dos');
const nb = (await db.query(`select extract(isodow from cds_next_business_4pm('2026-10-16 15:00-05') at time zone 'America/Chicago')::int d, to_char(cds_next_business_4pm('2026-10-16 15:00-05') at time zone 'America/Chicago','HH24:MI') t`)).rows[0];
ok(nb.d === 1 && nb.t === '16:00', 'Friday sign-up is due Monday 4pm');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
