// The CDS Coordinator's welcome journey (2026-11-17, her words: "lets think about how we can help nurture and help new
// consumers and attendants and make them feel very taken care of by the ai cds coordinator - only human intervention when
// needed" and "consumer needs to complete their packet and also be sent the orientation"; her yes to the plan).
//
// Texts at real moments only, never because time passed on its own (feedback-no-timed-family-nudges): each one is tied to
// a step that just happened or a date the state gave. Warm, short, signed by the person's coordinator, from the CDS line.
// Never the word AI. What others already send is NOT repeated here: the enrollment packet reminds on day 2 and 4 by itself,
// the attendant packet sends the attendant's link, orientation and "your checks are clear", the never-clocked-out texts
// handle missed punches, and the monthly check-in calls handle month 2 on.
//   welcome    the day they say yes (Starting, within 3 days)
//   orient     their packet is signed and the consumer orientation is not done: the link (caringcds.com/consumer-orientation)
//   orient2    start date in 5 days or less and orientation still not done: one reminder
//   day1       the morning of the start date: the consumer and the attendant
//   howwent    the evening of the start date: "how did it go, did clocking in work?"
//   week1/2/4  7, 14 and 28 days after the start date: "anything we can help with?"
//   payday     the attendant, the day before their first Thursday payday (the Thursday after the start week's Saturday)
// Switch "Welcome texts to new consumers" (setting welcome_texts.live): off = each waits on the profile for Send.
// No em dashes in anything a person reads (her rule).
const ten = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
const first = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dow = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
const niceDay = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const sign = who => (who && !/^office$/i.test(who) ? first(who) + ' at ' : '') + 'Caring Companions';
export const LINE = '(417) 218-2888';
export const ORIENT_URL = 'caringcds.com/consumer-orientation';
export const CLOCK_URL = 'caringcds.com/clock-in';

export const JOURNEY_WORDS = {
  welcome: v => 'Hi ' + first(v.name) + ', this is ' + sign(v.from) + '. Welcome! We are so glad you chose us for CDS. Over the next few weeks we will walk with you every step: the state, your paperwork, and getting ' + (v.att ? first(v.att) : 'your caregiver') + ' set up. We will text you as each step is done. Questions anytime: reply here or call ' + LINE + '.',
  orient: v => 'Hi ' + first(v.name) + ', thank you for signing your paperwork! The next step is a short online orientation about being in charge of your care in CDS: ' + ORIENT_URL + ' . Questions? Reply here or call ' + LINE + '.',
  orient2: v => 'Hi ' + first(v.name) + ', your CDS care starts ' + niceDay(v.start) + '. Have you had a chance to do the short orientation? It needs to be done before your start date: ' + ORIENT_URL + ' . Reply here if you need help with it.',
  day1Consumer: v => 'Good morning ' + first(v.name) + '! Today is the day ' + (v.att ? first(v.att) + ' starts' : 'your care starts') + '. Remember: clock in when the work starts and out when it ends, every visit. We are cheering you on. Call ' + LINE + ' if anything comes up.',
  day1Attendant: v => 'Good morning ' + first(v.att) + '! Today you start with ' + first(v.name) + '. Clock in on the WellSky app when you start and out when you finish, every visit (how: ' + CLOCK_URL + ' ). You have got this! Questions: ' + LINE + '.',
  howwent: v => 'Hi ' + first(v.name) + ', how did today go' + (v.att ? ' with ' + first(v.att) : '') + '? Did clocking in and out work okay? Just reply here.',
  week1: v => 'Hi ' + first(v.name) + ', it has been a week! How is everything going' + (v.att ? ' with ' + first(v.att) : '') + '? Anything we can help with? Just reply here.',
  week2: v => 'Hi ' + first(v.name) + ', checking in from Caring Companions. Is the schedule working for you? Any questions about clocking in or your hours? Just reply here.',
  week4: v => 'Hi ' + first(v.name) + ', one month in! We hope things are going well. If anything has changed, or you have any questions at all, just reply here or call ' + LINE + '.',
  payday: v => 'Hi ' + first(v.att) + ', your first CDS payday is tomorrow, ' + niceDay(v.payday) + '! Pay comes by direct deposit through Empeon, and your pay stub is in the Empeon app. Questions about your hours? Just reply here.',
};

// The first Thursday payday: the Thursday after the Saturday that ends the start week (care week Sunday to Saturday).
export function firstPayday(start) { const sat = addDays(start, (6 - dow(start) + 7) % 7); return addDays(sat, 5); }

// Which journey texts are due now. hour = Central hour (0-23). Practice records are left alone.
export function planJourney({ consumers, attendants, packets, orientations, today, hour }) {
  const out = [], real = c => !/^(example|test)\b/i.test(String(c.name || ''));
  const attOf = c => {
    const typed = norm(c.starting && c.starting.attendantName);
    return (attendants || []).find(a => typed && norm([a.first_name, a.last_name].join(' ')) === typed) || (attendants || []).find(a => norm(a.consumer_name) === norm(c.name)) || null;
  };
  const oriented = c => (orientations || []).some(o => o.course === 'consumer' && norm(o.name) === norm(c.name));
  const packetOf = c => (packets || []).find(p => String(p.consumer_id || '') === String(c.id) || (c.starting && c.starting.leadId && String(p.lead_id) === String(c.starting.leadId))) || null;
  const push = (c, sub, toName, phone, body, extra) => { if (ten(phone)) out.push(Object.assign({ kind: 'journey', sub, key: 'journey:' + sub + ':' + c.id + (extra || ''), person_kind: 'consumer', person_id: String(c.id), person_name: c.name, to_name: toName, phone: ten(phone), body }, {})); };
  (consumers || []).filter(c => c && real(c) && (c.status === 'starting' || c.status === 'active')).forEach(c => {
    const s = c.starting || {}, from = c.coordinator || '', start = c.cdsStartDate || '', a = attOf(c);
    const att = a ? [a.first_name, a.last_name].filter(Boolean).join(' ') : (s.attendantName || '');
    const v = { name: c.name, from, start, att };
    if (c.status === 'starting') {
      // welcome: said yes in the last 3 days
      if (s.at && String(s.at).slice(0, 10) >= addDays(today, -3)) push(c, 'welcome', c.name, c.phone, JOURNEY_WORDS.welcome(v));
      // orientation: after the packet is signed, until it is done
      const pk = packetOf(c);
      if (pk && pk.signed_at && !oriented(c)) {
        push(c, 'orient', c.name, c.phone, JOURNEY_WORDS.orient(v));
        if (start && start >= today && start <= addDays(today, 5)) push(c, 'orient2', c.name, c.phone, JOURNEY_WORDS.orient2(v), ':' + start);
      }
    }
    if (!start) return;
    // the start day: morning (9 to noon) both of them; evening (5 to 7) the consumer
    if (start === today && hour >= 9 && hour < 12) { push(c, 'day1', c.name, c.phone, JOURNEY_WORDS.day1Consumer(v), ':' + start); if (a) push(c, 'day1att', att, a.phone, JOURNEY_WORDS.day1Attendant(v), ':' + start); }
    if (start === today && hour >= 17 && hour < 19) push(c, 'howwent', c.name, c.phone, JOURNEY_WORDS.howwent(v), ':' + start);
    // weeks 1, 2 and 4 after the start (on that day, 10 to 6)
    if (hour >= 10 && hour < 18) for (const [sub, n] of [['week1', 7], ['week2', 14], ['week4', 28]]) if (today === addDays(start, n)) push(c, sub, c.name, c.phone, JOURNEY_WORDS[sub](v), ':' + start);
    // the attendant's first payday, the day before (10 to 6)
    const pay = firstPayday(start);
    if (a && hour >= 10 && hour < 18 && today === addDays(pay, -1)) push(c, 'payday', att, a.phone, JOURNEY_WORDS.payday(Object.assign({ payday: pay }, v)), ':' + start);
  });
  return out;
}
