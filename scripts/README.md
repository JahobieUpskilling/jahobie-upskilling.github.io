# Scripts

Verification and traffic-simulation scripts for the ABC Tutoring site. They are
development tools only — the website itself has no dependencies and ships as
plain HTML, CSS, and JavaScript.

## Setup

```sh
npm install playwright
npx playwright install chromium
```

Every script takes `BASE` to choose which copy of the site to drive. It defaults
to the live site; point it at a local server to test changes before pushing.

```sh
python3 -m http.server 8123          # serve locally
BASE=http://localhost:8123/ node scripts/<script>.js
```

## `simulate-traffic.js` — simulated visitors

Drives real browser sessions so PostHog fills with a realistic mix of behaviour:
parents who look and leave, parents who compare tutors, parents who book, and
some who cancel. Visitors arrive from a weighted mix of sources — the Facebook
group, direct, search, and the school newsletter — on both mobile and desktop,
each in a fresh browser context so PostHog counts them as separate people.

```sh
node scripts/simulate-traffic.js                  # 12 visitors against the live site
VISITORS=30 node scripts/simulate-traffic.js      # a fuller data set
HEADLESS=false node scripts/simulate-traffic.js   # watch the browser work
```

It prints a per-visitor log and a summary with the conversion rate and how many
of the Facebook-group visitors booked. Open PostHog → Activity to watch the
sessions arrive.

The names and emails it types are invented. They never leave the browser: the
site keeps them in localStorage and excludes them from analytics by design.

## `test-booking-journey.js` — end-to-end check

Walks the whole journey and asserts each step: filtering, tutor profiles, slot
selection, form validation, booking, persistence across a refresh, a second
booking, abandonment, cancellation, the freed hour becoming bookable again, deep
links, the mobile layout, and keyboard reachability. It also fails loudly if any
parent or student detail turns up in a PostHog payload.

```sh
node scripts/test-booking-journey.js
OUT=/tmp/shots node scripts/test-booking-journey.js   # where screenshots land
```

Screenshots of every step are written next to the script unless `OUT` says
otherwise.

## `test-telemetry.js` — analytics check

Runs one booking, one abandoned booking, and one cancellation, then prints every
event PostHog received with its properties, the traffic-source super properties,
and a check that no personal detail was transmitted.

```sh
node scripts/test-telemetry.js
```

## A note on bot filtering

PostHog discards events from browsers that announce themselves as automated, so
`simulate-traffic.js` and `test-telemetry.js` present as an ordinary Chrome
install. Without that, the pages load and the assertions pass but no analytics
data arrives — which is also why `test-booking-journey.js` checks behaviour
rather than event delivery.
