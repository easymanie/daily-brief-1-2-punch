from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, HttpUrl

from .core import claims as claim_module
from .core import gdoc, parse, verify, critical

app = FastAPI(title="Daily Brief 12 Punch")

templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")


class VerifyRequest(BaseModel):
    doc_url: HttpUrl


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/verify")
def verify_doc(payload: VerifyRequest):
    fetch = gdoc.fetch_doc_html(str(payload.doc_url))
    segments = parse.extract_segments(fetch.html)

    numeric_claims = claim_module.extract_numeric_claims(segments)
    date_claims = claim_module.extract_date_claims(segments)

    link_results = verify.check_links(segments)
    numeric_checks = verify.check_numeric_claims(numeric_claims, link_results)

    critique = critical.generate_critique(segments, numeric_claims, link_results)

    numeric_map = {check.claim_id: check for check in numeric_checks}

    response = {
        "doc_id": fetch.doc_id,
        "numbers": [
            {
                "claim_id": claim.claim_id,
                "text": claim.text,
                "numbers": claim.numbers,
                "status": numeric_map[claim.claim_id].status,
                "notes": numeric_map[claim.claim_id].notes,
                "links": [link.url for link in claim.links],
            }
            for claim in numeric_claims
        ],
        "links": [
            {
                "url": link.url,
                "anchor": link.anchor,
                "status": link_results[link.url].status,
                "quality": link_results[link.url].quality,
                "notes": link_results[link.url].notes,
            }
            for link in parse.iter_links(segments)
            if link.url in link_results
        ],
        "dates": [
            {
                "claim_id": claim.claim_id,
                "text": claim.text,
                "dates": claim.dates,
                "status": "yellow",
                "notes": "Date claims need a linked source for verification",
                "links": [link.url for link in claim.links],
            }
            for claim in date_claims
        ],
        "critical": [
            {"severity": item.severity, "note": item.note} for item in critique
        ],
    }

    return response
