<div align="center">

<img src="ext/icons/icon128.png" width="96" alt="WW Extension" />

# WW Extension

**AI-powered job scorer for WaterlooWorks**

Score every co-op posting against your profile in seconds. See which jobs are worth applying to without reading 200 descriptions.

<sub>Chrome · Manifest V3 · Google Gemini</sub>

[**▶ Install from the Chrome Web Store**](https://chromewebstore.google.com/detail/ww-extension/bichfckekdcnmkenflpmmehegggcfgdd) · [Web app](https://ww-extension.hyoseo.dev)

<sub><i>Not affiliated with the University of Waterloo or WaterlooWorks.</i></sub>

</div>

---

[▶ Full walkthrough on YouTube](https://www.youtube.com/watch?v=oh_4EEv-ILs)

![Sidebar in action on WaterlooWorks](screenshots/extension/sidebar_scored.png)

## What it does

WaterlooWorks dumps hundreds of postings on you each cycle. This extension reads each posting, compares it against your profile and match criteria using Google Gemini, and gives you a verdict:

- **Score 1–20** — how well the job fits you
- **Verdict** — `Strong Apply`, `Apply`, `Consider`, `Unlikely`, `Skip`, or `Excluded` (a hard requirement, like citizenship, rules you out)
- **Breakdown** — the specific points that most moved the score, each marked as a plus or a minus

Scores appear as inline badges directly in the WaterlooWorks job table and persist across navigation, so you can come back later and pick up where you left off.

## How it works

Scoring runs on a hosted backend, not in your browser — so there's no API key to manage and nothing to configure.

1. **Sign in** with your UWaterloo account (Microsoft) from the extension or the [web app](https://ww-extension.hyoseo.dev). New accounts get **100 free credits**.
2. **Set up your profile** on the web app: upload your WaterlooWorks application-package PDF and Gemini extracts a structured profile; then a short wizard captures your match preferences — the facts (work authorization, locations, work mode, target term, languages) plus what matters most in your own words.
3. **Scan** from the WaterlooWorks jobs list. Each posting scored costs about 2 credits against your balance; top up any time.

## Features

|                       |                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Bulk scan**         | One click scores every posting in your current search and injects badges into the table as results come in.  |
| **Ranked sidebar**    | A sortable, filterable list of all scored jobs. Click any entry to jump straight to its row.                 |
| **Profile extraction**| Drop your application-package PDF into the web app — Gemini extracts a structured profile you can edit.       |
| **Match preferences** | The facts (work authorization, locations, work mode, target term, languages) plus a free-text "what matters most", which the scorer reads literally — "remote is non-negotiable" dominates, "a startup would be nice" nudges. |
| **Excluded gate**     | Postings that violate a hard requirement (e.g. work authorization, a ruled-out location) are flagged `Excluded` and sorted last. |
| **Bulk save**         | Filter by score threshold + verdict, then push matching jobs into a WaterlooWorks folder in one shot.        |
| **Both job boards**   | Works on Full-Cycle Service and Employer-Student Direct; scores follow you across both.                      |
| **Score feedback**    | 👍/👎 any verdict (with an optional one-liner on 👎) — flagged scores build the set future prompt tuning is tested against. |
| **Credit balance**    | A simple credit meter — 100 free to start, ~2 credits per scan, Stripe top-ups on the web app, full ledger in your billing history. |

## Screenshots

<table>
<tr>
<td width="50%"><b>Web dashboard — credits &amp; profile at a glance</b><br/><img src="screenshots/web/ww-extension.hyoseo.dev_dashboard.png" alt="Web app dashboard with credit balance and profile snapshot" /></td>
<td width="50%"><b>Match preferences — facts + your own words</b><br/><img src="screenshots/web/ww-extension.hyoseo.dev_preferences.png" alt="Match preferences: eligibility facts and free-text priorities" /></td>
</tr>
<tr>
<td width="50%"><b>Profile — extracted from your application package</b><br/><img src="screenshots/web/ww-extension.hyoseo.dev_profile.png" alt="Structured profile extracted from the application-package PDF" /></td>
<td width="50%"><b>Billing — full credit history</b><br/><img src="screenshots/web/ww-extension.hyoseo.dev_history.png" alt="Credit history with per-scan ledger" /></td>
</tr>
<tr>
<td width="50%"><b>Extension — options &amp; sign-in</b><br/><img src="screenshots/extension/option_page.png" alt="Extension options: how-to, account sign-in" /></td>
<td width="50%"><b>On WaterlooWorks — guided from the first click</b><br/><img src="screenshots/extension/ww_jobs_non_login.png" alt="Sidebar get-started guide on the WaterlooWorks jobs table" /></td>
</tr>
</table>

## Install

The easiest path is the [Chrome Web Store](https://chromewebstore.google.com/detail/ww-extension/bichfckekdcnmkenflpmmehegggcfgdd).

To run from source in developer mode:

```bash
git clone https://github.com/hyoseo837/ww-extension.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the **`ext/`** folder inside the cloned repo
4. The extension icon will appear in your toolbar

## Usage

1. Click the extension icon and **sign in** with your UWaterloo account, then set up your profile on the [web app](https://ww-extension.hyoseo.dev).
2. Open the WaterlooWorks jobs list — Full-Cycle Service (`/myAccount/co-op/full/jobs.htm`) or Employer-Student Direct (`/myAccount/co-op/direct/jobs.htm`) — and run a job search.
3. Click the **AI Score** tab on the right edge to open the sidebar, then hit **Scan All Jobs**. Badges appear on table rows as each posting finishes scoring.
4. Filter the sidebar by minimum score and verdict, then click **Save to Folder** to bulk-add matches to a WaterlooWorks folder.

## Privacy

This is an account-based service. When you sign in, we receive your `@uwaterloo.ca` email. Your profile (extracted CV text, preferences, and match criteria) is stored on the backend, tied to your account.

Each scoring call sends to Google Gemini:

- your profile and match criteria
- the job's title, organization, and description excerpt (capped at 6,000 characters)

Scores, credit balance, and billing records are kept server-side. You can review, export, or delete your data from the web app at any time.

Full policy: <https://ww-extension.hyoseo.dev/privacy> · Terms: <https://ww-extension.hyoseo.dev/terms>

## Architecture

A monorepo with three parts:

```
ext/      Chrome MV3 extension — plain JS, no build step (load this folder unpacked)
web/      Vite + React app — account, profile, billing, admin (ww-extension.hyoseo.dev)
server/   FastAPI backend — Gemini scoring, accounts, credits (Supabase + Stripe)
docs/     Specs, ADRs, and reference docs
```

Inside the extension:

```
ext/
├── manifest.json         Manifest V3 config
├── options.html          Options page (how-to, sign-in, web-app links)
└── src/
    ├── content.js        Sidebar UI, table badge injection, pagination
    ├── background.js     Talks to the backend (service worker), session refresh
    ├── page-bridge.js    Injected page script — extracts WW auth tokens,
    │                     fetches posting HTML with the page's session cookies
    ├── options.js        Options page logic (sign-in, settings)
    └── sidebar.css       Sidebar + badge styles
```

**Why a page bridge?** WaterlooWorks gates posting-detail requests behind dynamic CSRF-style tokens embedded in the page. The bridge runs in the page's JS context so it can read those tokens and reuse the user's session cookies — the content script alone can't.

## Feedback

Bugs and suggestions: [GitHub Issues](https://github.com/hyoseo837/ww-extension/issues).

## License

Personal project — no license attached. Fork at your own risk.
