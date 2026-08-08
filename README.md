# NeuroStudy — V1 prototype

A personalized study-session planner: a short cognitive check (reaction time +
visual working memory), scored against **your own** history, feeds a study-block
plan (length, breaks, ordering) instead of a generic 25-minute timer.

No backend, no build step, no dependencies. All data is stored in your
browser's `localStorage`, per device.

## Run it locally

Just open `index.html` in a browser. That's it.

## Put it on GitHub

1. Create a new repo (e.g. `neurostudy`) and push these three files
   (`index.html`, `style.css`, `app.js`) to it.
2. In the repo: **Settings → Pages → Deploy from a branch → main → / (root)**.
3. Wait a minute, then visit `https://<your-username>.github.io/neurostudy/`.

That gives you a real, shareable URL — the fastest path to putting this in
front of classmates and seeing who comes back a second time.

## What's in V1

- Add courses, pick a task type and available time
- 8-trial reaction/vigilance check + a Corsi-style visual working-memory task
- Personal baseline built from your last 3–5 checked sessions (not compared
  to other people)
- Auto-generated block/break plan with a one-line explanation of *why*
- Countdown timer per block
- Post-session check-in (focus, completion, block-length feedback)
- Local history + basic stats on the home screen

## What's intentionally left out (V2+)

- Study audio recommendations
- Cross-device sync / accounts (would need a real backend)
- Adaptive block-length learning from many sessions
- Sleep/energy tracking
- Teacher/researcher dashboards

## Honest caveats to keep in the product

- The cognitive check is not a validated clinical instrument — it's inspired
  by real paradigms (PVT-style reaction task, Corsi-style span task) but
  isn't administered to research-grade protocol.
- Never present results as diagnosing anything. All framing should stay
  "compared to your own recent baseline," never population norms or
  clinical language.
- Baseline needs 3+ sessions with a completed cognitive check before it
  means anything — the app says so rather than pretending otherwise.
