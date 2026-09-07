# ABC Tutoring

A static booking site for ABC Tutoring: parents browse K–12 tutors, compare rates
and open hours, and book a one-hour session. Built as plain HTML, CSS, and
JavaScript so it can be served directly from GitHub Pages.

## Running it locally

Any static file server works. From the repository root:

```sh
python3 -m http.server 8123
# then open http://localhost:8123/
```

Opening `index.html` straight from the filesystem also works, but a server is
closer to how GitHub Pages behaves.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page structure, the PostHog snippet, and the booking dialog markup |
| `styles.css` | All styling, including the responsive and print rules |
| `app.js` | Schedule generation, filtering, the booking flow, storage, and analytics |
| `tutors.js` | The tutor roster — edit this to change rates, subjects, or availability |
| `assets/tutors/*.svg` | Tutor portraits |

## Editing the roster

`tutors.js` is the only file that needs to change to add a tutor or adjust a
schedule. Each tutor's `availability.days` uses weekday numbers (0 = Sunday) and
`availability.times` uses 24-hour start times. The site turns that weekly pattern
into the next two weeks of bookable hours, skipping anything starting within the
next two hours.

## What is simulated

There is no backend. Bookings are saved in the visitor's own browser
(`localStorage`), so a booked hour stays booked on that device after a refresh
but is not visible to Dana or to other visitors. No email is sent and no payment
is taken. Some hours are shown as already booked so the calendar looks realistic.

## Analytics

PostHog is loaded in `index.html` with automatic pageviews and autocapture left
on. Custom events are sent from `app.js`: `tutor_profile_viewed`,
`tutor_selected`, `booking_started`, `time_slot_selected`, `booking_completed`,
`booking_abandoned`, `booking_cancelled`, `tutor_filters_applied`, and
`browse_tutors_clicked`. Traffic source (including whether a visitor arrived from
the Facebook group) is registered as a super property on every event.

Parent names, email addresses, and student names are never sent to PostHog. Those
inputs carry `ph-no-capture` and `data-private` so they are excluded from
autocapture and masked in session replay.
