# Daily Brief 12 Punch

Numbers-first verification with link relevance checks and a critical-analysis summary.

## What it does
- Pulls a public Google Doc by link ("Anyone with the link can view").
- Extracts text, tables, and hyperlinks.
- Verifies numeric claims against linked sources.
- Rates each linked source for relevance.
- Adds a critical-analysis checklist (missing sources, weak links, placeholders).

## What it does not do (yet)
- Comments/suggestions in the Doc.
- Image or chart OCR.
- Full web-search verification when no links are present.

## Run locally (Python)
1. Install dependencies
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Start the app
```
uvicorn app.main:app --reload
```

3. Open in browser
```
http://127.0.0.1:8000
```

## Source policy
Blocked by default:
- Reddit and social platforms
- Wikipedia/Wikimedia
- Competitive-exam prep sites
- Dubious market-research aggregators

Low-trust but allowed:
- Blog platforms (e.g., Substack, Medium) when the author is credible

You can tweak this in `app/core/source_policy.py`.

## Deploy on Netlify (static + serverless function)
1. Push the repo to GitHub.
2. In Netlify, create a new site from GitHub.
3. Use these settings:
   - Build command: leave empty
   - Publish directory: `site`
   - Functions directory: `netlify/functions`
4. Deploy.

The UI will be hosted at your Netlify URL. The Verify button calls the Netlify function at `/.netlify/functions/verify`.

## Next steps (when you want)
- Add web search integration for claims without links.
- Add OCR for charts.
- Add LLM critique pass for narrative structure.
