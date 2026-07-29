// Supabase Edge Function: tax-help   (deploy to the SHARED project, zngsgedlsxinbygwmxwn)
// -----------------------------------------------------------------------------
// The "ask a question" helper inside hub.caringcds.com/tax-training.html.
// Answers questions about the Missouri CDS consumer tax setup, grounded in the
// procedure the hub itself teaches, so staff get the same answer the training
// gives rather than generic internet tax advice.
//
// Lives on the SHARED project because ANTHROPIC_API_KEY is already a secret
// there. The CDS hub signs users in against the CDS project, so this validates
// the caller's CDS access token against the CDS project's auth API rather than
// trusting a shared token embedded in a public page.
//
// Deploy:
//   supabase functions deploy tax-help --no-verify-jwt --project-ref zngsgedlsxinbygwmxwn
// -----------------------------------------------------------------------------

const CDS_PROJECT = 'https://siivpekcaryeyttszwav.supabase.co'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const SYSTEM = `You are the tax setup helper inside Caring Companions CDS's internal hub. Your users are
Samantha (the owner) and her staff, who are working through Missouri Consumer Directed Services consumer
tax setup and an open DHSS EIN audit finding. They are not accountants.

WHAT YOU KNOW. Two separate tracks, and confusing them is the most common mistake:

1. THE DHSS AUDIT (deadline Aug 31 2026, internal target Aug 15). Requires exactly two things per participant:
   - Federal EIN AND Missouri Tax ID typed into Fusion, participant page, "HCBS Eligibility" section.
   - Acceptable proof uploaded to the participant's Documents tab under the "EIN Tax Documents" category.
   New participants: proof uploaded within 90 days of the CDS start date. "New" means not yet authorized for
   CDS in their CURRENT case.
   Accepted proof of the FEDERAL EIN: CP 575 letter, 147C letter, Form 940, Form 941, 8109 tax coupon, an IRS
   letter showing the tax ID and legal name, or any IRS document with the legal name and number PREPRINTED.
   Accepted proof of the MISSOURI EIN/TIN: a copy of the MO Department of Revenue notice, MO 941, or MO W-3.
   NEVER acceptable: a W-9, or anything computer-printed or typed by us.
   Two exemptions: one document showing BOTH numbers covers both; and no upload is needed where a PREVIOUS
   CDS vendor already uploaded proof to that case record.
   Non-compliant records are referred to MMAC.

2. PAYROLL AGENT SETUP (not audited, but legally required to run payroll): IRS 8821, IRS 2678, MO 2643A,
   MO 2827, and DES/UInteract registration.

KEY FACTS:
- The consumer is the employer. The EIN and MO Tax ID belong to THE CONSUMER, not to Caring Companions, and
  they transfer with the consumer if they change agencies.
- Federal EIN: apply online at irs.gov (EIN Assistant), weekdays roughly 7am-10pm Eastern, issued immediately.
  Entity type Individual/Sole Proprietor, reason "hired employees", using the consumer's SSN, legal name and
  home address. Save and print the confirmation before closing; you cannot return to that session.
- CP 575 is issued ONCE at assignment and never reissued. If lost, the replacement is a 147C letter, obtained
  by calling the IRS Business and Specialty Tax Line on 800-829-4933; they can often fax it during the call.
  The IRS will not release it without authorization on file (8821 or 2678).
- Forms 8821 and 2678 may require original wet signatures. 2678 needs IRS approval before the first payroll
  run, which can take several weeks.
- MO 2643A registers Missouri withholding, submitted at dor.mo.gov, and needs the federal EIN first.
  Questions: 573-751-5860 or businesstaxregister@dor.mo.gov. MO 2827 is the Missouri power of attorney.
- DES/UInteract CANNOT be done until after the first payroll AND the consumer has paid $1,000+ in wages in a
  single quarter. New consumer: register at uinteract.labor.mo.gov. Transferred consumer: email MODES-5083 to
  cdstax@labor.mo.gov (email only, not mail or fax). Quarterly wage report deadlines: Apr 30, Jul 30, Oct 31,
  Jan 31. Contact cdstax@labor.mo.gov or 573-751-1995 opt 1.
- Fusion account and login problems go to HCBS.Systems@health.mo.gov. Questions about the audit finding go to
  QIQA@health.mo.gov.
- Empeon (their payroll system) currently carries the placeholder FEIN 12-3456789 for several consumers. That
  is a dummy number, not an assigned EIN. Treat those consumers as having no EIN.

HOW TO ANSWER:
- Be direct and specific. Give the exact site, phone number, form number or menu path.
- Short answers. Two or three sentences for simple questions. Use a short numbered list for procedures.
- If something is a policy judgement call rather than a documented rule, say so and tell them to confirm with
  QIQA@health.mo.gov in writing. Never invent a rule or a deadline.
- One genuinely open question: whether a filed 941 satisfies the EIN Tax Documents requirement, given the
  policy lists 941 as acceptable but also says computer-printed forms are not. If asked, explain the tension
  honestly and recommend getting QIQA's answer in writing.
- You are not a tax adviser and must not give tax advice, prepare filings, or opine on tax liability. For
  anything beyond this documented procedure, tell them to speak to their accountant.
- Never ask for or repeat a Social Security number. If a user pastes one, tell them not to and do not echo it.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  // Validate the caller against the CDS project's auth API. The training page is
  // public, so there is no shared secret in it to trust.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Sign in to the CDS hub first.' }, 401)
  try {
    const who = await fetch(`${CDS_PROJECT}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: jwt },
    })
    if (!who.ok) return json({ error: 'Your session expired. Reload the hub and sign in again.' }, 401)
  } catch {
    return json({ error: 'Could not verify your sign-in.' }, 503)
  }

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ configured: false, error: 'The help assistant is not configured yet.' })

  const body = await req.json().catch(() => ({}))
  const raw = (body as { messages?: { role: string; content: string }[] }).messages
  if (!Array.isArray(raw) || !raw.length) return json({ error: 'No question was sent.' }, 400)

  const messages = raw
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 700,
        system: SYSTEM,
        messages,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('Anthropic error', res.status, detail.slice(0, 300))
      return json({ error: 'The help assistant could not answer just now. Try again shortly.' }, 502)
    }
    const data = await res.json()
    return json({ reply: data.content?.[0]?.text ?? '' })
  } catch (e) {
    console.error('tax-help failed', (e as Error).message)
    return json({ error: 'The help assistant could not answer just now.' }, 502)
  }
})
