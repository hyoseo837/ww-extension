<div align="center">

<img src="icons/icon128.png" width="96" alt="WW Extension" />

# WW Extension

**AI-powered job scorer for WaterlooWorks**

Score every co-op posting against your CV in seconds. See which jobs are worth applying to without reading 200 descriptions.

<sub>Chrome · Manifest V3 · Google Gemini</sub>

</div>

---

![Sidebar in action on WaterlooWorks](screenshots/wwextsidebar.png)

## What it does

WaterlooWorks dumps hundreds of postings on you each cycle. This extension reads each posting, compares it against your profile and preferences using Google Gemini, and gives you a verdict:

- **Score 1–10** — how well the job fits you
- **Verdict** — `Apply`, `Consider`, or `Skip`
- **Reason** — 2–3 sentences explaining why

Scores appear as inline badges directly in the WaterlooWorks job table and persist across navigation, so you can come back later and pick up where you left off.

## Features

| | |
|---|---|
| **Bulk scan** | One click scans every posting in your current search and injects badges into the table as results come in. |
| **Ranked sidebar** | A sortable, filterable list of all scored jobs. Click any entry to jump straight to its row. |
| **CV extraction** | Drop in your CV PDF — Gemini extracts the relevant profile text automatically. Edit before saving. |
| **Custom criteria** | Free-form match rules ("prefer remote", "ignore Web3 companies", "weight ML roles higher"). |
| **Bulk save** | Filter by score threshold + verdict, then push matching jobs into a WW folder in one shot. |
| **Context caching** | Your profile is cached server-side per scan, so each scoring call sends only the job description. |
| **Token counter** | Cumulative input / output / cached tokens, so you know exactly what you're spending. |
| **Light + dark** | Theme follows your preference and applies to both the options page and the sidebar. |

## Screenshots

<table>
<tr>
<td width="50%"><b>Profile & CV setup</b><br/><img src="screenshots/wwextprofile.png" alt="Profile and context settings" /></td>
<td width="50%"><b>API key & token usage</b><br/><img src="screenshots/wwextoption.png" alt="API configuration and token counter" /></td>
</tr>
</table>

## Installation

Not published to the Chrome Web Store — install in developer mode:

```bash
git clone https://github.com/<you>/ww-extension.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the cloned folder
4. The extension icon will appear in your toolbar

## Setup

1. Grab a free [Gemini API key](https://aistudio.google.com/app/apikey).
2. Click the extension icon to open the options page.
3. **API Configuration** → paste your key, pick a model, save.
4. **Profile & Context** → upload your CV PDF, click **Extract Profile**, optionally edit the text, then add any custom match criteria and **Update Profile**.

## Usage

1. Open `waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm` and run a job search.
2. Click the floating **AI Score** button (bottom-right) to open the sidebar.
3. Hit **Scan All Jobs**. Badges appear on table rows as each posting finishes scoring.
4. Filter the sidebar by minimum score and verdict, then click **Save to Folder** to bulk-add matches to a WaterlooWorks folder.

## Models

| Model | Notes |
|---|---|
| `gemini-2.5-flash` | Default. Fast, cheap, good enough for bulk triage. |
| `gemini-2.5-pro`   | Higher-quality reasoning. Slower and more expensive per token. |

## Privacy

Everything stays local. Your CV, API key, preferences, and scores live in `chrome.storage.local`. The only outbound traffic is direct browser → Gemini API. No analytics, no proxy, no third-party servers.

## Architecture

Plain JS, no build step, no dependencies.

```
manifest.json             Manifest V3 config
src/
├── content.js            Sidebar UI, table badge injection, pagination
├── background.js         Gemini API calls (service worker), token counter
├── page-bridge.js        Injected page script — extracts WW auth tokens,
│                         fetches posting HTML with the page's session cookies
├── options.js            Options page logic (CV upload, settings, theme)
└── sidebar.css           Sidebar + badge styles
options.html              Options page (API key, CV, preferences, theme)
```

Why a page bridge? WaterlooWorks gates posting detail requests behind dynamic CSRF-style tokens embedded in the page. The bridge runs in the page's JS context so it can read those tokens and reuse the user's session cookies — the content script alone can't.

## License

Personal project — no license attached. Fork at your own risk.
