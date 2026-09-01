# Sweep Methodology Notes
*Last updated: 01/09/26 — written ahead of LinkedIn classic search retirement (September 2026)*

---

## Current technique (active until LinkedIn classic dies)

Six LinkedIn URL batches per sweep via Claude in Chrome, reading `innerText` from job listing pages. Posts search as a seventh pass. Results written to Supabase when new. Sweep ID stored in `jsid`.

**Batch structure:**
- A: Amsterdam — `"creative producer" OR "senior producer" OR "executive producer" OR "producent" OR "AI producer"` + `geoId=102011674`
- B: Amsterdam — `"creative operations" OR "creative project manager" OR "head of production" OR "production manager"` + `f_JT=C,F`
- NL/UK/DE remote — same keywords + `f_WT=2` (remote) + `f_JT=C,F`
- Posts — 4 Dutch/English keyword searches via `/search/results/content/`

**Critical URL pattern (do not break):**
Always use BOTH `location=Amsterdam%2C+North+Holland%2C+Netherlands` AND `geoId=102011674` together. Omitting either causes LinkedIn AI mode to redirect to irrelevant results.

---

## What's broken with the current approach

**Signal-to-noise is poor.** A typical sweep touches 40-60 results and yields 0-2 new entries. Most results are: promoted ads from Jeoff's Amsterdam creative profile (AKQA, WINK, DEPT), Ruby Labs spamming every batch across 12 EU countries, already-viewed roles, and gaming/DTC/performance marketing roles that don't belong.

**Coverage gaps.** LinkedIn only surfaces what companies choose to post there. The Amsterdam creative producer market also moves through: studio career pages (Ambassadors, W+K, Buck, Glassworks, Framestore, Monks), recruiter networks (Creative Personnel, YunoJuno, The Dots), and Dutch job boards (Indeed NL, Monsterboard, Jobbird, Nationale Vacaturebank). None of these are touched by the current sweep.

**No persistent seen-list.** Every sweep re-evaluates the same 30 known roles (Storio, INDG, Ruby Labs, etc.) manually. There's no `jseen` key in Supabase storing evaluated job URLs/titles. This wastes significant sweep time and cognitive overhead.

**Posts search doesn't work.** In practice it returns industry commentary (Edinburgh TV Festival debates, IBC conference posts, AI tool roundups) rather than freelance briefs. The premise is sound — Dutch production people do announce briefs informally before job boards — but the keyword set `"wij zoeken producent campagne"` doesn't find them. Those posts are personal and specific, often tagging individuals or shared in private groups. No sweep has ever returned a usable lead via the posts search.

**No quality filtering.** Roles with "DTC", "Meta Ads", "performance marketing", "gaming", "e-learning", salary < £40K are manually identified and skipped each sweep rather than auto-filtered.

---

## LinkedIn AI search — what was tested (01/09/26)

**New URL format:** `/jobs/search-results/?keywords=[natural language]&origin=SEMANTIC_SEARCH`

No `geoId` equivalent exists. Location must go into the keyword query text.

**Test results:**
- `"Senior creative producer Amsterdam animation VFX CG"` → 2 results (Deloitte wrong role, In2Content known). Useless.
- `"Creative producer remote Netherlands EU"` → 25+ results, Ruby Labs posting same "Ad Creative Producer" job across 12 EU countries, Mira x3, US/Cyprus/Serbia roles. No location filtering whatsoever.

**Verdict:** AI search is currently unusable for location-specific sweeps. Results are global noise dominated by DTC/gaming/performance marketing roles and spam postings.

---

## New technique — build this when classic dies

### 1. Multi-source from the start

LinkedIn becomes one input among several rather than the only one:

| Source | What it catches | URL pattern |
|--------|----------------|-------------|
| Indeed NL | Dutch market, branded content roles | `nl.indeed.com/jobs?q=[role]&l=Amsterdam&sort=date` |
| Monsterboard | Dutch agencies, mid-market studios | `monsterboard.nl/vacatures/zoeken?q=[role]&where=Amsterdam` |
| Nationale Vacaturebank | Broader Dutch market | `nationalevacaturebank.nl/vacature/zoeken?query=[role]&location=Amsterdam` |
| LinkedIn AI search | English-language broad sweep, accept noise | `/jobs/search-results/?keywords=[natural language]&origin=SEMANTIC_SEARCH` |
| Studio career pages | Roles that never hit job boards | Direct fetch of 8-10 key studio /jobs pages |

**Studio career pages to monitor:**
- ambassadors.nl/jobs
- wk.com/careers (W+K Amsterdam)
- buck.co/careers
- glassworks.co.uk/careers
- framestore.com/careers
- deptagency.com/careers
- monks.com/careers
- nomobo.com

### 2. Persistent seen-list

Add `jseen` key to Supabase storing a set of evaluated job identifiers (company+title or URL hash). Future sweeps skip anything in `jseen` without re-evaluating. This eliminates re-processing known roles.

Implementation: `db.get('jseen')` → Set → check before adding → `db.set('jseen', updatedSet)` after sweep.

### 3. Fix or drop posts search

**Option A — Fix it:** Search by specific people rather than keywords. Identify 5-10 talent coordinators and recruiters at target studios (e.g. Anna Söderström at Adidas externals pattern). Check their recent posts directly. Signal is much higher.

**Option B — Drop it:** Replace the posts slot with a career page fetch from 2-3 studios per sweep (rotate through the list). Career pages surface roles that never hit LinkedIn.

Recommendation: Drop the broad keyword posts search. Add targeted person-specific checks or career page fetches instead.

### 4. Quality filter (auto-skip)

Any result matching these patterns gets skipped without manual review:
- DTC / Meta Ads / performance marketing / ecommerce
- Gaming / game studio
- E-learning / edtech
- Salary < £40K or < €45K where stated
- Location: US, Canada, Australia (unless explicitly remote EU)
- Ruby Labs (permanently on skip list — known spammer)

### 5. Market timing

- **July–August:** Reduce to 1 sweep/week. Market is dead.
- **September–November:** 2 sweeps/week. Agencies planning Q4 and next year.
- **December:** 1 sweep/week. Quiet again but worth watching for January starts.
- **January–June:** 2 sweeps/week. Main hiring season.

---

## Summary in one sentence

Replace six identical LinkedIn batches with a smaller set of LinkedIn AI queries + four Dutch job board URL checks + six studio career page fetches, with a persistent `jseen` seen-list eliminating re-evaluation, and drop the keyword posts search in favour of monitoring specific recruiters' activity or studio career pages directly.
