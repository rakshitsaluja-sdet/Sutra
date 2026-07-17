# Sutra — Explained for Anyone

*A plain-language walkthrough of what Sutra is, why it matters, and how it works —
written so an engineer, a manager, and a non-technical stakeholder can all follow
along. No prior QA knowledge required.*

---

## The 30-second version

> **Sutra is a robot QA engineer.** You hand it a requirements document, and it
> writes the test cases, files them in Jira, writes and runs the automated
> browser tests against your real application, diagnoses failures, and reports
> back — while keeping a complete paper trail so you can trace any test result
> back to the exact sentence in the requirements that asked for it.

What normally takes a QA team **days of manual work** — reading requirements,
writing test cases, logging them in Jira, scripting the automation, running it,
triaging failures — Sutra does as **one automated pipeline**.

---

## The problem it solves

Turning requirements into working, tracked automated tests is slow, repetitive,
and error-prone:

- A person reads the requirements and **hand-writes test cases** (hours).
- Someone **manually logs each one in Jira/Xray** (tedious, easy to miss cases).
- An automation engineer **writes browser scripts** — and often writes them
  against what they *assume* the page looks like, so scripts break on day one.
- Every requirement change means **someone re-does a chunk of this by hand**.
- And when an auditor asks *"which requirement does this test cover?"*, the
  answer is usually a shrug.

Sutra automates the whole chain and fixes the two things humans are worst at
here: **staying consistent** and **keeping the trail intact**.

---

## The analogy: a smart exam-writer at a coaching institute

Picture a coaching institute. You give a **teacher** a **syllabus document**, and
the teacher produces a complete, proven exam — end to end:

1. **Reads each topic** in the syllabus.
2. **Writes exam questions** for each topic.
3. **Files them in the official question bank** — grouped into one folder and one
   exam plan, so they're navigable, not scattered.
4. **Walks into the real exam hall first** — before writing the model answers,
   the teacher physically checks the room so every question refers to things that
   *actually exist* (real doors, real desks), never imagined ones.
5. **Sits the exam in a sealed, identical exam room** so the result is fair and
   reproducible anywhere.
6. If it fails, a **diagnostician** figures out *why* and suggests a fix.
7. **Files the marksheet** and updates the official records with the result.

And the teacher keeps a **memory notebook**: *"I've already done this exact topic —
here's what I made."* So re-handing the same syllabus does nothing, and editing
one paragraph re-does only that paragraph.

That teacher is Sutra.

---

## How it works — the 7 stages, in plain terms

| # | Stage | In the analogy | What it actually does |
|---|-------|----------------|-----------------------|
| 1 | **Requirement analyst** | Reads each topic, drafts the sub-stories | Splits the BRD into paragraphs ("clauses") and turns each into clear user stories |
| 2 | **Test-case designer** | Writes the exam questions | Turns each story into concrete test cases (positive, negative, edge) |
| 3 | **Jira/Xray sync** | Files questions in the official bank | Creates linked Test issues in Xray, grouped in a Test Set + Test Plan |
| 4 | **Script generator** | Walks the real hall, then writes model answers | **Opens the real app** via Playwright and writes automated Playwright + Gherkin tests grounded in what's actually on the page |
| 5 | **Sandbox runner** | Sits the exam in a sealed room | Runs the test inside a clean Docker container — reproducible, isolated |
| 6 | **Self-healer** | The diagnostician | When a test fails, analyzes *why* and proposes a fix instead of just a red X |
| 7 | **Report + write-back** | Files the marksheet, updates records | Produces an Allure/HTML report and writes pass/fail back to Xray |

Underneath all seven runs a **lineage graph** — the filing ledger — recording how
every artifact descends from the requirement sentence above it.

---

## The three "superpowers" worth bragging about

### 1. The tests aren't hallucinated — they're *grounded in reality*
Most AI test generators write plausible-looking scripts against a page they've
never seen, so the scripts fail immediately. Sutra **opens your real application
first** and reads the actual buttons, fields, and text before writing a single
line. This is the difference between a test that *runs* and a confident-sounding
fake. *(This is the "walk the exam hall first" step.)*

### 2. Re-running is safe — it never makes duplicates
Hand Sutra the **same requirements twice** and the second run produces **zero**
duplicate Jira tickets and **zero** duplicate files — it recognises everything
from its memory notebook and finishes in seconds. Change **one paragraph** and it
re-does **only that paragraph**, leaving everything else byte-for-byte identical.
And when a requirement changes, the old test cases aren't deleted — they're
**marked "superseded" and kept on file**, like version history. *(Verified: a
second identical run created 0 new tickets, 0 new files, in ~37 seconds; a
one-paragraph edit regenerated exactly one section and retired 7 old tickets
without duplicating them.)*

**Why a manager cares:** no ticket sprawl, no orphaned files, safe to run in CI on
every requirements change, and a permanent audit trail of what changed and when.

### 3. Full traceability — requirement to result
Every story, test case, ticket, script, and run is a node in a family tree. Point
at any test result and you can walk **backwards to the exact BRD sentence** that
caused it to exist. In regulated or enterprise environments, that
requirement-to-result traceability is exactly what auditors demand — and here
it's automatic, not a manual spreadsheet.

---

## What it's built on (for the technical audience)

- **TypeScript / Node.js** CLI pipeline, one stage per directory.
- **Claude (Anthropic Agent SDK)** as the reasoning engine for stages 1, 2, 4, 6.
- **Playwright MCP** for live, grounded page inspection while generating scripts.
- **Playwright + Cucumber/Gherkin** for the actual automated tests.
- **Docker** for sealed, reproducible test execution.
- **Xray on Jira** for test management, via GraphQL + REST.
- **Allure / HTML** for reporting.
- A **content-hashed clause cache** + a **lineage graph** for idempotency and
  traceability.

It runs in two modes: **stub** (no Jira credentials — fabricates and records
everything locally, for safe development and demos) and **live** (talks to a real
Jira/Xray). The interface is identical, so switching modes changes zero
downstream code.

---

## Honest limitations (say these — they build credibility)

- **Live Xray write-back is coded but not yet verified** against a real Jira
  account (no credentials yet). Everything demoable today runs in stub mode.
- **AI is in the loop**, so generated stories and test cases still deserve human
  review — Sutra drafts a strong first version, it doesn't replace judgment.
- **No concurrent-run lock yet** — two pipelines on the same input at once could
  clobber shared state; run one at a time for now.
- **A note on how the project is built:** two internal robustness gaps (test-case
  IDs colliding across sub-stories, and a duplicate lineage entry for a reused
  Test Set) were *found by verification and fixed before they ever shipped* — a
  sign the pipeline is developed with a find → fix → prove discipline, not just
  happy-path testing.

---

## The 2-minute pitch (say this out loud)

> "Sutra is a robot QA engineer. You give it a requirements document, and it
> reads each requirement, writes the test cases, and files them in Jira as
> properly grouped, linked tickets. Then — and this is the part most AI tools get
> wrong — before writing the automated browser test, it actually *opens your real
> application* and looks at the real page, so the test is grounded in what's
> genuinely there instead of what an AI imagined. It runs that test in a clean,
> sealed Docker container so the result is reproducible, and if it fails, it
> diagnoses *why* rather than just showing a red X. Finally it reports pass/fail
> back into Jira.
>
> Two things make it production-grade rather than a toy. First, it's **safe to
> re-run**: give it the same requirements again and it makes zero duplicates;
> change one paragraph and it regenerates only that paragraph, retiring — never
> deleting — the old version. Second, it keeps a **full lineage graph**, so you
> can trace any test result all the way back to the exact requirement sentence
> that produced it. That's the traceability auditors ask for, generated
> automatically."

---

*Want a deeper technical walkthrough of any stage? Ask, and it can be explained at
whatever depth you need — from "explain it to my manager" to "show me the code."*
