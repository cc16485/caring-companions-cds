// CDS Hub · Marketing (2026-11-05, Samantha: "I dont want this to get lost, please put somewhere in the cds subaccount in a
// marketing materials page/tab - i want to also add any photos or videos we have made for CDS"). window.CDSMarketing.
// One place for the CDS marketing we have made: the live sign-up links, the Get Paid to Care ads with their text, the
// videos, the photos, texts for leads, a Facebook post and the flyer QR code. Every file has a Download button; every
// piece of text has a Copy button. The files live in marketing/media (public, like the websites). Nothing is sent.
// To add something new: put the file in marketing/media and add a line to the lists below. No em dashes.
(function (root) {
  'use strict';
  const M = 'marketing/media/';
  const START = 'https://caringcds.com/start/';
  const utm = (src, med, content) => START + '?utm_source=' + src + '&utm_medium=' + med + '&utm_campaign=get_paid_to_care' + (content ? '&utm_content=' + content : '');

  const SIGNUP = [
    ['The sign-up page (asks first: help someone, or need help myself)', START],
    ['Caregiver path only (family member or friend who would be paid)', START + '?for=care'],
    ['Consumer path only (the person who needs help, for referral partners)', START + '?for=self'],
    ['Privacy Policy', 'https://caringcds.com/privacy/'],
  ];
  const VIDEOS = [
    { title: 'Get Paid to Care', file: 'get-paid-to-care.mp4', poster: 'get-paid-to-care-poster.jpg', made: 'Oct 16, 2026', size: '1080 by 1920, for Reels, Stories and TikTok',
      about: 'Samantha’s voice. Family can be the paid CDS caregiver, $15 to $16 an hour, with the pay calculator.' },
    { title: 'CDS Caregiver Directory', file: 'caregiver-directory.mp4', poster: 'caregiver-directory-poster.jpg', made: 'Oct 16, 2026', size: '1080 by 1080, for the Facebook feed',
      about: 'Samantha’s voice. Families without a caregiver can ask us to help find one at findcdscaregivers.com.' },
    { title: 'YouTube: How to Get Paid to Care for a Family Member in Missouri', file: 'youtube-get-paid-step-by-step.mp4', poster: 'youtube-get-paid-step-by-step-poster.jpg', made: 'Nov 8, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 5 minutes. Who can be paid, all 8 steps and caregiver pay. On the CDS YouTube channel Thursday, Dec 3 at 5 pm.' },
    { title: 'YouTube: What Is Consumer Directed Services? You’re the Boss', file: 'youtube-what-is-cds.mp4', poster: 'youtube-what-is-cds-poster.jpg', made: 'Nov 8, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 3 minutes. Who qualifies, what the caregiver helps with, being the employer and what we handle. On the CDS YouTube channel Thursday, Dec 17 at 5 pm.' },
    { title: 'YouTube: Who Can Be a Paid Caregiver in Missouri CDS?', file: 'youtube-who-can-be-paid.mp4', poster: 'youtube-who-can-be-paid-poster.jpg', made: 'Nov 8, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 3.5 minutes. Who can and cannot be paid, the guardian rule, what to do when it is the spouse, and the caregiver profile. On the CDS YouTube channel Thursday, Dec 31 at 5 pm.' },
    { title: 'YouTube: Your First Paycheck as a Missouri CDS Caregiver', file: 'youtube-first-paycheck.mp4', poster: 'youtube-first-paycheck-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 3 minutes. Hiring paperwork, the registry, orientation, clocking in, the correction form and how payday works. On the CDS YouTube channel Thursday, Jan 14 at 5 pm.' },
    { title: 'YouTube: Why Every CDS Family Needs a Backup Caregiver', file: 'youtube-backup-caregiver.mp4', poster: 'youtube-backup-caregiver-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 2.5 minutes. Why a backup caregiver matters and how Find CDS Caregivers helps families meet one. On the CDS YouTube channel Thursday, Jan 28 at 5 pm.' },
    { title: 'YouTube: How to Make Your Caregiver Profile on Find CDS Caregivers', file: 'youtube-caregiver-profile.mp4', poster: 'youtube-caregiver-profile-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 2.5 minutes. A screen-by-screen walk-through of the caregiver profile (example data). Good to send to caregivers who want the work. On the CDS YouTube channel Thursday, Feb 11 at 5 pm.' },
    { title: 'YouTube: Switching CDS Agencies in Missouri', file: 'youtube-switching.mp4', poster: 'youtube-switching-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 2.5 minutes. What stays the same when a family switches to us, what can change, and how the switch goes. On the CDS YouTube channel Thursday, Feb 25 at 5 pm.' },
    { title: 'YouTube: What a Missouri CDS Caregiver Can and Can’t Do', file: 'youtube-can-and-cant.mp4', poster: 'youtube-can-and-cant-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 3 minutes. The plan of care, who you help, what to do when asked for more, supplies, the hours limit. Good to send to new attendants. On the CDS YouTube channel Thursday, Mar 11 at 5 pm.' },
    { title: 'YouTube: Orienting Your CDS Caregiver, the 8 Topics', file: 'youtube-orientation-8-topics.mp4', poster: 'youtube-orientation-8-topics-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 3 minutes. All 8 topics Missouri asks the employer to cover with a new caregiver. Good to send new consumers before orientation. On the CDS YouTube channel Thursday, Mar 25 at 5 pm.' },
    { title: 'YouTube: Recording Time Honestly, What Counts as Medicaid Fraud', file: 'youtube-recording-time.mp4', poster: 'youtube-recording-time-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 3 minutes. What counts as falsification, why “they told me to” is not a defense, and how honest mistakes get fixed. Good to send to every attendant. On the CDS YouTube channel Thursday, Apr 8 at 5 pm.' },
    { title: 'YouTube: Emergencies and Reporting, What Every CDS Caregiver Should Know', file: 'youtube-emergencies-reporting.mp4', poster: 'youtube-emergencies-reporting-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 2.5 minutes. Mandated reporting, the DHSS hotline, what to report, and what to do in an emergency. Good to send to every attendant. On the CDS YouTube channel Thursday, Apr 22 at 5 pm.' },
    { title: 'YouTube: Professional Basics for CDS Caregivers', file: 'youtube-professional-basics.mp4', poster: 'youtube-professional-basics-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 2.5 minutes. Showing up, call-offs, dignity, boundaries and privacy. Good to send to new attendants. On the CDS YouTube channel Thursday, May 6 at 5 pm.' },
    { title: 'YouTube: Clocking In the Right Way', file: 'youtube-clocking-in.mp4', poster: 'youtube-clocking-in-poster.jpg', made: 'Nov 9, 2026', size: '1920 by 1080, for YouTube and the website',
      about: 'Samantha’s voice, 2.5 minutes. The app or the home phone, the habits that protect pay, and the correction form deadline. Good to send to every attendant. On the CDS YouTube channel Thursday, May 20 at 5 pm.' },
  ];
  // Weekly Reels (2026-11-08, Samantha: push findcdscaregivers.com, find a caregiver or a backup caregiver, recruit caregivers to
  // build profiles, weekly videos). Scheduled in Blotato on the CDS Facebook Page, Wednesdays 6 pm. Her voice, real screens.
  // Files here are 720 by 1280 copies; full size masters are in ~/Claude/Projects/cds-facebook-daily/videos.
  const REELS = [  // [Facebook date, title, who it is for, seconds]
    ['2026-11-25', "Build your caregiver profile in about 10 minutes", "Caregivers: create your profile at findcdscaregivers.com", 25],
    ['2026-12-02', "Greene County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2026-12-09', "Caregivers wanted in Jasper County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2026-12-16', "Taney County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2026-12-23', "Every CDS family needs a backup caregiver", "Families: find a caregiver or a backup caregiver", 26],
    ['2026-12-30', "Caregivers wanted in Christian County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2027-01-06', "Newton County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 26],
    ['2027-01-13', "Caregivers wanted in Laclede County", "Caregivers: create your profile at findcdscaregivers.com", 25],
    ['2027-01-20', "Meet a caregiver before you decide", "Families: find a caregiver or a backup caregiver", 26],
    ['2027-01-27', "Phelps County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2027-02-03', "Caregivers wanted in Polk County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2027-02-10', "Pulaski County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2027-02-17', "Record a short intro video for families", "Caregivers: create your profile at findcdscaregivers.com", 22],
    ['2027-02-24', "Caregivers wanted in Barry County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2027-03-03', "Lawrence County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 26],
    ['2027-03-10', "Caregivers wanted in Camden County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2027-03-17', "The state screening, explained", "Caregivers: create your profile at findcdscaregivers.com", 21],
    ['2027-03-24', "Stone County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 26],
    ['2027-03-31', "Caregivers wanted in Webster County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2027-04-07', "Texas County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2027-04-14', "Get paid to care for a loved one", "Families: find a caregiver or a backup caregiver", 27],
    ['2027-04-21', "Caregivers wanted in Vernon County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2027-04-28', "Wright County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 26],
    ['2027-05-05', "Caregivers wanted in Dallas County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2027-05-12', "You're the boss in CDS", "Families: find a caregiver or a backup caregiver", 17],
    ['2027-05-19', "McDonald County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2027-05-26', "Caregivers wanted in Benton County", "Caregivers: create your profile at findcdscaregivers.com", 23],
    ['2027-06-02', "Douglas County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2027-06-09', "Fill-in caregiving that fits your life", "Caregivers: create your profile at findcdscaregivers.com", 19],
    ['2027-06-16', "Caregivers wanted in Cedar County", "Caregivers: create your profile at findcdscaregivers.com", 24],
    ['2027-06-23', "Barton County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2027-06-30', "Caregivers wanted in St. Clair County", "Caregivers: create your profile at findcdscaregivers.com", 23],
    ['2027-07-07', "Already in CDS? You can switch.", "Families: find a caregiver or a backup caregiver", 23],
    ['2027-07-14', "Dade County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2027-07-21', "Caregivers wanted in Hickory County", "Caregivers: create your profile at findcdscaregivers.com", 23],
    ['2027-07-28', "Ozark County: find a caregiver or a backup caregiver", "Families: find a caregiver or a backup caregiver", 25],
    ['2027-08-04', "Caregivers wanted in Greene County", "Caregivers: create your profile at findcdscaregivers.com", 24],
  ];
  const ADS = [
    { key: 'ad1', name: 'Get paid to care', files: ['ad1-get-paid-square.jpg', 'ad1-get-paid-story.jpg'],
      primary: "In Missouri's CDS program, the person who needs help at home chooses their own caregiver. That can be a son, daughter, grandchild, other relative or friend.\n\nCaring Companions pays CDS caregivers $15 to $16 an hour, every Thursday, and handles the payroll taxes.\n\nAnswer a few quick questions to see if your family may qualify. It takes about 2 minutes.",
      headline: 'Get paid to care for someone you love', desc: '27 Southwest Missouri counties' },
    { key: 'ad2', name: 'Payday Thursday', files: ['ad2-thursday-square.jpg', 'ad2-thursday-story.jpg'],
      primary: "Payday is every Thursday.\n\nCDS caregivers with Caring Companions earn $15 to $16 an hour, paid by direct deposit or pay card. Taxes are withheld and you get a W-2, so there is no year-end surprise.\n\nThe person you care for needs MO HealthNet, and the state decides their hours. See if you qualify in about 2 minutes.",
      headline: 'Weekly pay for family caregivers', desc: 'Missouri CDS with Caring Companions' },
    { key: 'ad3', name: 'Family can be paid', files: ['ad3-family-square.jpg'],
      primary: "Missouri lets adults with MO HealthNet who need help at home choose a family member or friend as their paid caregiver through CDS.\n\nWe run payroll and taxes, set up clock-in with you before the first shift, and our Springfield team answers the phone.\n\nSee if your family may qualify in about 2 minutes.",
      headline: 'Family and friends can be the paid caregiver', desc: 'Weekly pay, every Thursday' },
    { key: 'ad4', name: 'They stay in charge', files: ['ad4-in-charge-square.jpg'],
      primary: "In CDS, your loved one stays the boss. They choose their caregiver and set the schedule.\n\nYou get paid $15 to $16 an hour, every Thursday, for the approved hours you work.\n\nAnswer a few quick questions to see if they may qualify.",
      headline: 'They stay in charge. You get paid to help.', desc: '27 Southwest Missouri counties' },
  ];
  const PHOTOS = [
    ['photo-g-garden.jpg', 'A walk in the garden'], ['photo-m-mom-charge.jpg', 'Mom stays in charge'], ['photo-p-phone.jpg', 'Looking at the phone together'],
    ['photo-k-kitchen.jpg', 'Help in the kitchen'], ['photo-d-dressing.jpg', 'Help getting dressed'], ['photo-t-tired.jpg', 'A tired caregiver with the bills'],
  ];
  const LINKS = [
    ['Facebook ad 1 (Get paid to care)', utm('facebook', 'paid', 'ad1')], ['Facebook ad 2 (Payday Thursday)', utm('facebook', 'paid', 'ad2')],
    ['Facebook ad 3 (Family can be paid)', utm('facebook', 'paid', 'ad3')], ['Facebook ad 4 (They stay in charge)', utm('facebook', 'paid', 'ad4')],
    ['Instagram ads (swap ad1 to ad4 at the end)', utm('instagram', 'paid', 'ad1')], ['Facebook or Instagram post (not paid)', utm('facebook', 'social')],
    ['Google Business Profile post', utm('google', 'gbp')], ['caringcds.com home page button', utm('caringcds', 'site', 'home')],
    ['mo-care.com CDS town pages', utm('mo-care', 'referral')], ['Text to a lead (not in the hub)', utm('text', 'sms')],
    ['Email signature', utm('email', 'signature')], ['Printed flyer (QR code)', utm('flyer', 'print')],
  ];
  const TEXTS = [
    ['Someone asked about getting paid to care for family', "Hi [their name], this is [your name] with Caring Companions CDS. Thank you for asking about getting paid to care for [loved one's name]. These few questions take about 2 minutes and make our call much shorter: " + utm('text', 'sms', 'asked') + "\nReply STOP to opt out."],
    ['Someone who needs help themself', "Hi [their name], this is [your name] with Caring Companions CDS. Thank you for asking about care at home through CDS. These few questions take about 2 minutes and make our call much shorter: " + START + "?for=self&utm_source=text&utm_medium=sms&utm_campaign=get_paid_to_care&utm_content=self\nReply STOP to opt out."],
    ['After a missed call or voicemail', "Hi [their name], this is [your name] with Caring Companions CDS returning your call. I would love to help. If it is easier, you can answer a few quick questions here and I will call you back: " + utm('text', 'sms', 'missed_call') + "\nReply STOP to opt out."],
    ['An older lead, one last check-in', "Hi [their name], this is [your name] with Caring Companions CDS. I have not forgotten about you and [loved one's name]. If CDS is still on your mind, this takes about 2 minutes: " + utm('text', 'sms', 'check_in') + " I will make this my last check-in for now.\nReply STOP to opt out."],
  ];
  const POST = "Did you know? In Missouri, adults with MO HealthNet who need help at home can choose a family member or friend as their paid caregiver through the CDS program.\n\nWith Caring Companions, CDS caregivers earn $15 to $16 an hour, paid every Thursday, and we handle the payroll taxes.\n\nServing 27 Southwest Missouri counties. See if your family may qualify in about 2 minutes: " + utm('facebook', 'social', 'post1');
  const RULES = [
    ['Choose the Employment special ad category.', 'These ads offer paid caregiver work, so Meta will likely require it. No targeting by age, gender or ZIP code. Target by location (the 27 counties or a radius around towns), at least 15 miles.'],
    ['Never say the viewer has a condition.', 'Meta rejects lines like “Is your mom disabled?” or “Are you on Medicaid?”. The ad text here talks about the program, not the viewer.'],
    ['No bonuses or gifts.', 'Missouri Medicaid rules bar incentives for signing up or for referrals. Offers are pay for hours worked, nothing more.'],
    ['Use the tracked link for each ad.', 'Each sign-up then shows on the CDS Leads tab with where it came from.'],
    ['No Facebook pixel on caringcds.com yet.', 'Facebook can count clicks but not finished sign-ups. Adding the pixel later also means a line on the Privacy page.'],
  ];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const copyBtn = t => '<button type="button" class="mk-copy" data-copy="' + esc(t) + '">Copy</button>';
  const dl = (file, label) => '<a class="mk-dl" href="' + M + esc(file) + '" download="' + esc(file) + '">' + (label || 'Download') + '</a>';
  const field = (label, text, cls) => '<div class="mk-field"><div class="mk-lbl">' + esc(label) + ' ' + copyBtn(text) + '</div><p class="mk-val' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</p></div>';

  function html() {
    return '<div class="mk">' +
      '<div class="mk-head"><h2>Marketing</h2><p>Everything we have made to market CDS, in one place. Download the files, copy the text, and use the tracked links so each sign-up shows where it came from on Leads.</p>' +
      '<nav>' + [['mk-signup', 'Sign-up links'], ['mk-videos', 'Videos'], ['mk-reels', 'Weekly Reels'], ['mk-ads', 'Ads'], ['mk-photos', 'Photos'], ['mk-texts', 'Texts for leads'], ['mk-post', 'A post'], ['mk-flyer', 'Flyer QR'], ['mk-links', 'Tracked links'], ['mk-rules', 'Facebook rules']]
        .map(([id, l]) => '<a href="#" data-mk-go="' + id + '">' + l + '</a>').join('') + '</nav></div>' +

      '<section id="mk-signup"><h3>Sign-up links</h3><div class="mk-card">' + SIGNUP.map(([l, u]) => field(l, u, 'mk-url')).join('') + '</div></section>' +

      '<section id="mk-videos"><h3>Videos</h3><div class="mk-grid mk-grid2">' + VIDEOS.map(v =>
        '<div class="mk-card"><video controls preload="none" playsinline poster="' + M + esc(v.poster) + '" src="' + M + esc(v.file) + '"></video>' +
        '<b class="mk-title">' + esc(v.title) + '</b><p class="mk-note">' + esc(v.about) + '</p><p class="mk-note">' + esc(v.size) + '. Made ' + esc(v.made) + '.</p>' + dl(v.file, 'Download video') + '</div>').join('') + '</div></section>' +

      '<section id="mk-reels"><h3>Weekly Reels for Facebook</h3><p class="mk-note">' + REELS.length + ' short videos, scheduled on the Caring Companions CDS Facebook Page every Wednesday at 6 pm. Samantha’s voice and real findcdscaregivers.com screens; screens with made-up people say Example. Each is also fine for Instagram, Stories or TikTok.</p><div class="mk-grid mk-grid3">' + REELS.map(([d, t, who, sec]) => {
        const f = 'reel-' + d + '.mp4', when = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        return '<div class="mk-card"><video controls preload="none" playsinline poster="' + M + 'reel-' + esc(d) + '-poster.jpg" src="' + M + esc(f) + '"></video>' +
          '<b class="mk-title">' + esc(t) + '</b><p class="mk-note">' + esc(who) + '. ' + esc(sec) + ' seconds. On Facebook ' + esc(when) + '.</p>' + dl(f, 'Download video') + '</div>'; }).join('') + '</div></section>' +

      '<section id="mk-cover"><h3>Page covers</h3><p class="mk-note">Made Nov 8, 2026 to match the new caringcds.com. Words and faces stay in the middle so phones and wide screens do not cut them off.</p><div class="mk-grid">' +
        '<figure class="mk-card"><img loading="lazy" src="' + M + 'facebook-cover.jpg" alt="Facebook page cover: Get paid to care for a loved one"><figcaption>Facebook cover, 1640 by 624 ' + dl('facebook-cover.jpg') + '</figcaption></figure>' +
        '<figure class="mk-card"><img loading="lazy" src="' + M + 'pinterest-cover.jpg" alt="Pinterest profile cover: Get paid to care for a loved one"><figcaption>Pinterest cover, 1920 by 1080 ' + dl('pinterest-cover.jpg') + '</figcaption></figure>' +
        '<figure class="mk-card"><img loading="lazy" src="' + M + 'youtube-banner.jpg" alt="YouTube channel banner: Get paid to care for a loved one"><figcaption>YouTube banner, 2560 by 1440 ' + dl('youtube-banner.jpg') + '</figcaption></figure>' +
        '<figure class="mk-card"><img loading="lazy" src="' + M + 'youtube-picture.png" alt="YouTube channel picture: Caring Companions CDS logo"><figcaption>YouTube channel picture, 512 by 512 ' + dl('youtube-picture.png') + '</figcaption></figure></div></section>' +

      '<section id="mk-ads"><h3>Facebook and Instagram ads</h3>' + ADS.map(a =>
        '<div class="mk-card mk-ad"><div class="mk-adimgs">' + a.files.map(f => '<figure><img loading="lazy" src="' + M + esc(f) + '" alt="' + esc(a.name) + ' ad"><figcaption>' + (/story/.test(f) ? 'Story 1080 by 1920' : 'Square 1080 by 1080') + ' ' + dl(f) + '</figcaption></figure>').join('') + '</div>' +
        '<div class="mk-adtxt"><b class="mk-title">' + esc(a.key.toUpperCase()) + ': ' + esc(a.name) + '</b>' + field('Primary text', a.primary, 'mk-pre') + field('Headline', a.headline) + field('Description', a.desc) +
        field('Website link', utm('facebook', 'paid', a.key), 'mk-url') + '<p class="mk-note">Button: Apply now (or Learn more)</p></div></div>').join('') + '</section>' +

      '<section id="mk-photos"><h3>Photos</h3><p class="mk-note">From the Get Paid to Care video. 1080 by 1920.</p><div class="mk-grid mk-grid3">' + PHOTOS.map(([f, l]) =>
        '<figure class="mk-card"><img loading="lazy" src="' + M + esc(f) + '" alt="' + esc(l) + '"><figcaption>' + esc(l) + ' ' + dl(f) + '</figcaption></figure>').join('') + '</div></section>' +

      '<section id="mk-texts"><h3>Texts for leads</h3><p class="mk-note">For a lead already in the hub, use Send the sign-up questions on their lead instead, so their answers land on their profile. These are for people not in the hub yet. A person always presses Send.</p>' +
        TEXTS.map(([l, t]) => '<div class="mk-card">' + field(l, t, 'mk-pre') + '</div>').join('') + '</section>' +

      '<section id="mk-post"><h3>A post for the Facebook page</h3><div class="mk-card">' + field('Post text', POST, 'mk-pre') + '</div></section>' +

      '<section id="mk-flyer"><h3>QR code for printed flyers</h3><div class="mk-card mk-qr"><div id="mkQr"></div><div><p class="mk-note">Scans to the sign-up with the flyer tracking link. Right-click the code to save it.</p><p class="mk-val mk-url">' + esc(utm('flyer', 'print')) + '</p></div></div></section>' +

      '<section id="mk-links"><h3>Tracked links for every place</h3><div class="mk-card">' + LINKS.map(([l, u]) => field(l, u, 'mk-url')).join('') + '</div></section>' +

      '<section id="mk-rules"><h3>Facebook rules, so the ads get approved</h3><div class="mk-card">' + RULES.map(([b, t]) => '<p class="mk-rule"><b>' + esc(b) + '</b> ' + esc(t) + '</p>').join('') + '</div></section>' +
    '</div>';
  }

  let wired = false;
  function render() {
    const host = document.getElementById('mkBody');
    if (!host) return;
    if (!host.dataset.done) { host.innerHTML = html(); host.dataset.done = '1'; qr(); }
    if (wired) return;
    wired = true;
    host.addEventListener('click', ev => {
      const go = ev.target.closest('[data-mk-go]');
      if (go) { ev.preventDefault(); const el = document.getElementById(go.dataset.mkGo); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const b = ev.target.closest('.mk-copy');
      if (!b) return;
      const t = b.getAttribute('data-copy');
      const done = w => { b.textContent = w; b.classList.add('ok'); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('ok'); }, 1600); };
      const pick = () => { const v = b.closest('.mk-field').querySelector('.mk-val'); const r = document.createRange(); r.selectNodeContents(v); const s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Selected'); };
      try { navigator.clipboard.writeText(t).then(() => done('Copied'), pick); } catch { pick(); }
    });
  }
  // The QR code is drawn in the page from the tracking link (cdnjs qrcodejs), so it is never out of date.
  function qr() {
    const box = document.getElementById('mkQr');
    if (!box) return;
    const draw = () => { try { box.innerHTML = ''; new root.QRCode(box, { text: utm('flyer', 'print'), width: 180, height: 180, colorDark: '#14304d', colorLight: '#ffffff' }); } catch { box.textContent = 'The QR code could not be drawn here.'; } };
    if (root.QRCode) return draw();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = draw; s.onerror = () => { box.textContent = 'The QR code could not load. Check the connection.'; };
    document.head.appendChild(s);
  }
  root.CDSMarketing = { render, VIDEOS, REELS, ADS, PHOTOS, LINKS, TEXTS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
