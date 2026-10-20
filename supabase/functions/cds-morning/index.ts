// cds-morning: the CDS morning email, weekdays 8am Central, the Dashboard's
// "Do this first, every morning" list (same rules file as the page). Practice until
// setting morning_email.live is true. Office only. Logic: _shared/office/lead-alerts.js.
// Body {"force": true} sends one now regardless of the time (for a test). 2026-10-19.
import { jobs, scheduled } from '../_shared/office/server.ts';
Deno.serve(scheduled((b) => jobs.morning({ force: b.force === true })));
