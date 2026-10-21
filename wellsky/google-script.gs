/* CDS WellSky email reports (2026-10-21). Google Apps Script in samantha@mo-care.com.
 *
 * WellSky Analytics emails two reports every day at 6:00am Central (from
 * noreply-analytics-scheduler@clearcaremail.com, subject = the report name, a CSV zip
 * attached). This script runs at about 6:20am and again about 7:30am. Each run it:
 *   1. finds those emails from the last two days that it has not handed over yet,
 *   2. unzips the attachment and posts the CSV files to the CDS hub (cds-wellsky),
 *   3. once the hub says it saved it, notes the email as handed over, labels the
 *      conversation "WellSky reports" and takes it out of the inbox. An email the hub
 *      could not take is tried again on the next run.
 * On the 7:30 run, a report that has not come today is reported to the hub, which shows
 * it in red on the Dashboard (no silent failures).
 *
 * It never sends an email and never changes anything in WellSky.
 * The hub key lives in Project Settings > Script Properties as WELLSKY_GOOGLE_KEY.
 * Setup: paste this file, add the key, then run setUp once and click Allow.
 */
var HUB = 'https://siivpekcaryeyttszwav.supabase.co/functions/v1/cds-wellsky';
var SENDER = 'noreply-analytics-scheduler@clearcaremail.com';
var REPORTS = ['First and Last Carelog', 'Authorization Care Logs'];
var LABEL = 'WellSky reports';

function setUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('morning').timeBased().atHour(6).nearMinute(20).everyDays(1).inTimezone('America/Chicago').create();
  ScriptApp.newTrigger('lateCheck').timeBased().atHour(7).nearMinute(30).everyDays(1).inTimezone('America/Chicago').create();
  GmailApp.createLabel(LABEL);
  var r = post({ kind: 'ping' });
  Logger.log(r.ok ? 'Ready. The hub accepted the key.' : 'The hub did not accept the key: ' + (r.error || r.why || 'unknown'));
  morning();
}

function morning() { handOver(false); }
function lateCheck() { handOver(true); }

function handOver(late) {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var gotToday = {};
  var props = PropertiesService.getScriptProperties();
  var handled = JSON.parse(props.getProperty('handled') || '{}');   // message id -> day, so each email is handed over once
  REPORTS.forEach(function (name) {
    // Oldest first, so the newest report is always the one the hub keeps.
    var list = [];
    GmailApp.search('from:' + SENDER + ' subject:"' + name + '" newer_than:2d').forEach(function (th) {
      th.getMessages().forEach(function (m) { if (m.getSubject().trim() === name) list.push({ th: th, m: m }); });
    });
    list.sort(function (a, b) { return a.m.getDate() - b.m.getDate(); });
    list.forEach(function (x) {
      var th = x.th, m = x.m;
      var day = Utilities.formatDate(m.getDate(), 'America/Chicago', 'yyyy-MM-dd');
      if (handled[m.getId()]) { if (day === today) gotToday[name] = true; return; }
      var files = [];
      m.getAttachments().forEach(function (a) {
        if (!/\.zip$/i.test(a.getName())) return;
        Utilities.unzip(a.copyBlob().setContentType('application/zip')).forEach(function (f) {
          if (/\.csv$/i.test(f.getName())) files.push({ name: f.getName(), text: f.getDataAsString('UTF-8') });
        });
      });
      var r = post({ kind: 'analytics', report: name, received: m.getDate().toISOString(), files: files });
      if (r.ok) {
        handled[m.getId()] = day;
        th.addLabel(label); th.moveToArchive();
        if (day === today) gotToday[name] = true;
      } else {
        Logger.log(name + ': the hub could not take it: ' + (r.why || r.error));
      }
    });
  });
  var keep = {}, cutoff = Utilities.formatDate(new Date(Date.now() - 7 * 864e5), 'America/Chicago', 'yyyy-MM-dd');
  Object.keys(handled).forEach(function (id) { if (handled[id] >= cutoff) keep[id] = handled[id]; });
  props.setProperty('handled', JSON.stringify(keep));
  if (late) {
    REPORTS.forEach(function (name) {
      if (!gotToday[name]) post({ kind: 'analytics_missing', report: name, why: 'The "' + name + '" email from WellSky did not arrive by 7:30am (or the hub could not read it).' });
    });
  }
}

function post(body) {
  var key = PropertiesService.getScriptProperties().getProperty('WELLSKY_GOOGLE_KEY');
  if (!key) return { ok: false, error: 'WELLSKY_GOOGLE_KEY is missing from Script Properties' };
  var res = UrlFetchApp.fetch(HUB, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
                                     headers: { 'x-wellsky-key': key }, muteHttpExceptions: true });
  try { return JSON.parse(res.getContentText()); } catch (e) { return { ok: false, error: 'the hub answered ' + res.getResponseCode() }; }
}
