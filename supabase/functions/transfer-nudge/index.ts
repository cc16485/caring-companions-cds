// Supabase Edge Function: transfer-nudge  (CDS project, siivpekcaryeyttszwav)
// -----------------------------------------------------------------------------
// A PCCP transfer takes weeks and almost all of it is waiting. That is where
// they die: the consumer never hears what happens next, the attendant's
// application sits in an inbox, and the day the start date arrives nobody has
// done the orientation. Nothing here is clever. It just refuses to let a
// transfer go quiet.
//
// WHAT CANNOT BE AUTOMATED, AND IS NOT PRETENDED OTHERWISE
// eMOMED has no API, so somebody logs in and looks. Fusion has no API, so
// somebody types the PCCP in. The state rings the consumer on its own schedule.
// Background checks and Empeon are other people's systems. WellSky has to be
// installed by the attendant on their own phone. All of those stay manual, and
// this function's job is to chase them, not to claim them.
//
// THE TRANSFER DATE IS FIRM. BEING PAID IS THE PART THAT IS NOT.
// The state's start date for a transfer is set in stone: on that day the
// consumer is ours. What is not settled is whether their chosen attendant can
// be PAID yet, because that waits on a background check clearing.
//
// So the transfer date is told plainly, as fact. The thing chased hard is the
// attendant's clearance before it, for one reason: an attendant who starts
// working before they are cleared does not get paid for those hours, and it
// cannot be fixed afterwards. That falls on somebody earning very little to
// look after somebody's mother, so the message says it in those words rather
// than in the language of compliance.
//
// WHAT IS AUTOMATED
//   the telling    every time the transfer moves, the people affected hear
//   the chasing    every wait has a deadline and something happens when it passes
//
// Each message fires once. The marker it writes is the record of it having
// happened, so a redeploy or a double cron tick cannot send twice.
//
// ?dry=1 reports exactly what it would send, to whom, and why, without sending.
// Deploy: supabase functions deploy transfer-nudge
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const GHL_API = 'https://services.leadconnectorhq.com'
const OFFICE = '(417) 218-2888'
const ONBOARDING = 'https://caringcds.com/onboarding-packet'
const ORIENTATION = 'https://caringcds.com/orientation'
const TODAY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86400000)

/* Nobody in the middle of arranging care for a parent should get a text at
   half past ten at night. Office hours, Central. */
function withinCallingHours() {
  const h = Number(new Date().toLocaleString('en-US',
    { timeZone: 'America/Chicago', hour: '2-digit', hour12: false }))
  return h >= 8 && h < 20
}

type Person = { name?: string; phone?: string; email?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const dry = new URL(req.url).searchParams.get('dry') === '1'

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = Deno.env.get('GHL_TOKEN')
  const locationId = Deno.env.get('GHL_LOCATION_ID')

  const { data: rows, error } = await admin
    .from('app_data').select('agency_id, data_key, data_value').eq('data_key', 'pipeline')
  if (error) return json({ error: error.message }, 500)

  const h = {
    Authorization: `Bearer ${token}`, Version: '2021-07-28',
    'Content-Type': 'application/json', Accept: 'application/json',
  }
  const send = async (to: Person, sms: string, subject: string, html: string) => {
    if (!token || !locationId) return false
    if (!to.phone && !to.email) return false
    const first = String(to.name || '').split(' ')[0] || 'there'
    const up = await fetch(`${GHL_API}/contacts/upsert`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ locationId, ...(to.phone ? { phone: to.phone } : {}),
        ...(to.email ? { email: to.email } : {}), firstName: first }),
    })
    const uj = await up.json().catch(() => ({}))
    const contactId = uj?.contact?.id ?? uj?.id
    if (!contactId) return false
    if (to.phone) await fetch(`${GHL_API}/conversations/messages`, {
      method: 'POST', headers: h, body: JSON.stringify({ type: 'SMS', contactId, message: sms }) })
    if (to.email) await fetch(`${GHL_API}/conversations/messages`, {
      method: 'POST', headers: h, body: JSON.stringify({ type: 'Email', contactId, subject,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#1f2a36">${html}` +
              `<p style="color:#57606a">Caring Companions Consumer Directed Services<br>${OFFICE}</p></div>` }) })
    return true
  }

  const plan: { who: string; what: string; why: string }[] = []
  let sent = 0
  const quiet = !withinCallingHours()

  for (const row of rows ?? []) {
    const list = Array.isArray(row.data_value) ? row.data_value : []
    let touched = false

    for (const p of list) {
      if (p.type !== 'pccp') continue
      const t = (p.transfer = p.transfer || {})
      const a = p.attendant || null
      const consumer: Person = { name: p.name, phone: p.phone, email: p.email }
      const first = String(p.name || '').split(' ')[0] || 'there'

      /* One message per record per run. A consumer who has been quiet for three
         weeks should not suddenly get four texts because four deadlines passed
         while nobody was looking. */
      const act = async (marker: string, to: Person, why: string,
                         sms: string, subject: string, html: string) => {
        plan.push({ who: to.name || 'unknown', what: marker, why })
        if (dry || quiet) return true          // counted, not sent
        if (await send(to, sms, subject, html)) {
          t[marker] = new Date().toISOString()
          touched = true
          sent++
          return true
        }
        return false
      }

      // ---- the PCCP is in. Tell them what actually happens next, because
      //      the next thing that happens is a stranger from the state ringing.
      if (t.fusionSubmitted && !t.toldSubmitted) {
        if (await act('toldSubmitted', consumer, 'PCCP submitted, consumer not told',
          `Hi ${first}, Caring Companions CDS. Your request to transfer to us is in with the state. ` +
          `They will ring you to confirm it, so please answer. Stay with your current agency until we have ` +
          `a start date, and we will tell you the moment we do. Questions, we are on ${OFFICE}.`,
          'Your transfer request is in',
          `<p>Hi ${first},</p><p>Your request to transfer to Caring Companions is now with the state.</p>` +
          `<p><b>Two things to expect.</b> The state will call you to confirm the switch, so please answer. ` +
          `And keep working with your current agency until we give you a start date, nothing changes before then.</p>` +
          `<p>We will tell you the start date the moment the state gives it to us.</p>`)) continue
      }

      // ---- the start date exists. That is the date everything else hangs on.
      if (t.startDate && !t.toldStartDate) {
        if (await act('toldStartDate', consumer, 'start date received, consumer not told',
          `Hi ${first}, your transfer to Caring Companions is confirmed for ${t.startDate}. ` +
          `Stay with your current agency until that day. One thing to know: your caregiver cannot be paid until ` +
          `their background check clears, so please do not have them start early. Paperwork: ${ONBOARDING}`,
          `Your transfer is confirmed for ${t.startDate}`,
          `<p>Hi ${first},</p><p>The state has confirmed your transfer to Caring Companions. It starts on ` +
          `<b>${t.startDate}</b>.</p>` +
          `<p>Carry on with your current agency right up to that day. Nothing changes before it.</p>` +
          `<p><b>One thing worth knowing now.</b> Your caregiver cannot be paid until their background check ` +
          `comes back clear. If they start working before that, those hours cannot be paid, and we are not able ` +
          `to fix it afterwards. We will tell you both the moment they are cleared.</p>` +
          `<p>Two things to get done before the ${t.startDate}, and they are quick:</p>` +
          `<p><a href="${ONBOARDING}">Sign your paperwork</a> &middot; <a href="${ORIENTATION}">Do your orientation</a></p>`)) continue
      }

      /* ---- Cleared to be paid. This message exists because the alternative
              is somebody working for nothing and finding out later. It goes to
              the attendant, who is the one who loses money. */
      if (t.readyToWork && !t.toldReadyToWork) {
        const attFirst = String((a && a.name) || '').split(' ')[0] || 'there'
        if (a && (a.phone || a.email)) {
          if (await act('toldReadyToWork', { name: a.name, phone: a.phone, email: a.email },
            'attendant cleared to be paid, not told yet',
            `Hi ${attFirst}, good news from Caring Companions. Your background check has cleared and your ` +
            `paperwork is in, so you can be paid for looking after ${p.name} from ${t.startDate || 'your start date'}. ` +
            `Remember to clock in and out on the WellSky app every visit, that is what pays you. ${OFFICE}`,
            'You are cleared, and you can be paid',
            `<p>Hi ${attFirst},</p><p><b>Your background check has cleared</b> and your paperwork is in.</p>` +
            `<p>You can be paid for looking after <b>${p.name}</b> from ` +
            `<b>${t.startDate || 'your start date'}</b>.</p>` +
            `<p><b>One thing, every single visit:</b> clock in when you arrive and clock out when you leave, on ` +
            `the WellSky Personal Care app. That is what pays you. Hours that are not clocked cannot be paid, and ` +
            `we cannot put them right afterwards.</p>` +
            `<p>If the app is giving you trouble, ring ${OFFICE} before your first visit, not after.</p>`)) continue
        }
      }

      /* ---- the background check came back failed. This is a fork, not a
              delay: they need a different attendant. Stop chasing the one who
              cannot be hired, and put it in front of a person. */
      if (a && a.backgroundResult === 'failed' && !t.attendantFailedFlagged) {
        plan.push({ who: 'the office', what: 'attendantFailedFlagged',
          why: `${a.name || 'the attendant'} failed their background check, ${p.name} needs a different one` })
        if (!dry) { t.attendantFailedFlagged = new Date().toISOString(); touched = true }
        continue        // nothing else about this transfer is sendable yet
      }

      // ---- the attendant's application. This is the piece that quietly stalls.
      if (a && a.backgroundResult !== 'failed' && a.email && !a.applicationSent) {
        if (await act('attApplicationSent', { name: a.name, phone: a.phone, email: a.email },
          'attendant on file, application never sent',
          `Hi ${String(a.name || '').split(' ')[0] || 'there'}, Caring Companions CDS here. ` +
          `${p.name} has asked for you to be their paid caregiver. Here is your application: ${ONBOARDING} ` +
          `Any questions, ring us on ${OFFICE}.`,
          'Your application to be a paid caregiver',
          `<p>Hi ${String(a.name || '').split(' ')[0] || 'there'},</p>` +
          `<p><b>${p.name}</b> has asked for you to be their paid caregiver through Caring Companions.</p>` +
          `<p><a href="${ONBOARDING}">Start your application</a></p>` +
          `<p>Once it is back we run your background checks, and then you can be paid.</p>`)) {
          if (!dry && !quiet) { a.applicationSent = new Date().toISOString(); touched = true }
          continue
        }
      }

      // ---- sent, and nothing back. Chase once at four days, once at nine.
      if (a && a.backgroundResult !== 'failed' && a.applicationSent && !a.applicationBack) {
        const days = daysBetween(TODAY(), String(a.applicationSent).slice(0, 10))
        const step = days >= 9 && !t.attChase2 ? 'attChase2'
                   : days >= 4 && !t.attChase1 ? 'attChase1' : null
        if (step) {
          if (await act(step, { name: a.name, phone: a.phone, email: a.email },
            `attendant application ${days} days out, nothing back`,
            `Hi ${String(a.name || '').split(' ')[0] || 'there'}, Caring Companions CDS. We still need your ` +
            `application before you can be paid for looking after ${p.name}: ${ONBOARDING} ` +
            `Stuck on any of it? Ring us on ${OFFICE} and we will do it with you.`,
            'We still need your application',
            `<p>Hi ${String(a.name || '').split(' ')[0] || 'there'},</p>` +
            `<p>We cannot pay you for looking after <b>${p.name}</b> until your application is back.</p>` +
            `<p><a href="${ONBOARDING}">Finish your application</a></p>` +
            `<p>If any of it is confusing, ring us and we will fill it in with you.</p>`)) continue
        }
      }

      /* ---- the week before the start date. Everything below this line is a
              reason somebody does not get paid, or does not get care, on day
              one. Chased once each, only when the date is close enough to
              matter. */
      if (t.startDate) {
        const until = daysBetween(String(t.startDate).slice(0, 10), TODAY())

        if (until >= 0 && until <= 7 && !t.onboardingSigned && !t.chaseOnboarding) {
          if (await act('chaseOnboarding', consumer, `starts in ${until} days, paperwork not signed`,
            `Hi ${first}, your Caring Companions start date is ${t.startDate} and we still need your ` +
            `paperwork signed: ${ONBOARDING} It only takes a few minutes and we cannot start without it.`,
            'We still need your paperwork',
            `<p>Hi ${first},</p><p>You start with us on <b>${t.startDate}</b> and your paperwork is not signed yet.</p>` +
            `<p><a href="${ONBOARDING}">Sign it here</a> &mdash; a few minutes, and we cannot start without it.</p>`)) continue
        }

        if (until >= 0 && until <= 7 && !t.orientationDone && !t.chaseOrientation) {
          if (await act('chaseOrientation', consumer, `starts in ${until} days, orientation not done`,
            `Hi ${first}, one more thing before ${t.startDate}: your orientation. ` +
            `It is short and you can do it at home: ${ORIENTATION}`,
            'Your orientation, before you start',
            `<p>Hi ${first},</p><p>Before <b>${t.startDate}</b> you need to complete your orientation. ` +
            `It is short and you can do it at home.</p><p><a href="${ORIENTATION}">Start orientation</a></p>` +
            `<p>If you would rather we walked you through it on the phone, ring ${OFFICE}.</p>`)) continue
        }

        /* The transfer lands in days and the attendant still cannot be paid.
           Only the office hears this. The transfer happens regardless, so the
           risk is not that nobody turns up: it is that somebody works for
           nothing, and by the time anybody notices the hours are already lost
           and cannot be put right. */
        if (until >= 0 && until <= 3 && !t.readyToWork && !t.notReadyFlagged) {
          plan.push({ who: 'the office', what: 'notReadyFlagged',
            why: `${p.name} transfers to us on ${t.startDate}, ${until} days away, and their attendant is not ` +
                 `cleared to be paid yet. The transfer happens regardless, so on that day they have care nobody ` +
                 `can be paid for.` })
          if (!dry) { t.notReadyFlagged = new Date().toISOString(); touched = true }
          continue
        }

        // EVV is the one where being nice about it does nobody any favours.
        if (until >= 0 && until <= 5 && a && a.backgroundResult !== 'failed' &&
            a.email && !a.wellskyReady && !t.chaseWellsky) {
          if (await act('chaseWellsky', { name: a.name, phone: a.phone, email: a.email },
            `starts in ${until} days, attendant not set up on WellSky`,
            `Hi ${String(a.name || '').split(' ')[0] || 'there'}, before ${t.startDate} you need the ` +
            `WellSky Personal Care app on your phone and to know how to clock in and out. ` +
            `This is how you get paid: no clock in and out, no pay. Ring ${OFFICE} and we will set it up with you.`,
            'You need the WellSky app before you start',
            `<p>Hi ${String(a.name || '').split(' ')[0] || 'there'},</p>` +
            `<p>Before <b>${t.startDate}</b> you need the <b>WellSky Personal Care</b> app on your phone, ` +
            `and you need to know how to clock in and clock out on it.</p>` +
            `<p><b>This is how you get paid.</b> Hours that are not clocked in and out correctly do not get ` +
            `paid, and we cannot fix that afterwards.</p>` +
            `<p>Ring us on ${OFFICE} and we will set it up with you over the phone. It takes ten minutes.</p>`)) continue
        }
      }
    }

    if (touched && !dry) {
      await admin.from('app_data')
        .upsert({ agency_id: row.agency_id, data_key: 'pipeline', data_value: list },
                { onConflict: 'agency_id,data_key' })
    }
  }

  return json(dry
    ? { ok: true, dry: true, quiet_hours: quiet, transfers_considered: (rows ?? []).length, would: plan }
    : { ok: true, quiet_hours: quiet, sent, actions: plan.length })
})
