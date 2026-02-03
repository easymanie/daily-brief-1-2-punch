const cheerio = require('cheerio');

let fetchImpl = global.fetch;
if (!fetchImpl) {
  fetchImpl = require('node-fetch');
}

if (typeof AbortController === 'undefined') {
  const AbortControllerShim = require('abort-controller');
  global.AbortController = AbortControllerShim;
}

const BLOCKED_DOMAINS = new Set([
  'wikipedia.org',
  'wikimedia.org',
  'reddit.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'quora.com',
]);

const COMP_EXAM_HINTS = [
  'byju',
  'toppr',
  'testbook',
  'gradeup',
  'unacademy',
  'embibe',
  'adda247',
  'careerpower',
  'bankersadda',
  'ssc',
  'upsc',
  'neet',
  'jee',
];

const DUBIOUS_MARKET_RESEARCH = [
  'fortunebusinessinsights',
  'grandviewresearch',
  'marketresearchfuture',
  'reportlinker',
  'alliedmarketresearch',
  'researchandmarkets',
  'mordorintelligence',
  'imarcgroup',
  'verifiedmarketresearch',
  'marketsandmarkets',
  'databridge',
  'precedenceresearch',
  'futuremarketinsights',
  'gminsights',
  'coherentmarketinsights',
];

const LOW_TRUST_HINTS = ['blogspot', 'wordpress', 'medium.com', 'substack.com'];

const STOPWORDS = new Set([
  'the','and','a','an','to','of','in','for','on','with','by','is','are','was','were','as','at','from','that','this','it','be','or','their','they','has','have','had','not','but','which','who','will','would','can','could','should','into'
]);

const NUMBER_RE = /(?<!\w)(?:[₹$€£]?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*%|\s*(?:cr|crore|lakh|mn|million|bn|billion))?(?!\w)/gi;
const DOC_ID_RE = /\/d\/([a-zA-Z0-9_-]+)/;

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTH_RE = new RegExp(`\\b(${MONTHS.join('|')})\\b`, 'i');
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;
const FISCAL_RE = /\bFY\s?\d{2}\b|\bQ\d\s?FY\s?\d{2}\b/i;

const cleanText = (text) => text.replace(/\s+/g, ' ').trim();

const extractDocId = (url) => {
  const match = DOC_ID_RE.exec(url);
  if (!match) throw new Error('Could not extract Google Doc ID');
  return match[1];
};

const exportUrl = (docId) => `https://docs.google.com/document/d/${docId}/export?format=html`;

const fetchWithTimeout = async (url, timeoutMs = 20000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
  const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const extractTextFromHtml = (html) => {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return cleanText($.text());
};

const extractSegments = (html) => {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  const selectors = ['p','li','h1','h2','h3','h4','h5','h6','td','th'];
  const segments = [];

  selectors.forEach((selector) => {
    $(selector).each((_, el) => {
      const text = cleanText($(el).text());
      if (!text) return;
      const links = [];
      $(el).find('a[href]').each((__, linkEl) => {
        const href = $(linkEl).attr('href');
        if (!href || href.startsWith('#')) return;
        links.push({ url: href, anchor: cleanText($(linkEl).text()) });
      });
      segments.push({ text, links });
    });
  });

  return segments;
};

const iterLinks = (segments) => {
  const seen = new Set();
  const unique = [];
  segments.forEach((segment) => {
    segment.links.forEach((link) => {
      if (seen.has(link.url)) return;
      seen.add(link.url);
      unique.push(link);
    });
  });
  return unique;
};

const splitSentences = (text) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

const extractNumericClaims = (segments) => {
  const claims = [];
  let idx = 1;
  segments.forEach((segment) => {
    splitSentences(segment.text).forEach((sentence) => {
      const matches = sentence.match(NUMBER_RE);
      if (!matches || !matches.length) return;
      claims.push({
        claim_id: `num-${idx}`,
        text: sentence,
        fact_type: 'number',
        numbers: matches.map((m) => m.trim()),
        links: segment.links,
      });
      idx += 1;
    });
  });
  return claims;
};

const extractDateClaims = (segments) => {
  const claims = [];
  let idx = 1;
  segments.forEach((segment) => {
    splitSentences(segment.text).forEach((sentence) => {
      if (!(MONTH_RE.test(sentence) || YEAR_RE.test(sentence) || FISCAL_RE.test(sentence))) return;
      const dates = [];
      const monthMatches = sentence.match(new RegExp(MONTH_RE, 'gi'));
      const yearMatches = sentence.match(new RegExp(YEAR_RE, 'g'));
      const fiscalMatches = sentence.match(new RegExp(FISCAL_RE, 'gi'));
      if (monthMatches) dates.push(...monthMatches);
      if (yearMatches) dates.push(...yearMatches);
      if (fiscalMatches) dates.push(...fiscalMatches);
      claims.push({
        claim_id: `date-${idx}`,
        text: sentence,
        fact_type: 'date',
        dates,
        links: segment.links,
      });
      idx += 1;
    });
  });
  return claims;
};

const baseDomain = (host) => host.replace(/^www\./i, '').toLowerCase();

const classifySource = (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return { allowed: false, reason: 'Invalid URL', quality: 'blocked' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { allowed: false, reason: 'Unsupported URL scheme', quality: 'blocked' };
  }

  const host = baseDomain(parsed.hostname);
  if (!host) return { allowed: false, reason: 'Invalid URL', quality: 'blocked' };

  for (const blocked of BLOCKED_DOMAINS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) {
      return { allowed: false, reason: `Blocked domain: ${blocked}`, quality: 'blocked' };
    }
  }

  for (const hint of COMP_EXAM_HINTS) {
    if (host.includes(hint)) {
      return { allowed: false, reason: 'Competitive exam prep source', quality: 'blocked' };
    }
  }

  for (const hint of DUBIOUS_MARKET_RESEARCH) {
    if (host.includes(hint)) {
      return { allowed: false, reason: 'Dubious market-research source', quality: 'blocked' };
    }
  }

  for (const hint of LOW_TRUST_HINTS) {
    if (host.includes(hint)) {
      return { allowed: true, reason: 'Low-trust blog platform', quality: 'low' };
    }
  }

  return { allowed: true, reason: null, quality: 'standard' };
};

const keywordsFromText = (text) => {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  return words.filter((word) => !STOPWORDS.has(word));
};

const keywordHits = (text, keywords) => {
  const lowered = text.toLowerCase();
  let hits = 0;
  keywords.forEach((keyword) => {
    if (lowered.includes(keyword)) hits += 1;
  });
  return hits;
};

const normalizeNumber = (num) => {
  const raw = num.trim();
  const variants = new Set([raw]);
  const cleaned = raw.replace(/,/g, '');
  variants.add(cleaned);
  variants.add(cleaned.replace(/\s/g, ''));
  if (raw.endsWith('%')) variants.add(raw.replace('%', ' %'));
  return Array.from(variants);
};

const numberInText = (num, text) => {
  const variants = normalizeNumber(num);
  return variants.some((variant) => variant && text.includes(variant));
};

const checkLinks = async (segments) => {
  const cache = new Map();
  const results = {};

  for (const segment of segments) {
    const keywords = keywordsFromText(segment.text);
    for (const link of segment.links) {
      if (results[link.url]) continue;

      const source = classifySource(link.url);
      if (!source.allowed) {
        results[link.url] = {
          url: link.url,
          status: 'red',
          quality: source.quality,
          notes: source.reason || 'Blocked source',
        };
        continue;
      }

      try {
        if (!cache.has(link.url)) {
          const resp = await fetchWithTimeout(link.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('pdf')) {
            results[link.url] = {
              url: link.url,
              status: 'yellow',
              quality: source.quality,
              notes: 'Linked source is a PDF; relevance not auto-verified yet',
            };
            continue;
          }
          const html = await resp.text();
          cache.set(link.url, html);
        }
        const text = extractTextFromHtml(cache.get(link.url));
        const hits = keywordHits(text, keywords);
        let status = 'red';
        let notes = 'Link content appears unrelated to nearby claim';
        if (hits >= 3) {
          status = 'green';
          notes = 'Link content appears relevant to nearby claim';
        } else if (hits >= 1) {
          status = 'yellow';
          notes = 'Link is weakly related to nearby claim';
        }
        results[link.url] = {
          url: link.url,
          status,
          quality: source.quality,
          notes,
        };
      } catch (err) {
        results[link.url] = {
          url: link.url,
          status: 'yellow',
          quality: source.quality,
          notes: `Could not fetch link (${err.name || 'error'})`,
        };
      }
    }
  }

  return results;
};

const checkNumericClaims = async (claims, linkResults) => {
  const checks = [];
  const cache = new Map();

  for (const claim of claims) {
    if (!claim.links || !claim.links.length) {
      checks.push({
        claim_id: claim.claim_id,
        status: 'yellow',
        notes: 'No linked source near this numeric claim',
      });
      continue;
    }

    let bestStatus = 'yellow';
    let notes = 'No matching number found in linked sources';

    for (const link of claim.links) {
      const linkCheck = linkResults[link.url];
      if (linkCheck && linkCheck.status === 'red') {
        notes = 'Linked source appears irrelevant or blocked';
        continue;
      }

      if (linkCheck && linkCheck.status === 'yellow') {
        bestStatus = 'yellow';
      }

      try {
        if (!cache.has(link.url)) {
          const resp = await fetchWithTimeout(link.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('pdf')) {
            notes = 'Linked source is a PDF; numeric match not auto-verified yet';
            continue;
          }
          const html = await resp.text();
          cache.set(link.url, html);
        }
        const text = extractTextFromHtml(cache.get(link.url));
        if (claim.numbers.some((num) => numberInText(num, text))) {
          bestStatus = 'green';
          notes = 'Number appears in linked source';
          break;
        }
      } catch (err) {
        notes = 'Linked source could not be fetched';
      }
    }

    checks.push({
      claim_id: claim.claim_id,
      status: bestStatus,
      notes,
    });
  }

  return checks;
};

const generateCritique = (segments, numericClaims, linkResults) => {
  const items = [];
  const links = Object.values(linkResults);
  const totalLinks = links.length;
  const blockedLinks = links.filter((link) => link.status === 'red').length;
  const weakLinks = links.filter((link) => link.status === 'yellow').length;

  if (blockedLinks) {
    items.push({ severity: 'medium', note: `${blockedLinks} linked sources are blocked or irrelevant; replace with higher-quality sources.` });
  }

  if (weakLinks) {
    items.push({ severity: 'low', note: `${weakLinks} linked sources look only weakly related to the nearby claim; tighten the linkage.` });
  }

  const unsourcedNumbers = numericClaims.filter((claim) => !claim.links || !claim.links.length).length;
  if (unsourcedNumbers) {
    items.push({ severity: 'high', note: `${unsourcedNumbers} numeric claims have no linked source. Add citations or soften the wording.` });
  }

  const placeholderSources = segments.filter((segment) => segment.text.toLowerCase().includes('source') && (!segment.links || !segment.links.length)).length;
  if (placeholderSources) {
    items.push({ severity: 'medium', note: `${placeholderSources} 'Source' placeholders found without links. Replace with actual URLs.` });
  }

  if (totalLinks === 0) {
    items.push({ severity: 'high', note: 'No hyperlinks were detected. This makes verification difficult.' });
  }

  return items;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    if (!payload.doc_url) {
      return { statusCode: 400, body: 'Missing doc_url' };
    }

    const docId = extractDocId(payload.doc_url);
    const response = await fetchWithTimeout(exportUrl(docId));
    if (!response.ok) {
      return { statusCode: response.status, body: 'Failed to fetch Google Doc' };
    }
    const html = await response.text();

    const segments = extractSegments(html);
    const numericClaims = extractNumericClaims(segments);
    const dateClaims = extractDateClaims(segments);

    const linkResults = await checkLinks(segments);
    const numericChecks = await checkNumericClaims(numericClaims, linkResults);
    const critique = generateCritique(segments, numericClaims, linkResults);

    const numericMap = {};
    numericChecks.forEach((check) => { numericMap[check.claim_id] = check; });

    const result = {
      doc_id: docId,
      numbers: numericClaims.map((claim) => ({
        claim_id: claim.claim_id,
        text: claim.text,
        numbers: claim.numbers,
        status: numericMap[claim.claim_id]?.status || 'yellow',
        notes: numericMap[claim.claim_id]?.notes || 'Needs manual verification',
        links: claim.links.map((link) => link.url),
      })),
      links: iterLinks(segments).map((link) => ({
        url: link.url,
        anchor: link.anchor,
        status: linkResults[link.url]?.status || 'yellow',
        quality: linkResults[link.url]?.quality || 'standard',
        notes: linkResults[link.url]?.notes || 'No relevance data',
      })),
      dates: dateClaims.map((claim) => ({
        claim_id: claim.claim_id,
        text: claim.text,
        dates: claim.dates,
        status: 'yellow',
        notes: 'Date claims need a linked source for verification',
        links: claim.links.map((link) => link.url),
      })),
      critical: critique,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: err.message || 'Unexpected error',
    };
  }
};
