/* CDS one-click fax (2026-10-25). Google Apps Script in zach@caringcds.com (her call:
 * Zach runs CDS, and faxes coming in to the office number already go to him).
 *
 * zach@caringcds.com is on the office eFax Protect account's Send Email Addresses, so
 * faxes asked for in the CDS hub ("Fax it now" on Tax & Enrollment Setup) are sent from here.
 * Every minute this script:
 *   1. asks the hub (cds-fax) for faxes waiting to go, emails each one to <number>@efaxsend.com
 *      with the signed form attached, and tells the hub it went (or why Gmail refused it);
 * and every 5 minutes it also:
 *   2. finds eFax's receipts, tells the hub whether each fax went through (with the receipt), then
 *      labels them "eFax" and takes them out of the inbox;
 *   3. finds faxes that came in to (417) 719-7870 and hands each one to the hub, where it stays on
 *      Today until someone marks it handled. These stay in the inbox, labelled "eFax".
 *    (The email to Zach is the one eFax already sends him; nothing extra lands in his inbox.)
 * When the hub's 'One-click fax' switch is off, the hub hands out nothing and takes nothing in.
 * It never deletes an email and never sends anything the hub did not ask for, only to eFax.
 * The hub key lives in Project Settings > Script Properties as FAX_KEY.
 * Setup: paste this file, add the key, then run setUp once and click Allow.
 * To see what eFax's emails look like here (sender and subject only), run look.
 */
var HUB = 'https://siivpekcaryeyttszwav.supabase.co/functions/v1/cds-fax';
var LABEL = 'eFax';
var EFAX = '(from:efax.com OR from:j2.com OR from:j2global.com OR from:efaxcorporate.com OR from:123mail.net OR from:consensus.com)';
var OUR_FAX_NUMBERS = ['5735221722'];   // Missouri Revenue, the only number the hub sends to

function setUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();
  if (!GmailApp.getUserLabelByName(LABEL)) GmailApp.createLabel(LABEL);
  var me = Session.getActiveUser().getEmail();
  if (me && me.toLowerCase() !== 'zach@caringcds.com') Logger.log('Careful: this script is in ' + me + '. eFax only accepts faxes sent from zach@caringcds.com.');
  var r = post({ kind: 'ping' });
  Logger.log(r.ok ? 'Ready. The hub accepted the key. One-click fax is ' + (r.live ? 'ON.' : 'OFF (turn it on in the hub when ready).') : 'The hub did not accept the key: ' + (r.error || 'unknown'));
}

function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    sendWaiting();
    if (new Date().getMinutes() % 5 === 0) readEfaxEmails();
  } finally { lock.releaseLock(); }
}

// 1. Faxes the hub has waiting.
function sendWaiting() {
  var r = post({ kind: 'next' });
  if (!r.ok || r.off || !r.faxes) return;
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  r.faxes.forEach(function (f) {
    try {
      var pdf = Utilities.newBlob(Utilities.base64Decode(f.pdf), 'application/pdf', f.filename);
      GmailApp.sendEmail(f.to, f.subject, f.body, { attachments: [pdf], name: 'Caring Companions CDS' });
      post({ kind: 'sent', id: f.id });
      Utilities.sleep(1500);
      GmailApp.search('in:sent subject:"' + f.token + '"', 0, 1).forEach(function (th) { th.addLabel(label); });
    } catch (e) {
      post({ kind: 'sent', id: f.id, error: String(e && e.message || e) });
    }
  });
}

// 2 and 3. eFax's receipts and incoming faxes.
function readEfaxEmails() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty('done') || '{}');
  var me = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var threads = GmailApp.search('(' + EFAX + ' OR "CDS-FAX-") -in:sent newer_than:3d', 0, 50);
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var id = m.getId();
      if (done[id]) return;
      if (me && m.getFrom().toLowerCase().indexOf(me) !== -1) { done[id] = Date.now(); return; }
      var subject = m.getSubject() || '';
      var text = subject + '\n' + (m.getPlainBody() || '').slice(0, 4000);
      var pdfs = m.getAttachments().filter(function (a) { return /pdf/i.test(a.getContentType()) || /\.pdf$/i.test(a.getName()); });
      var token = (text.match(/CDS-FAX-[a-z0-9]{8}/i) || [])[0] || '';
      var receipt = !!token || /transmission|receipt|confirmation|not sent|unsuccessful|delivery (status|report)|fax (was )?(sent|delivered)/i.test(subject);
      var r;
      if (receipt) {
        var to = '';
        OUR_FAX_NUMBERS.forEach(function (n) { if (!to && text.replace(/\D/g, '').indexOf(n) !== -1) to = n; });
        r = post({ kind: 'result', token: token, to: to, ok: verdict(text), text: subject + ' ' + (m.getPlainBody() || '').slice(0, 400),
          pdf: pdfs.length ? Utilities.base64Encode(pdfs[0].getBytes()) : '', gmailId: id });
        if (r.ok) { th.addLabel(label); if (r.matched) th.moveToArchive(); }
      } else if (pdfs.length && /fax/i.test(subject + ' ' + m.getFrom())) {
        var from = (subject.match(/\+?1?[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{4}/) || [])[0] || '';
        r = post({ kind: 'incoming', gmailId: id, from: from, subject: subject, receivedAt: m.getDate().toISOString(),
          pdf: Utilities.base64Encode(pdfs[0].getBytes()) });
        if (r.ok) th.addLabel(label);
        if (r.off) return;            // switch off: try again next time
      } else { r = { ok: true }; }
      if (r.ok) done[id] = Date.now();
    });
  });
  var keep = {}, cutoff = Date.now() - 7 * 864e5;
  Object.keys(done).forEach(function (id) { if (done[id] >= cutoff) keep[id] = done[id]; });
  props.setProperty('done', JSON.stringify(keep));
}

// true = went through, false = did not, null = the hub shows it for a person to check.
function verdict(text) {
  if (/unsuccessful|not successful|was not (sent|delivered)|could not be (sent|delivered)|fail(ed|ure)|no answer|busy signal|not a fax machine|error/i.test(text)) return false;
  if (/success|delivered|was sent|sent successfully|transmission (is )?complete/i.test(text)) return true;
  return null;
}

// Sender and subject of the latest eFax emails, so the patterns above can be checked. Nothing is sent.
function look() {
  GmailApp.search(EFAX + ' newer_than:30d', 0, 15).forEach(function (th) {
    var m = th.getMessages()[th.getMessageCount() - 1];
    Logger.log(m.getDate() + ' | ' + m.getFrom() + ' | ' + m.getSubject() + ' | ' + m.getAttachments().length + ' attachment(s)');
  });
}

function post(body) {
  var key = PropertiesService.getScriptProperties().getProperty('FAX_KEY');
  if (!key) return { ok: false, error: 'FAX_KEY is not set in Script Properties' };
  var res = UrlFetchApp.fetch(HUB, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
    headers: { 'x-fax-key': key }, muteHttpExceptions: true });
  try { return JSON.parse(res.getContentText()); } catch (e) { return { ok: false, error: 'HTTP ' + res.getResponseCode() }; }
}
