// cds-lead-alert: every 2 minutes, office alerts for new CDS website leads.
// Email at once, text in text hours, one reminder text after 30 minutes if nobody
// has called. Practice until setting lead_alerts.live is true. Office only; never
// contacts the lead. Logic: _shared/office/lead-alerts.js. 2026-10-19.
import { jobs, scheduled } from '../_shared/office/server.ts';
Deno.serve(scheduled(() => jobs.run()));
