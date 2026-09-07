# Evidence

Proof that the prototype and its telemetry work in practice. Drop screenshots
here and list them below so the submission is self-contained.

## What to capture

| File | What it should show |
| --- | --- |
| `posthog-activity.png` | PostHog → Activity, with `booking_completed`, `tutor_profile_viewed`, and friends arriving |
| `posthog-event-properties.png` | One `booking_completed` event expanded, showing `tutor_name`, `subject`, `grade_level`, `time_slot`, and `traffic_source` — and no personal details |
| `posthog-funnel.png` | A funnel from `tutor_profile_viewed` to `booking_completed`, ideally broken down by `traffic_source` |
| `site-desktop.png`, `site-mobile.png` | The live site on both screen sizes |
| `simulate-traffic-output.txt` | Console output from `node scripts/simulate-traffic.js` |

## How to regenerate the data behind these

```sh
npm install playwright && npx playwright install chromium
node scripts/simulate-traffic.js          # simulated visitors -> real PostHog events
node scripts/test-telemetry.js            # prints every event and its properties
```

Then open PostHog → Activity and take the screenshots above. See
`scripts/README.md` for the full set of options.
