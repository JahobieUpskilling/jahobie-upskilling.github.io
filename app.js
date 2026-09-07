/* =========================================================================
   ABC Tutoring — browse, compare, and book a tutor.

   Everything runs in the browser: the schedule is generated from each tutor's
   weekly availability in tutors.js, and bookings are kept in localStorage so a
   booked hour stays booked after a refresh. There is no backend, so a booking
   here is a simulated request that Dana would confirm by email.

   Sections below:
     1. Constants and small helpers
     2. Storage (bookings in localStorage)
     3. Schedule (open hours per tutor)
     4. Telemetry (PostHog custom events)
     5. Tutor list rendering and filtering
     6. Booking panel: profile -> time -> details -> confirmation
     7. My bookings and cancellation
     8. Boot
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     1. Constants and helpers
     --------------------------------------------------------------------- */

  var TUTORS = window.ABC_TUTORS || [];
  var GRADES = window.ABC_GRADES || [];
  var STORAGE_KEY = 'abc-tutoring:bookings:v1';
  var CONTACT_KEY = 'abc-tutoring:last-contact:v1';
  var SCHEDULE_DAYS = 14;      // how far ahead parents can book
  var LEAD_TIME_HOURS = 2;     // no booking an hour that starts within 2 hours
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function tutorById(id) {
    for (var i = 0; i < TUTORS.length; i++) if (TUTORS[i].id === id) return TUTORS[i];
    return null;
  }

  function gradeLabel(value) {
    for (var i = 0; i < GRADES.length; i++) if (GRADES[i].value === Number(value)) return GRADES[i].label;
    return String(value);
  }

  function gradeShort(value) {
    for (var i = 0; i < GRADES.length; i++) if (GRADES[i].value === Number(value)) return GRADES[i].short;
    return String(value);
  }

  function gradeRangeLabel(tutor) {
    return 'Grades ' + gradeShort(tutor.gradeMin) + '–' + gradeShort(tutor.gradeMax);
  }

  /** Local YYYY-MM-DD (never UTC, so "today" matches the parent's calendar). */
  function toISODate(date) {
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function dateFromISO(iso) {
    var p = iso.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function formatTime(time24) {
    var parts = time24.split(':');
    var h = Number(parts[0]);
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + parts[1] + ' ' + suffix;
  }

  function formatDateLong(iso) {
    var d = dateFromISO(iso);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((d - today) / 86400000);
    var base = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (diff === 0) return 'Today, ' + base;
    if (diff === 1) return 'Tomorrow, ' + base;
    return base;
  }

  function formatDateShort(iso) {
    return dateFromISO(iso).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  }

  function slotKey(tutorId, dateISO, time) { return tutorId + '|' + dateISO + '|' + time; }

  /** Stable small hash — used to pre-fill some hours as already taken. */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.hidden = true; }, 4500);
  }

  /* ---------------------------------------------------------------------
     2. Storage
     --------------------------------------------------------------------- */

  var store = {
    bookings: [],

    load: function () {
      this.bookings = [];
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.bookings = parsed.filter(function (b) {
              return b && b.id && b.tutorId && b.dateISO && b.time;
            });
          }
        }
      } catch (err) {
        // Private browsing or corrupted data: carry on with an empty list.
        console.warn('ABC Tutoring: could not read saved bookings.', err);
      }
      return this.bookings;
    },

    save: function () {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bookings));
        return true;
      } catch (err) {
        console.warn('ABC Tutoring: could not save bookings.', err);
        toast('Your browser is blocking storage, so this booking will not survive a refresh.');
        return false;
      }
    },

    add: function (booking) { this.bookings.push(booking); this.save(); },

    remove: function (id) {
      var removed = null;
      this.bookings = this.bookings.filter(function (b) {
        if (b.id === id) { removed = b; return false; }
        return true;
      });
      if (removed) this.save();
      return removed;
    },

    byId: function (id) {
      for (var i = 0; i < this.bookings.length; i++) if (this.bookings[i].id === id) return this.bookings[i];
      return null;
    },

    /** Upcoming first; past sessions stay listed but sort to the bottom. */
    sorted: function () {
      return this.bookings.slice().sort(function (a, b) {
        return (a.dateISO + a.time).localeCompare(b.dateISO + b.time);
      });
    },

    isMine: function (tutorId, dateISO, time) {
      return this.bookings.some(function (b) {
        return b.tutorId === tutorId && b.dateISO === dateISO && b.time === time;
      });
    },

    rememberContact: function (name, email) {
      try {
        window.localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: name, email: email }));
      } catch (err) { /* not important enough to surface */ }
    },

    lastContact: function () {
      try {
        return JSON.parse(window.localStorage.getItem(CONTACT_KEY)) || {};
      } catch (err) { return {}; }
    }
  };

  /* ---------------------------------------------------------------------
     3. Schedule
     --------------------------------------------------------------------- */

  /**
   * Hours a tutor offers over the next SCHEDULE_DAYS days, each marked with
   * why it is unavailable (already booked by another family, or booked by
   * this visitor). Times are skipped once they are inside the lead time.
   */
  function scheduleFor(tutor) {
    var now = new Date();
    var days = [];
    for (var offset = 0; offset < SCHEDULE_DAYS; offset++) {
      var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      if (tutor.availability.days.indexOf(date.getDay()) === -1) continue;

      var iso = toISODate(date);
      var slots = tutor.availability.times.map(function (time) {
        var parts = time.split(':');
        var start = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
          Number(parts[0]), Number(parts[1]));
        var tooSoon = (start - now) < LEAD_TIME_HOURS * 3600000;
        var mine = store.isMine(tutor.id, iso, time);
        // A slice of hours is pre-filled as taken so the calendar looks like a
        // real one that other families have already been booking into.
        var takenByOthers = hash(slotKey(tutor.id, iso, time)) % 100 < 22;
        return {
          time: time,
          label: formatTime(time),
          dateISO: iso,
          tooSoon: tooSoon,
          mine: mine,
          taken: takenByOthers || mine,
          available: !tooSoon && !takenByOthers && !mine
        };
      }).filter(function (slot) { return !slot.tooSoon; });

      if (slots.length) days.push({ dateISO: iso, date: date, slots: slots });
    }
    return days;
  }

  function nextOpening(tutor) {
    var days = scheduleFor(tutor);
    for (var i = 0; i < days.length; i++) {
      for (var j = 0; j < days[i].slots.length; j++) {
        if (days[i].slots[j].available) {
          return { dateISO: days[i].dateISO, slot: days[i].slots[j] };
        }
      }
    }
    return null;
  }

  function openCount(tutor) {
    return scheduleFor(tutor).reduce(function (total, day) {
      return total + day.slots.filter(function (s) { return s.available; }).length;
    }, 0);
  }

  function hasOpeningOnWeekday(tutor, weekday) {
    return scheduleFor(tutor).some(function (day) {
      return day.date.getDay() === Number(weekday) &&
        day.slots.some(function (s) { return s.available; });
    });
  }

  /* ---------------------------------------------------------------------
     4. Telemetry — answers Dana's three questions:
        which tutors get looked at, whether visitors book or leave, and
        where they came from. No names, emails, or free text are ever sent.
     --------------------------------------------------------------------- */

  var telemetry = {
    fired: {},

    ready: function () {
      return typeof window.posthog !== 'undefined' && typeof window.posthog.capture === 'function';
    },

    capture: function (event, props) {
      if (!this.ready()) return;
      try {
        window.posthog.capture(event, props || {});
      } catch (err) {
        console.warn('ABC Tutoring: analytics call failed.', err);
      }
    },

    /** Fire an event at most once for a given key (per page load). */
    captureOnce: function (key, event, props) {
      if (this.fired[key]) return;
      this.fired[key] = true;
      this.capture(event, props);
    },

    /** Where did this visitor come from? Registered on every event. */
    registerSource: function () {
      if (!this.ready()) return;
      var params = new URLSearchParams(window.location.search);
      var utmSource = (params.get('utm_source') || '').toLowerCase();
      var utmMedium = (params.get('utm_medium') || '').toLowerCase();
      var utmCampaign = (params.get('utm_campaign') || '').toLowerCase();

      var referrerHost = '';
      try {
        if (document.referrer) referrerHost = new URL(document.referrer).hostname.replace(/^www\./, '');
      } catch (err) { /* referrer may be opaque */ }

      var fromFacebook = /facebook|fb\.com|instagram/.test(utmSource) ||
        /facebook|fb\.com|fb\.me/.test(referrerHost);
      var looksLikeGroup = /group|neighborhood|parents|local/.test(utmMedium + ' ' + utmCampaign);

      var source;
      if (fromFacebook && looksLikeGroup) source = 'facebook_group';
      else if (fromFacebook) source = 'facebook';
      else if (utmSource) source = utmSource;
      else if (referrerHost && referrerHost !== window.location.hostname) source = 'referral';
      else if (!referrerHost) source = 'direct';
      else source = 'internal';

      var props = {
        traffic_source: source,
        from_facebook_group: source === 'facebook_group',
        referrer_domain: referrerHost || 'none'
      };
      if (utmSource) props.utm_source = utmSource;
      if (utmMedium) props.utm_medium = utmMedium;
      if (utmCampaign) props.utm_campaign = utmCampaign;

      try {
        window.posthog.register(props);
        // First visit wins, so a booking can be credited to how they found us.
        window.posthog.register_once({
          first_touch_source: source,
          first_touch_referrer_domain: referrerHost || 'none'
        });
      } catch (err) {
        console.warn('ABC Tutoring: could not register traffic source.', err);
      }
    },

    /** Shared tutor properties. Nothing here identifies a visitor. */
    tutorProps: function (tutor) {
      return {
        tutor_id: tutor.id,
        tutor_name: tutor.name,
        tutor_rate: tutor.rate,
        subjects: tutor.subjects,
        grade_range: gradeRangeLabel(tutor)
      };
    }
  };

  /* ---------------------------------------------------------------------
     5. Tutor list, filters, comparison
     --------------------------------------------------------------------- */

  var filters = { subject: '', grade: '', day: '', maxRate: 55, sort: 'recommended' };
  var filterEventTimer = null;

  function allSubjects() {
    var seen = {};
    TUTORS.forEach(function (t) { t.subjects.forEach(function (s) { seen[s] = true; }); });
    return Object.keys(seen).sort();
  }

  function rateBounds() {
    var rates = TUTORS.map(function (t) { return t.rate; });
    return { min: Math.min.apply(null, rates), max: Math.max.apply(null, rates) };
  }

  function matchingTutors() {
    var list = TUTORS.filter(function (t) {
      if (filters.subject && t.subjects.indexOf(filters.subject) === -1) return false;
      if (filters.grade !== '') {
        var g = Number(filters.grade);
        if (g < t.gradeMin || g > t.gradeMax) return false;
      }
      if (t.rate > filters.maxRate) return false;
      if (filters.day !== '' && !hasOpeningOnWeekday(t, filters.day)) return false;
      return true;
    });

    var soonest = function (t) {
      var next = nextOpening(t);
      return next ? next.dateISO + next.slot.time : '9999';
    };

    if (filters.sort === 'rate-asc') list.sort(function (a, b) { return a.rate - b.rate; });
    else if (filters.sort === 'rate-desc') list.sort(function (a, b) { return b.rate - a.rate; });
    else if (filters.sort === 'soonest') {
      list.sort(function (a, b) { return soonest(a).localeCompare(soonest(b)); });
    }
    return list;
  }

  function tutorCard(tutor) {
    var next = nextOpening(tutor);
    var open = openCount(tutor);
    var days = tutor.availability.days.map(function (d) { return DAY_NAMES[d].slice(0, 3); }).join(', ');

    return '' +
      '<article class="tutor-card" data-tutor="' + esc(tutor.id) + '">' +
        '<div class="tutor-card-top">' +
          '<img src="' + esc(tutor.photo) + '" alt="Portrait of ' + esc(tutor.name) + '" width="92" height="92" loading="lazy">' +
          '<div>' +
            '<h3 class="tutor-name">' + esc(tutor.name) + '</h3>' +
            '<p class="tutor-tagline">' + esc(tutor.tagline) + '</p>' +
            '<p class="rate">$' + tutor.rate + ' <small>/ hour</small></p>' +
          '</div>' +
        '</div>' +
        '<div class="tutor-card-body">' +
          '<ul class="tags">' +
            tutor.subjects.map(function (s) { return '<li class="tag">' + esc(s) + '</li>'; }).join('') +
            '<li class="tag tag-grade">' + esc(gradeRangeLabel(tutor)) + '</li>' +
          '</ul>' +
          '<ul class="tutor-meta">' +
            '<li>Usually available <strong>' + esc(days) + '</strong></li>' +
            '<li><strong>' + open + '</strong> open hour' + (open === 1 ? '' : 's') + ' in the next two weeks</li>' +
          '</ul>' +
          (next
            ? '<p class="next-open"><span class="dot" aria-hidden="true"></span>Next opening: ' +
                esc(formatDateShort(next.dateISO)) + ' at ' + esc(next.slot.label) + '</p>'
            : '<p class="next-open none"><span class="dot" aria-hidden="true"></span>Fully booked for the next two weeks</p>') +
        '</div>' +
        '<div class="tutor-card-actions">' +
          '<button type="button" class="btn btn-secondary" data-action="view-profile" data-tutor="' + esc(tutor.id) + '">View profile</button>' +
          '<button type="button" class="btn btn-primary" data-action="book" data-placement="tutor_card" data-tutor="' + esc(tutor.id) + '"' +
            (next ? '' : ' disabled') + '>' + (next ? 'Book a session' : 'No open hours') + '</button>' +
        '</div>' +
      '</article>';
  }

  function renderTutors() {
    var list = matchingTutors();
    var grid = $('#tutorGrid');
    var count = $('#resultsCount');

    grid.innerHTML = list.map(tutorCard).join('');
    $('#noResults').hidden = list.length > 0;

    var bits = [];
    if (filters.subject) bits.push(filters.subject);
    if (filters.grade !== '') bits.push('for ' + gradeLabel(filters.grade).toLowerCase());
    if (filters.day !== '') bits.push('on ' + DAY_NAMES[Number(filters.day)] + 's');
    if (filters.maxRate < rateBounds().max) bits.push('up to $' + filters.maxRate + '/hour');

    count.textContent = list.length === TUTORS.length && !bits.length
      ? 'Showing all ' + list.length + ' tutors.'
      : 'Showing ' + list.length + ' of ' + TUTORS.length + ' tutors' +
        (bits.length ? ' — ' + bits.join(', ') : '') + '.';
  }

  function readFilters() {
    filters.subject = $('#filterSubject').value;
    filters.grade = $('#filterGrade').value;
    filters.day = $('#filterDay').value;
    filters.maxRate = Number($('#filterRate').value);
    filters.sort = $('#sortBy').value;
    $('#filterRateOut').textContent = '$' + filters.maxRate;
  }

  function onFilterChange() {
    readFilters();
    renderTutors();
    // One event after the visitor stops adjusting, not one per keystroke/drag.
    clearTimeout(filterEventTimer);
    filterEventTimer = setTimeout(function () {
      telemetry.capture('tutor_filters_applied', {
        subject: filters.subject || 'any',
        grade_level: filters.grade === '' ? 'any' : gradeLabel(filters.grade),
        day: filters.day === '' ? 'any' : DAY_NAMES[Number(filters.day)],
        max_rate: filters.maxRate,
        sort_by: filters.sort,
        results_count: matchingTutors().length
      });
    }, 700);
  }

  function resetFilters() {
    $('#filterSubject').value = '';
    $('#filterGrade').value = '';
    $('#filterDay').value = '';
    $('#filterRate').value = rateBounds().max;
    $('#sortBy').value = 'recommended';
    onFilterChange();
  }

  function buildFilterOptions() {
    var subjectSelect = $('#filterSubject');
    allSubjects().forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      subjectSelect.appendChild(opt);
    });

    var gradeSelect = $('#filterGrade');
    GRADES.forEach(function (g) {
      var opt = document.createElement('option');
      opt.value = String(g.value); opt.textContent = g.label;
      gradeSelect.appendChild(opt);
    });

    var bounds = rateBounds();
    var rate = $('#filterRate');
    rate.min = String(bounds.min);
    rate.max = String(bounds.max);
    rate.value = String(bounds.max);
    $('#filterRateOut').textContent = '$' + bounds.max;
    filters.maxRate = bounds.max;
  }

  /* ---------------------------------------------------------------------
     6. Booking panel
     --------------------------------------------------------------------- */

  var panel = $('#panel');
  var panelBody = $('#panelBody');
  var flow = null;          // { tutor, step, slot, startedFrom }
  var historyPushed = false;
  var closingFromPopstate = false;

  function setStepBar(step) {
    var bar = $('#panelSteps');
    var order = ['time', 'details', 'confirmed'];
    var index = order.indexOf(step);
    bar.hidden = index === -1;
    if (index === -1) return;
    $$('#panelSteps li').forEach(function (li, i) {
      li.classList.toggle('is-current', i === index);
      li.classList.toggle('is-done', i < index);
      if (i === index) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  function openPanel() {
    if (!panel.open) panel.showModal();
  }

  function focusPanelTop() {
    var target = $('[data-autofocus]', panelBody) || panelBody;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    panelBody.scrollTop = 0;
  }

  function closePanel() {
    if (panel.open) panel.close();
  }

  /* ---- Step: tutor profile ---- */

  function renderProfile(tutor) {
    var days = scheduleFor(tutor);
    var next = nextOpening(tutor);
    var open = openCount(tutor);

    panelBody.innerHTML = '' +
      '<div class="profile-head">' +
        '<img src="' + esc(tutor.photo) + '" alt="Portrait of ' + esc(tutor.name) + '" width="128" height="128">' +
        '<div>' +
          '<h3 data-autofocus tabindex="-1">' + esc(tutor.name) + '</h3>' +
          '<p class="tutor-tagline">' + esc(tutor.tagline) + '</p>' +
          '<ul class="tags">' +
            tutor.subjects.map(function (s) { return '<li class="tag">' + esc(s) + '</li>'; }).join('') +
            '<li class="tag tag-grade">' + esc(gradeRangeLabel(tutor)) + '</li>' +
          '</ul>' +
          '<p class="profile-price">$' + tutor.rate + ' per hour<small>Paid to your tutor at the session</small></p>' +
        '</div>' +
      '</div>' +

      '<div class="profile-section">' +
        '<h4>About ' + esc(tutor.name.split(' ')[0]) + '</h4>' +
        '<p>' + esc(tutor.bio) + '</p>' +
      '</div>' +

      '<div class="profile-section">' +
        '<h4>How a session runs</h4>' +
        '<ul class="profile-list">' +
          tutor.approach.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') +
        '</ul>' +
      '</div>' +

      '<div class="profile-section">' +
        '<h4>The details</h4>' +
        '<div class="fact-grid">' +
          '<dl class="fact"><dt>Experience</dt><dd>' + tutor.yearsExperience + ' years</dd></dl>' +
          '<dl class="fact"><dt>Grade levels</dt><dd>' + esc(gradeRangeLabel(tutor)) + '</dd></dl>' +
          '<dl class="fact"><dt>Speaks</dt><dd>' + esc(tutor.languages.join(', ')) + '</dd></dl>' +
          '<dl class="fact"><dt>Session length</dt><dd>1 hour</dd></dl>' +
        '</div>' +
      '</div>' +

      '<div class="profile-section">' +
        '<h4>Good to know</h4>' +
        '<ul class="profile-list">' +
          tutor.credentials.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
        '</ul>' +
      '</div>' +

      '<div class="profile-section">' +
        '<h4>Open hours</h4>' +
        (next
          ? '<p><strong>' + open + '</strong> open hour' + (open === 1 ? '' : 's') +
            ' in the next two weeks. The soonest is ' + esc(formatDateLong(next.dateISO)) +
            ' at ' + esc(next.slot.label) + '.</p>'
          : '<p>' + esc(tutor.name.split(' ')[0]) + ' is fully booked for the next two weeks. ' +
            'Email Dana and she will let you know when an hour frees up.</p>') +
        '<p class="field-hint">Usually works ' +
          esc(tutor.availability.days.map(function (d) { return DAY_NAMES[d]; }).join(', ')) + '.</p>' +
      '</div>' +

      '<div class="panel-actions">' +
        '<button type="button" class="btn btn-primary" data-action="choose-time" data-placement="tutor_profile"' +
          (days.length && next ? '' : ' disabled') + '>Choose a time with ' +
          esc(tutor.name.split(' ')[0]) + '</button>' +
      '</div>';

    $('#panelTitle').textContent = 'Tutor profile';
    $('#panelBack').hidden = true;
    setStepBar('profile');
    focusPanelTop();
  }

  /* ---- Step: choose a time ---- */

  function renderTimeStep() {
    var tutor = flow.tutor;
    var days = scheduleFor(tutor);

    var groups = days.map(function (day) {
      return '' +
        '<div class="day-group">' +
          '<p class="day-head">' + esc(formatDateLong(day.dateISO)) +
            '<span>' + day.slots.filter(function (s) { return s.available; }).length + ' open</span></p>' +
          '<div class="slot-row">' +
            day.slots.map(function (slot) {
              var selected = flow.slot && flow.slot.dateISO === day.dateISO && flow.slot.time === slot.time;
              return '<button type="button" class="slot' + (slot.mine ? ' is-mine' : '') + '"' +
                ' data-action="pick-slot" data-date="' + esc(day.dateISO) + '" data-time="' + esc(slot.time) + '"' +
                (slot.available ? '' : ' disabled') +
                ' aria-pressed="' + (selected ? 'true' : 'false') + '">' + esc(slot.label) + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
    }).join('');

    panelBody.innerHTML = '' +
      '<div class="summary-bar">' +
        '<img src="' + esc(tutor.photo) + '" alt="" width="52" height="52">' +
        '<div><strong data-autofocus tabindex="-1">Choose an hour with ' + esc(tutor.name) + '</strong>' +
        '<span>$' + tutor.rate + ' per hour · one-hour session · ' + esc(gradeRangeLabel(tutor)) + '</span></div>' +
      '</div>' +
      '<p class="notice">Hours shown are open right now. Anything marked <strong>booked</strong> has already been taken.</p>' +
      (groups || '<p>No open hours in the next two weeks.</p>') +
      '<p class="field-hint">Looking further ahead than two weeks? Email ' +
        '<a href="mailto:hello@abctutoring.example">hello@abctutoring.example</a> and Dana will set it up.</p>' +
      '<div class="panel-actions">' +
        '<button type="button" class="btn btn-primary btn-block" data-action="to-details" disabled>' +
          'Select a time to continue</button>' +
      '</div>';

    $('#panelTitle').textContent = 'Book with ' + tutor.name.split(' ')[0];
    $('#panelBack').hidden = false;
    setStepBar('time');
    updateContinueButton();
    focusPanelTop();
  }

  function updateContinueButton() {
    var btn = $('[data-action="to-details"]', panelBody);
    if (!btn) return;
    if (flow.slot) {
      btn.disabled = false;
      btn.textContent = 'Continue — ' + formatDateShort(flow.slot.dateISO) + ' at ' + formatTime(flow.slot.time);
    } else {
      btn.disabled = true;
      btn.textContent = 'Select a time to continue';
    }
  }

  /* ---- Step: student details ---- */

  function renderDetailsStep() {
    var tutor = flow.tutor;
    var contact = store.lastContact();

    var gradeOptions = GRADES.filter(function (g) {
      return g.value >= tutor.gradeMin && g.value <= tutor.gradeMax;
    }).map(function (g) {
      var selected = filters.grade !== '' && Number(filters.grade) === g.value ? ' selected' : '';
      return '<option value="' + g.value + '"' + selected + '>' + esc(g.label) + '</option>';
    }).join('');

    var subjectOptions = tutor.subjects.map(function (s) {
      var selected = filters.subject === s ? ' selected' : '';
      return '<option value="' + esc(s) + '"' + selected + '>' + esc(s) + '</option>';
    }).join('');

    panelBody.innerHTML = '' +
      '<div class="summary-bar">' +
        '<img src="' + esc(tutor.photo) + '" alt="" width="52" height="52">' +
        '<div><strong data-autofocus tabindex="-1">' + esc(tutor.name) + '</strong>' +
        '<span>' + esc(formatDateLong(flow.slot.dateISO)) + ' at ' + esc(formatTime(flow.slot.time)) +
        ' · $' + tutor.rate + ' for the hour</span></div>' +
      '</div>' +
      '<form id="bookingForm" novalidate autocomplete="on">' +
        '<div class="form-grid">' +
          '<div class="field field-full">' +
            '<label for="parentName">Your name</label>' +
            '<input type="text" id="parentName" name="parentName" class="ph-no-capture" data-private ' +
              'autocomplete="name" required value="' + esc(contact.name || '') + '">' +
            '<p class="field-error" id="parentNameError"></p>' +
          '</div>' +
          '<div class="field field-full">' +
            '<label for="parentEmail">Your email</label>' +
            '<input type="email" id="parentEmail" name="parentEmail" class="ph-no-capture" data-private ' +
              'autocomplete="email" required value="' + esc(contact.email || '') + '">' +
            '<p class="field-hint">Dana confirms your session here, usually the same evening.</p>' +
            '<p class="field-error" id="parentEmailError"></p>' +
          '</div>' +
          '<div class="field">' +
            '<label for="studentName">Student\'s first name</label>' +
            '<input type="text" id="studentName" name="studentName" class="ph-no-capture" data-private ' +
              'autocomplete="off" required>' +
            '<p class="field-error" id="studentNameError"></p>' +
          '</div>' +
          '<div class="field">' +
            '<label for="studentGrade">Student\'s grade</label>' +
            '<select id="studentGrade" name="studentGrade" required>' +
              '<option value="">Choose a grade</option>' + gradeOptions +
            '</select>' +
            '<p class="field-error" id="studentGradeError"></p>' +
          '</div>' +
          '<div class="field field-full">' +
            '<label for="bookingSubject">Subject they need</label>' +
            '<select id="bookingSubject" name="bookingSubject" required>' +
              '<option value="">Choose a subject</option>' + subjectOptions +
            '</select>' +
            '<p class="field-error" id="bookingSubjectError"></p>' +
          '</div>' +
        '</div>' +
        '<p class="privacy-note">We use these details to confirm the session and nothing else. ' +
          'Names and email addresses stay in your browser on this prototype and are never sent to our analytics.</p>' +
        '<div class="panel-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="back">Back to times</button>' +
          '<button type="submit" class="btn btn-primary">Confirm this booking</button>' +
        '</div>' +
      '</form>';

    $('#panelTitle').textContent = 'Student details';
    $('#panelBack').hidden = false;
    setStepBar('details');
    focusPanelTop();

    var form = $('#bookingForm');
    form.addEventListener('submit', submitBooking);
    // Clear a field's error as soon as the parent starts fixing it.
    form.addEventListener('input', function (event) {
      if (event.target.id) showFieldError(event.target.id, '');
    });
    form.addEventListener('change', function (event) {
      if (event.target.id) showFieldError(event.target.id, '');
    });
  }

  function showFieldError(id, message) {
    var input = $('#' + id);
    var error = $('#' + id + 'Error');
    if (error) error.textContent = message || '';
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function submitBooking(event) {
    event.preventDefault();
    if (flow.submitting) return;

    var parentName = $('#parentName').value.trim();
    var parentEmail = $('#parentEmail').value.trim();
    var studentName = $('#studentName').value.trim();
    var studentGrade = $('#studentGrade').value;
    var subject = $('#bookingSubject').value;

    var firstBad = null;
    var check = function (id, ok, message) {
      showFieldError(id, ok ? '' : message);
      if (!ok && !firstBad) firstBad = id;
    };

    check('parentName', parentName.length >= 2, 'Please add your name so Dana knows who to reply to.');
    check('parentEmail', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(parentEmail), 'Please enter an email we can reach you at.');
    check('studentName', studentName.length >= 1, 'Your child\'s first name is enough.');
    check('studentGrade', studentGrade !== '', 'Choose the grade your child is in.');
    check('bookingSubject', subject !== '', 'Choose the subject they need help with.');

    if (firstBad) {
      $('#' + firstBad).focus();
      return;
    }

    // Someone may have taken this hour in another tab since it was picked.
    var stillOpen = scheduleFor(flow.tutor).some(function (day) {
      return day.dateISO === flow.slot.dateISO && day.slots.some(function (s) {
        return s.time === flow.slot.time && s.available;
      });
    });
    if (!stillOpen) {
      toast('That hour was just taken. Please pick another one.');
      flow.slot = null;
      renderTimeStep();
      return;
    }

    flow.submitting = true;

    var booking = {
      id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      tutorId: flow.tutor.id,
      tutorName: flow.tutor.name,
      rate: flow.tutor.rate,
      dateISO: flow.slot.dateISO,
      time: flow.slot.time,
      subject: subject,
      grade: Number(studentGrade),
      parentName: parentName,
      parentEmail: parentEmail,
      studentName: studentName,
      createdAt: new Date().toISOString()
    };

    store.add(booking);
    store.rememberContact(parentName, parentEmail);

    // Conversion event — once per completed booking.
    telemetry.captureOnce('completed:' + booking.id, 'booking_completed',
      Object.assign(telemetry.tutorProps(flow.tutor), {
        subject: booking.subject,
        grade_level: gradeLabel(booking.grade),
        day: DAY_NAMES[dateFromISO(booking.dateISO).getDay()],
        time_slot: booking.time,
        session_date: booking.dateISO,
        days_ahead: Math.round((dateFromISO(booking.dateISO) - new Date().setHours(0, 0, 0, 0)) / 86400000),
        hourly_rate: booking.rate,
        booking_step: 'completed',
        cta_placement: flow.startedFrom,
        booking_number_this_visitor: store.bookings.length
      })
    );

    flow.completed = true;
    renderConfirmation(booking);
    renderBookings();
    renderTutors();
  }

  /* ---- Step: confirmation ---- */

  function renderConfirmation(booking) {
    var tutor = tutorById(booking.tutorId);
    panelBody.innerHTML = '' +
      '<div class="confirm-hero">' +
        '<div class="confirm-check" aria-hidden="true">✓</div>' +
        '<h3 data-autofocus tabindex="-1">You are booked, ' + esc(booking.parentName.split(' ')[0]) + '.</h3>' +
        '<p>Dana will email <strong>' + esc(booking.parentEmail) + '</strong> to confirm the location, ' +
          'usually the same evening.</p>' +
      '</div>' +
      '<div class="confirm-card">' +
        '<dl>' +
          '<dt>Tutor</dt><dd>' + esc(booking.tutorName) + '</dd>' +
          '<dt>When</dt><dd>' + esc(formatDateLong(booking.dateISO)) + ' at ' + esc(formatTime(booking.time)) + '</dd>' +
          '<dt>Student</dt><dd>' + esc(booking.studentName) + ', ' + esc(gradeLabel(booking.grade)) + '</dd>' +
          '<dt>Subject</dt><dd>' + esc(booking.subject) + '</dd>' +
          '<dt>Cost</dt><dd>$' + booking.rate + ' for the hour, paid to ' +
            esc(tutor ? tutor.name.split(' ')[0] : booking.tutorName) + ' at the session</dd>' +
          '<dt>Reference</dt><dd>' + esc(bookingRef(booking)) + '</dd>' +
        '</dl>' +
      '</div>' +
      '<p class="field-hint">Need to change it? You can cancel from the <strong>My bookings</strong> section ' +
        'on this page, or reply to Dana\'s email.</p>' +
      '<div class="panel-actions">' +
        '<button type="button" class="btn btn-ghost" data-action="book-another">Book another session</button>' +
        '<button type="button" class="btn btn-primary" data-action="done">Done</button>' +
      '</div>';

    $('#panelTitle').textContent = 'Session booked';
    $('#panelBack').hidden = true;
    setStepBar('confirmed');
    focusPanelTop();
  }

  function bookingRef(booking) {
    return 'ABC-' + booking.id.slice(1, 6).toUpperCase();
  }

  /* ---- Flow control ---- */

  var flowCounter = 0;

  function viewProfile(tutorId, source, skipHistory) {
    var tutor = tutorById(tutorId);
    if (!tutor) return;

    flow = { id: ++flowCounter, tutor: tutor, step: 'profile', slot: null, startedFrom: null };
    openPanel();
    renderProfile(tutor);

    if (!skipHistory) {
      try {
        window.history.pushState({ panel: 'tutor', id: tutor.id }, '', '#tutor=' + tutor.id);
        historyPushed = true;
      } catch (err) { historyPushed = false; }
    }

    telemetry.capture('tutor_profile_viewed', Object.assign(telemetry.tutorProps(tutor), {
      view_source: source,
      open_hours_next_two_weeks: openCount(tutor),
      booking_step: 'profile'
    }));
  }

  function startBooking(tutorId, placement) {
    var tutor = tutorById(tutorId);
    if (!tutor) return;

    var sameTutorFlow = flow && flow.tutor.id === tutor.id && !flow.completed;
    if (!sameTutorFlow) {
      flow = { id: ++flowCounter, tutor: tutor, step: 'time', slot: null, startedFrom: placement };
    }
    flow.step = 'time';
    flow.startedFrom = flow.startedFrom || placement;

    openPanel();
    renderTimeStep();

    if (!historyPushed) {
      try {
        window.history.pushState({ panel: 'tutor', id: tutor.id }, '', '#tutor=' + tutor.id);
        historyPushed = true;
      } catch (err) { historyPushed = false; }
    }

    // Selecting a tutor and entering the booking flow: one pair of events per
    // flow, so stepping back and forward again does not double-count.
    telemetry.captureOnce('selected:' + flow.id + ':' + placement, 'tutor_selected',
      Object.assign(telemetry.tutorProps(tutor), {
        cta_placement: placement,
        booking_step: 'selected'
      }));

    if (!flow.startedTracked) {
      flow.startedTracked = true;
      telemetry.capture('booking_started', Object.assign(telemetry.tutorProps(tutor), {
        cta_placement: placement,
        booking_step: 'time',
        open_hours_next_two_weeks: openCount(tutor)
      }));
    }
  }

  function pickSlot(dateISO, time) {
    var already = flow.slot && flow.slot.dateISO === dateISO && flow.slot.time === time;
    if (already) return; // clicking the selected hour again is a no-op, not a new event

    flow.slot = { dateISO: dateISO, time: time };
    $$('[data-action="pick-slot"]', panelBody).forEach(function (btn) {
      btn.setAttribute('aria-pressed',
        btn.dataset.date === dateISO && btn.dataset.time === time ? 'true' : 'false');
    });
    updateContinueButton();

    telemetry.capture('time_slot_selected', Object.assign(telemetry.tutorProps(flow.tutor), {
      day: DAY_NAMES[dateFromISO(dateISO).getDay()],
      time_slot: time,
      session_date: dateISO,
      days_ahead: Math.round((dateFromISO(dateISO) - new Date().setHours(0, 0, 0, 0)) / 86400000),
      booking_step: 'time',
      cta_placement: flow.startedFrom
    }));
  }

  /** Left the flow without booking — this is the "or just leave" half of Dana's question. */
  function trackAbandonment() {
    if (!flow || flow.completed || !flow.startedTracked) return;
    telemetry.captureOnce('abandoned:' + flow.id,
      'booking_abandoned', Object.assign(telemetry.tutorProps(flow.tutor), {
        booking_step: flow.step,
        time_slot_selected: Boolean(flow.slot),
        time_slot: flow.slot ? flow.slot.time : null,
        day: flow.slot ? DAY_NAMES[dateFromISO(flow.slot.dateISO).getDay()] : null,
        cta_placement: flow.startedFrom
      }));
  }

  /* ---------------------------------------------------------------------
     7. My bookings
     --------------------------------------------------------------------- */

  function renderBookings() {
    var list = store.sorted();
    var container = $('#bookingsList');
    var today = new Date(); today.setHours(0, 0, 0, 0);

    container.innerHTML = list.map(function (b) {
      var tutor = tutorById(b.tutorId);
      var past = dateFromISO(b.dateISO) < today;
      return '' +
        '<article class="booking-card" data-booking="' + esc(b.id) + '">' +
          (tutor ? '<img src="' + esc(tutor.photo) + '" alt="" width="64" height="64">' : '') +
          '<div class="booking-main">' +
            '<p class="booking-when">' + esc(formatDateLong(b.dateISO)) + ' at ' + esc(formatTime(b.time)) +
              (past ? ' <span class="booking-ref">(past)</span>' : '') + '</p>' +
            '<p class="booking-sub">' + esc(b.subject) + ' with ' + esc(b.tutorName) + ' · ' +
              esc(b.studentName) + ', ' + esc(gradeLabel(b.grade)) + ' · $' + b.rate + ' for the hour</p>' +
            '<p class="booking-ref">' + esc(bookingRef(b)) + '</p>' +
          '</div>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="cancel" data-booking="' + esc(b.id) + '">' +
            (past ? 'Remove' : 'Cancel session') + '</button>' +
        '</article>';
    }).join('');

    $('#noBookings').hidden = list.length > 0;

    var badge = $('#navBookingCount');
    badge.textContent = String(list.length);
    badge.hidden = list.length === 0;
    badge.setAttribute('aria-hidden', list.length === 0 ? 'true' : 'false');
  }

  var pendingCancelId = null;

  function askToCancel(id) {
    var booking = store.byId(id);
    if (!booking) return;
    pendingCancelId = id;
    $('#cancelSummary').textContent = booking.subject + ' with ' + booking.tutorName + ', ' +
      formatDateLong(booking.dateISO) + ' at ' + formatTime(booking.time) + '.';
    $('#cancelDialog').showModal();
  }

  function confirmCancel() {
    var booking = store.byId(pendingCancelId);
    $('#cancelDialog').close();
    if (!booking) return;

    var tutor = tutorById(booking.tutorId);
    store.remove(booking.id);
    pendingCancelId = null;

    telemetry.capture('booking_cancelled', Object.assign(
      tutor ? telemetry.tutorProps(tutor) : { tutor_id: booking.tutorId, tutor_name: booking.tutorName },
      {
        subject: booking.subject,
        grade_level: gradeLabel(booking.grade),
        day: DAY_NAMES[dateFromISO(booking.dateISO).getDay()],
        time_slot: booking.time,
        session_date: booking.dateISO,
        hourly_rate: booking.rate,
        booking_step: 'cancelled',
        hours_since_booked: Math.round(
          (Date.now() - new Date(booking.createdAt).getTime()) / 3600000)
      }
    ));

    renderBookings();
    renderTutors();
    toast('Session cancelled. That hour is open again.');
  }

  /* ---------------------------------------------------------------------
     8. Boot and event wiring
     --------------------------------------------------------------------- */

  function wireEvents() {
    // Filters
    $('#filters').addEventListener('change', onFilterChange);
    $('#filterRate').addEventListener('input', function () {
      $('#filterRateOut').textContent = '$' + $('#filterRate').value;
    });
    $('#filters').addEventListener('submit', function (e) { e.preventDefault(); });
    $('#clearFilters').addEventListener('click', resetFilters);
    $('#clearFiltersEmpty').addEventListener('click', function () {
      resetFilters();
      $('#filterSubject').focus();
    });

    // Tutor grid + bookings list (delegated)
    document.addEventListener('click', function (event) {
      if (!(event.target instanceof Element)) return;
      var trigger = event.target.closest('[data-action]');
      if (!trigger) return;
      var action = trigger.dataset.action;

      if (action === 'view-profile') {
        viewProfile(trigger.dataset.tutor, 'tutor_card');
      } else if (action === 'book') {
        startBooking(trigger.dataset.tutor, trigger.dataset.placement || 'tutor_card');
      } else if (action === 'choose-time') {
        if (flow) startBooking(flow.tutor.id, trigger.dataset.placement || 'tutor_profile');
      } else if (action === 'pick-slot') {
        if (flow) pickSlot(trigger.dataset.date, trigger.dataset.time);
      } else if (action === 'to-details') {
        if (!flow || !flow.slot) return;
        flow.step = 'details';
        renderDetailsStep();
      } else if (action === 'back') {
        if (!flow) return;
        flow.step = 'time';
        renderTimeStep();
      } else if (action === 'book-another') {
        closePanel();
        document.getElementById('tutors').scrollIntoView({ block: 'start' });
      } else if (action === 'done') {
        closePanel();
        document.getElementById('my-bookings').scrollIntoView({ block: 'start' });
      } else if (action === 'cancel') {
        askToCancel(trigger.dataset.booking);
      }
    });

    // Panel chrome
    $('#panelClose').addEventListener('click', closePanel);
    $('#panelBack').addEventListener('click', function () {
      if (!flow) return;
      if (flow.step === 'details') { flow.step = 'time'; renderTimeStep(); }
      else if (flow.step === 'time') { flow.step = 'profile'; renderProfile(flow.tutor); }
    });

    // Closing the dialog (button, Esc, or backdrop) always runs through here.
    panel.addEventListener('close', function () {
      trackAbandonment();
      flow = null;
      panelBody.innerHTML = '';
      if (historyPushed && !closingFromPopstate) {
        historyPushed = false;
        window.history.back();
      } else if (!closingFromPopstate && window.location.hash.indexOf('#tutor=') === 0) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      closingFromPopstate = false;
    });

    // Clicking the backdrop closes the panel.
    panel.addEventListener('click', function (event) {
      if (event.target === panel) closePanel();
    });

    // Cancellation dialog
    $('#cancelConfirm').addEventListener('click', confirmCancel);
    $('#cancelDismiss').addEventListener('click', function () {
      pendingCancelId = null;
      $('#cancelDialog').close();
    });
    $('#cancelDialog').addEventListener('click', function (event) {
      if (event.target === $('#cancelDialog')) { pendingCancelId = null; $('#cancelDialog').close(); }
    });

    // Browser back closes the panel instead of leaving the site.
    window.addEventListener('popstate', function () {
      var state = window.history.state;
      if (state && state.panel === 'tutor') {
        // Navigated onto a tutor entry: we are standing on it, so closing
        // should tidy the URL rather than pop another entry.
        historyPushed = false;
        viewProfile(state.id, 'browser_history', true);
      } else if (panel.open) {
        closingFromPopstate = true;
        historyPushed = false;
        closePanel();
      }
    });

    // Header CTAs are plain anchors; note which one sent people to the list.
    $$('[data-cta]').forEach(function (link) {
      link.addEventListener('click', function () {
        telemetry.capture('browse_tutors_clicked', { cta_placement: link.dataset.cta });
      });
    });

    // A visitor who leaves mid-booking still counts as "left without booking".
    window.addEventListener('pagehide', trackAbandonment);
  }

  function openDeepLink() {
    var match = /^#tutor=([\w-]+)$/.exec(window.location.hash);
    if (!match) return;
    var tutor = tutorById(match[1]);
    if (!tutor) return;
    historyPushed = false; // we did not create this entry, so do not pop it on close
    viewProfile(tutor.id, 'shared_link', true);
  }

  function init() {
    if (!TUTORS.length) {
      console.error('ABC Tutoring: no tutors loaded.');
      return;
    }
    store.load();
    buildFilterOptions();
    readFilters();
    renderTutors();
    renderBookings();
    wireEvents();
    telemetry.registerSource();
    openDeepLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
