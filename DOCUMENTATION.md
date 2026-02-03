# Daily Brief 12 Punch Documentation

## Overview
Daily Brief 12 Punch is a newsroom-friendly fact-checking tool that prioritizes numeric verification first, then link relevance, and finally broader critique. It accepts a public Google Doc link, extracts content, and returns a structured verification report with green/yellow/red status signals plus a critical-analysis summary.

## Core Workflow
1. Numbers-first verification
2. Link relevance verification
3. Date claim detection
4. Critical analysis summary

## What It Checks
- Numeric claims in sentences and tables
- Hyperlink relevance to nearby claims
- Date mentions (flagged for manual verification)

## What It Does Not Check Yet
- Comments or suggestions in Google Docs
- Image or chart OCR
- Full web search for unlinked claims

## Source Policy
Blocked by default:
- Wikipedia and Wikimedia
- Reddit
- Social media platforms
- Competitive-exam prep sites
- Dubious market-research aggregators

Low-trust but allowed:
- Blog platforms such as Substack or Medium, when the author is credible

Edit the policy in `app/core/source_policy.py`.

## System Architecture
- `app/main.py`
  - FastAPI entry point and `/api/verify` endpoint.
- `app/core/gdoc.py`
  - Fetches public Google Doc HTML export.
- `app/core/parse.py`
  - Extracts text, tables, and hyperlinks into segments.
- `app/core/claims.py`
  - Extracts numeric and date claims from segments.
- `app/core/verify.py`
  - Link relevance scoring and numeric verification against linked sources.
- `app/core/critical.py`
  - Generates critical-analysis notes.
- `app/templates/index.html`, `app/static/*`
  - Simple UI.

## Running Locally
1. Install dependencies
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Start the server
```
uvicorn app.main:app --reload
```

3. Open the app
```
http://127.0.0.1:8000
```

## API Usage
`POST /api/verify`

Request body:
```
{
  "doc_url": "https://docs.google.com/document/d/..."
}
```

Response sections:
- `numbers`: numeric claims and status
- `links`: link relevance checks
- `dates`: date claims (flagged as needing sources)
- `critical`: critical analysis notes

## Operational Notes
- Google Doc must be shared as “Anyone with the link can view.”
- Link verification checks the linked page content against nearby claim keywords.
- Numeric verification checks whether the number appears in the linked source.

## Roadmap Ideas
- Add web search verification for unlinked claims
- Add OCR for charts and images
- Add richer date/location/entity verification
- Add report export to Markdown/PDF
