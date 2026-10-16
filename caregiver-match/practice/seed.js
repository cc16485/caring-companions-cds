// Fictional caregivers and families for practice mode. Every person here is made up.
// Built by calling the real server logic (so the data is exactly what the
// screens would produce), then backdating a few dates so the board looks lived-in.

import { portraitSvg, svgData, proofDoc } from './portraits.js';

const AV = {
  weekdayAm: { mon: ['am'], tue: ['am'], wed: ['am'], thu: ['am'], fri: ['am'] },
  weekdayAmPm: { mon: ['am', 'pm'], tue: ['am', 'pm'], wed: ['am', 'pm'], thu: ['am', 'pm'], fri: ['am', 'pm'] },
  weekends: { sat: ['am', 'pm', 'eve'], sun: ['am', 'pm', 'eve'], fri: ['eve'] },
  evenings: { mon: ['eve'], tue: ['eve'], wed: ['eve'], thu: ['eve'], sat: ['pm', 'eve'] },
  mixed: { mon: ['am', 'pm'], wed: ['am', 'pm'], fri: ['am', 'pm'], sat: ['am'] },
};

export const CAREGIVERS = [
  { key: 'teresa', first: 'Teresa', last: 'Practice', town: 'Ozark', city: 'Ozark', counties: ['Christian', 'Greene'], stage: 'eligible', video: true, confirmedDaysAgo: 6,
    look: { skin: '#e8b98f', hair: '#6b3f1f', style: 'bob', top: '#2f8b86', bg: '#e9f6f5' }, av: AV.weekdayAm, hours: [15, 25], car: true, miles: 20,
    help: ['personal_care', 'meals_housekeeping', 'memory_care', 'errands'], certs: ['cpr'], languages: ['English'],
    about: 'I took care of my grandmother for three years and found out it\'s what I\'m good at. I\'m patient, I like to cook, and I\'ll always show up when I say I will.',
    enjoy: 'Getting to know someone\'s stories and routines, and making their day a little easier.', interests: 'Gardening, card games, old movies', setting: 'Quiet homes, mornings, one person at a time', exp: '3 years caring for a family member, 1 year in a care home' },
  { key: 'brenda', first: 'Brenda', last: 'Practice', town: 'Nixa', city: 'Nixa', counties: ['Christian'], stage: 'eligible', video: false, confirmedDaysAgo: 0,
    look: { skin: '#f0c8a8', hair: '#b9b2a8', style: 'bun', top: '#1b4d7e', bg: '#f2f0e9' }, av: AV.weekdayAmPm, hours: [20, 30], car: true, miles: 15,
    help: ['personal_care', 'memory_care', 'companionship'], certs: ['cpr', 'cna'], languages: ['English'],
    about: 'Retired CNA who missed the work. I spent 20 years in home health and I\'d like to help one or two people again.',
    enjoy: 'The little wins. A good bath, a good meal, a good laugh.', interests: 'Quilting, church choir, my grandkids', setting: 'Someone who likes conversation', exp: '20 years as a CNA in home health' },
  { key: 'jordan', first: 'Jordan', last: 'Practice', town: 'Springfield', city: 'Springfield', counties: ['Greene', 'Webster'], stage: 'eligible', video: false, confirmedDaysAgo: 38,
    look: { skin: '#8d5a3b', hair: '#120c08', style: 'short', top: '#0e3860', bg: '#e9f6f5' }, av: AV.weekends, hours: [10, 20], car: true, miles: 25,
    help: ['mobility_transfers', 'personal_care', 'errands'], certs: [], languages: ['English'],
    about: 'I\'m a nursing student at OTC and I work weekends. Strong, steady with transfers, and I like being useful.',
    enjoy: 'Helping someone stay in their own home.', interests: 'Basketball, cooking, fixing things', setting: 'Weekends, someone who needs a hand getting around', exp: '2 years helping my uncle after his stroke' },
  { key: 'marisol', first: 'Marisol', last: 'Practice', town: 'Republic', city: 'Republic', counties: ['Greene', 'Lawrence'], stage: 'screen_pending', video: true, confirmedDaysAgo: 12,
    look: { skin: '#c98d5e', hair: '#1d1410', style: 'long', top: '#c17a12', bg: '#fbf1df' }, av: AV.mixed, hours: [15, 30], car: true, miles: 20,
    help: ['meals_housekeeping', 'mobility_transfers', 'companionship'], certs: ['cpr'], languages: ['English', 'Spanish'],
    about: 'Mother of three, bilingual, and very organized. I cared for my father until he passed and I want to keep doing this work.',
    enjoy: 'Making a home feel calm and taken care of.', interests: 'Cooking, walking, telenovelas', setting: 'Families who want help with the house and the person', exp: '4 years caring for my father' },
  { key: 'luis', first: 'Luis', last: 'Practice', town: 'Ozark', city: 'Ozark', counties: ['Christian', 'Taney'], stage: 'instructions', video: false, confirmedDaysAgo: 9,
    look: { skin: '#b07a52', hair: '#2a1a10', style: 'curly', top: '#0e3860', bg: '#fbf1df' }, av: AV.evenings, hours: [10, 20], car: true, miles: 30,
    help: ['mobility_transfers', 'errands', 'companionship'], certs: [], languages: ['English', 'Spanish'],
    about: 'I work days at a warehouse and want evening and Saturday hours. I\'m calm, I\'m strong, and I\'m good company.',
    enjoy: 'Getting someone out of the house for errands and a coffee.', interests: 'Fishing, the Royals, grilling', setting: 'Evenings and Saturdays', exp: '1 year helping a neighbor' },
  { key: 'kayla', first: 'Kayla', last: 'Practice', town: 'Nixa', city: 'Nixa', counties: ['Christian', 'Greene'], stage: 'building', video: false, confirmedDaysAgo: 3,
    look: { skin: '#f2cfae', hair: '#c08a4a', style: 'long', top: '#2f8b86', bg: '#e9f6f5' }, av: AV.weekdayAmPm, hours: [20, 35], car: true, miles: 15,
    help: ['personal_care', 'meals_housekeeping'], certs: ['cpr'], languages: ['English'],
    about: 'New to caregiving for pay, but I raised my little brother and helped my mom through cancer. I\'m reliable and I learn fast.',
    enjoy: 'Being the person someone can count on.', interests: 'Reading, baking, hiking', setting: 'Weekdays', exp: 'Family caregiving' },
];
export const NEW_SIGNUPS = [
  { first: 'Denise', last: 'Practice', city: 'Bolivar', counties: ['Polk'], fcsr: 'no', exp: 'Less than 1 year' },
  { first: 'Ray', last: 'Practice', city: 'Lebanon', counties: ['Laclede'], fcsr: 'yes', exp: '1 to 3 years' },
];

export async function seed(match, db, { staff = 'linda@caringcds.com', photoFor = null } = {}) {
  const S = (a, i) => match.handle('staff', a, { staff, ...i });
  const C = (a, i) => match.handle('caregiver', a, i);
  const q = (sql, p) => db.query(sql, p);
  const links = {};
  let n = 10;

  for (const g of CAREGIVERS) {
    const phone = '41755501' + (n++);
    const r = await q(`insert into attendant_pool (agency_id, first_name, last_name, phone, email, city, counties, experience, source, fcsr_registered_answer, submitted_at)
      values ('caring-companions-cds',$1,$2,$3,$4,$5,$6::jsonb,$7,'practice',$8, now() - interval '20 days') returning id`,
      [g.first, g.last, phone, g.key + '@example.com', g.city, JSON.stringify(g.counties), g.exp, g.stage === 'eligible' ? 'yes' : 'no']);
    const id = r.rows[0].id;
    g.id = id;
    await S('markReviewed', { id, note: 'Practice: phone review done.' });
    const sent = await S('sendProfileLink', { id, channel: 'sms' });
    let token = new URL(sent.practice_link).searchParams.get('c');
    if (g.stage !== 'eligible') {
      const steps = await S('sendRegistrationSteps', { id, channel: 'sms' });
      token = new URL(steps.practice_link.split('#')[0]).searchParams.get('c');
    }
    const link = token;
    await C('saveProfile', { link, draft: { about_me: g.about, enjoy_most: g.enjoy, interests: g.interests, setting_pref: g.setting, experience: g.exp,
      town: g.town, counties: g.counties, help_types: g.help, languages: g.languages, certs: g.certs, has_car: g.car, travel_miles: g.miles } });
    // Practice portraits are SVG drawings, so they go in directly rather than through the photo upload check.
    // Practice photos are AI pictures of people who don't exist; drawings if none are available.
    const real = photoFor ? await photoFor(g.key) : null;
    const photo = await match.deps.media.put({ pool_id: id, kind: 'photo', mime: real ? real.mime : 'image/svg+xml', data: real ? real.data : svgData(portraitSvg(g.look)), by: 'practice seed' });
    await q('update cds_cg_profiles set photo_draft=$2 where pool_id=$1', [id, photo]);
    if (g.video) {
      const v = await match.deps.media.put({ pool_id: id, kind: 'video', mime: 'video/practice', data: 'practice-video:' + g.first, by: 'practice seed' });
      await q('update cds_cg_profiles set video_draft=$2 where pool_id=$1', [id, v]);
      await C('giveConsent', { link, kind: 'video' });
    }
    await C('saveAvailability', { link, availability: g.av, hours_min: g.hours[0], hours_max: g.hours[1], accepting_intros: true });
    await C('giveConsent', { link, kind: 'profile' });
    if (g.stage !== 'instructions') await C('setRegistration', { link, answer: g.stage === 'eligible' ? 'already' : 'done' });
    if (g.stage !== 'instructions') {
      await C('submitAuthorization', { link, legal_first: g.first, legal_middle: '', legal_last: g.last, dob: '1988-04-12', ssn: '900-00-' + (1000 + n), agree: true });
    }
    await C('submitForReview', { link });
    if (g.stage !== 'building') await S('reviewProfile', { id, decision: 'approve', verified_certs: g.certs });

    if (['eligible', 'screen_pending'].includes(g.stage)) {
      await S('recordScreening', { id, step: 'reg_verified', proof: proofDoc('FCSR registry lookup: ' + g.first) });
      await S('recordScreening', { id, step: 'screen_pending', method: 'phone' });
    }
    if (g.stage === 'eligible') {
      await S('recordScreening', { id, step: 'screen_complete', result: 'no_findings', proof: proofDoc('FCSR screening result: no findings') });
      for (const k of ['edl', 'edr', 'oig', 'mo_medicaid', 'id_match']) await S('recordCheck', { id, check_key: k, result: 'clear', proof: proofDoc(k.toUpperCase() + ' check: clear') });
      await S('recordCheck', { id, check_key: 'age18', result: 'clear' });
    }
    await q(`update cds_cg_profiles set availability_confirmed_at = now() - ($2 || ' days')::interval where pool_id=$1`, [id, String(g.confirmedDaysAgo)]);
    links[g.key] = link;
  }
  for (const s of NEW_SIGNUPS) {
    await q(`insert into attendant_pool (agency_id, first_name, last_name, phone, email, city, counties, experience, source, fcsr_registered_answer, submitted_at)
      values ('caring-companions-cds',$1,$2,$3,$4,$5,$6::jsonb,$7,'public',$8, now() - interval '1 day')`,
      [s.first, s.last, '41755501' + (n++), s.first.toLowerCase() + '@example.com', s.city, JSON.stringify(s.counties), s.exp, s.fcsr]);
  }

  const cgIds = Object.fromEntries(CAREGIVERS.map(g => [g.key, g.id]));
  // Families, each at a different point in the eligibility review.
  const fam = {};
  const addFam = async (first, town, county, kind, phone) => {
    const r = await S('addProspect', { first_name: first, last_name: 'Practice', phone, email: first.toLowerCase().replace(/\W/g, '') + '@example.com', town, county, kind });
    return r.id;
  };
  const consent = (id, from = 'consumer') => S('recordConsent', { prospect_id: id, from, how: 'Verbally on the phone' });
  const check = (id, coverage, extra = {}) => S('recordMedicaidCheck', { prospect_id: id, method: 'emomed_web', coverage, ...extra });
  fam.ruth = await addFam('Ruth', 'Nixa', 'Christian', 'prospect', '4175550142');
  await consent(fam.ruth); await check(fam.ruth, 'active');
  await S('setDsds', { prospect_id: fam.ruth, dsds_cds: 'not_yet', referral_needed: true });
  await S('markPotential', { prospect_id: fam.ruth, note: 'Daughter calling for her mom. Interested in CDS, wants to meet caregivers first.' });
  await S('approveAccess', { prospect_id: fam.ruth, path: 'potential_cds', note: 'Medicaid active. Exploring CDS before a DSDS referral.' });
  fam.ann = await addFam('Ann', 'Ozark', 'Christian', 'consumer', '4175550143');
  await S('approveAccess', { prospect_id: fam.ann, path: 'cds_consumer', existing_consumer: true, note: 'Current CDS consumer looking for a second caregiver.' });
  fam.dale = await addFam('Dale and June', 'Springfield', 'Greene', 'prospect', '4175550144');
  await consent(fam.dale, 'authorized_rep'); await check(fam.dale, 'active', { restrictions: 'None noted' });
  await S('setDsds', { prospect_id: fam.dale, dsds_cds: 'not_yet', referral_needed: true });
  await S('markPotential', { prospect_id: fam.dale, note: 'Spouse is the authorized representative.' });
  await S('approveAccess', { prospect_id: fam.dale, path: 'potential_cds', note: 'Medicaid active. Wants to browse before deciding.' });
  // Waiting in the review at different steps:
  const req = await match.handle('public', 'requestAccess', { first_name: 'Harold', last_name: 'Practice', phone: '4175550145', town: 'Republic', program: 'ihs' });
  await match.handle('public', 'requestAccessMore', { followup: req.followup, county: 'Greene', relationship: 'spouse', best_time: 'Mornings' });
  const harold = (await S('prospects', {})).prospects.find(p => p.first_name === 'Harold').id;
  await consent(harold, 'authorized_rep'); await check(harold, 'active');
  await S('setDsds', { prospect_id: harold, dsds_cds: 'not_yet', referral_needed: true });
  await S('markPotential', { prospect_id: harold, note: 'Wife on IHS now. Wants to see caregivers before deciding.' });
  await S('approveAccess', { prospect_id: harold, path: 'potential_cds', note: 'Medicaid active. Invitation waits for the IHS legal review.' });
  await match.handle('public', 'requestAccess', { first_name: 'Walter', last_name: 'Practice', phone: '4175550146', town: 'Marshfield', program: 'new' });
  const gloriaReq = await match.handle('public', 'requestAccess', { first_name: 'Gloria', last_name: 'Practice', phone: '4175550147', town: 'Bolivar', program: 'not_sure' });
  const gloria = (await S('prospects', {})).prospects.find(p => p.first_name === 'Gloria').id;
  await consent(gloria); await check(gloria, 'inactive', { note: 'Coverage ended last month per eMOMED.' });
  await match.handle('public', 'requestAccess', { first_name: 'Bea', last_name: 'Practice', phone: '4175550148', town: 'Ava', program: 'new' });
  const bea = (await S('prospects', {})).prospects.find(p => p.first_name === 'Bea').id;
  await consent(bea); await check(bea, 'active');
  await S('setNextAction', { prospect_id: bea, action: 'Ask DSDS whether a CDS assessment is already scheduled', owner: 'Krystal', due: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) });

  // Mae: approved, moving toward services next month (shows the readiness checklist).
  await match.handle('public', 'requestAccess', { first_name: 'Mae', last_name: 'Practice', phone: '4175550149', town: 'Ozark', program: 'new' });
  const mae = (await S('prospects', {})).prospects.find(p => p.first_name === 'Mae').id;
  await consent(mae); await check(mae, 'active');
  await S('setDsds', { prospect_id: mae, dsds_cds: 'confirmed', dsds_cds_on: new Date().toISOString().slice(0, 10), note: 'DSDS assessment done' });
  await S('approveAccess', { prospect_id: mae, path: 'cds_consumer', note: 'DSDS confirmed CDS eligibility.' });
  await S('setStage', { prospect_id: mae, stage: 'transition_requested', note: 'Chose Brenda after a video meet-and-greet' });
  await S('setStage', { prospect_id: mae, stage: 'authorization_pending', note: 'Waiting on DSDS authorization' });
  const nm = new Date(); nm.setUTCMonth(nm.getUTCMonth() + 1, 3);
  await S('setExpectedStart', { prospect_id: mae, date: nm.toISOString().slice(0, 10) });
  await S('setChosenCaregiver', { prospect_id: mae, pool_id: cgIds.brenda });
  await S('authorizeServices', { prospect_id: mae, date: new Date().toISOString().slice(0, 10), note: 'Authorization received' });

  const famLinks = {};
  for (const k of ['ruth', 'ann', 'dale']) {
    const inv = await S('invite', { prospect_id: fam[k] });
    famLinks[k] = new URL(inv.practice_link).searchParams.get('i');
  }
  // Ruth and Ann sign in and ask for introductions.
  const signIn = async invite => {
    const sc = await match.handle('family', 'sendCode', { invite, channel: 'sms' });
    return (await match.handle('family', 'verifyCode', { invite, code: sc.practice_code })).session;
  };
  const ruth = await signIn(famLinks.ruth);
  const ann = await signIn(famLinks.ann);
  const cg = Object.fromEntries(CAREGIVERS.map(g => [g.key, g.id]));
  await match.handle('family', 'requestIntro', { session: ruth, pool_id: cg.teresa, how: 'video', preferred_times: 'Weekday mornings' });
  await match.handle('family', 'requestIntro', { session: ruth, pool_id: cg.brenda, how: 'home', preferred_times: 'Any morning' });
  await match.handle('family', 'requestIntro', { session: ruth, pool_id: cg.jordan, how: 'home', preferred_times: 'Evenings' });
  await match.handle('family', 'requestIntro', { session: ann, pool_id: cg.teresa, how: 'elsewhere', preferred_times: 'Wednesday' });
  // Ruth answered the needs questions and saved a few caregivers.
  await match.handle('family', 'setNeeds', { session: ruth, needs: { county: 'Christian', days: ['mon', 'tue', 'wed', 'thu', 'fri'], parts: ['am'], hours: 20, help: ['personal_care', 'memory_care'], drives: true } });
  for (const k of ['teresa', 'brenda', 'jordan']) await match.handle('family', 'saveCaregiver', { session: ruth, pool_id: cg[k], saved: true });

  const intros = (await S('intros', {})).intros;
  const find = (f, c) => intros.find(i => i.family === f && i.caregiver === c).id;
  // Teresa: asked, said yes, meeting set (video).
  await S('askCaregiver', { intro_id: find('Ruth', 'Teresa') });
  await C('respondIntro', { link: links.teresa, id: find('Ruth', 'Teresa'), answer: 'yes' });
  const thu = new Date(); thu.setUTCDate(thu.getUTCDate() + ((4 - thu.getUTCDay() + 7) % 7 || 7)); thu.setUTCHours(15, 0, 0, 0);
  await S('updateIntro', { intro_id: find('Ruth', 'Teresa'), status: 'scheduled', meet_at: thu.toISOString(), meet_details: 'Video link: sent the day before (practice).' });
  // Brenda: asked, waiting.
  await S('askCaregiver', { intro_id: find('Ruth', 'Brenda') });
  // Jordan: not available. (Only screening-complete caregivers can be asked, her rule 2026-10-16.)
  await S('updateIntro', { intro_id: find('Ruth', 'Jordan'), status: 'not_available', note: 'Jordan is full this month.' });
  // Teresa and Ann: asked, said yes (office needs to schedule).
  await S('askCaregiver', { intro_id: find('Ann', 'Teresa') });
  await C('respondIntro', { link: links.teresa, id: find('Ann', 'Teresa'), answer: 'yes' });

  return { caregiverLinks: links, familyLinks: famLinks, ids: cg, families: fam };
}
