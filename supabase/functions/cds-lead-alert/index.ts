// cds-lead-alert: every 2 minutes, office alerts for new CDS website leads.
// Email at once, text in text hours, one reminder text after 30 minutes if nobody
// has called. Practice until setting lead_alerts.live is true. Office only; never
// contacts the lead. Logic: _shared/office/lead-alerts.js. 2026-10-19.
// Then (2026-10-20) each website lead is linked to, or added as, a plain GoHighLevel contact
// (name, phone, email only). Practice until setting lead_ghl.live. Logic: lead-ghl.js.
// Then (2026-10-31) every website form: caregiver sign-ups into GoHighLevel, findcdscaregivers families
// onto Leads, one note on each contact. Practice until setting lead_forms.live. Logic: lead-forms.js.
import { jobs, leadForms, leadGhl, scheduled } from '../_shared/office/server.ts';
Deno.serve(scheduled(async () => {
  const alerts = await jobs.run();
  let ghl: unknown;
  try { ghl = await leadGhl.run(); } catch (e) { ghl = { ok: false, error: String((e as Error)?.message || e) }; }
  let forms: unknown;
  try { forms = await leadForms.run(); } catch (e) { forms = { ok: false, error: String((e as Error)?.message || e) }; }
  return { ...alerts, ghl, forms };
}));
