---
name: explain-sutra
description: Explain Sutra — the project, its 7-stage pipeline, or any single concept (idempotency, clause caching, grounding, supersede, lineage, self-heal, sandbox) — in plain, non-technical, story/analogy-based language. Use when the user (or an audience: interviewer, manager, new teammate, non-engineer) asks "explain this simply", "in layman terms", "with an example/scenario", "so anyone can relate", or is preparing a walkthrough/demo/pitch. Not for writing code or debugging.
---

# Explaining Sutra in plain language

Sutra turns a requirements document (BRD) or a user story into Xray-linked test
cases and self-grounded Playwright automation, runs it in a sandbox, and writes
results back to Jira — with a full paper trail from requirement to result.

When someone asks for a **simple** explanation, do NOT list stage names and file
paths. Translate every piece of jargon into an everyday scenario, anchor it to
ONE running example, and show trade-offs/bugs as little "what could go wrong"
stories. This file gives you the master analogy, the vocabulary map, and
ready-made plain-English explanations to draw from.

## The method (how to explain, not just what)

1. **Open with the analogy, not the architecture.** Lead with the story world
   below, then map back to the real thing.
2. **Pick ONE running example and stay in it.** Default: the login BRD in
   `samples/sample-brd.md` (topics: "successful login", "invalid credentials").
   Don't switch examples mid-explanation.
3. **Jargon → everyday word, every time.** Never say "idempotent",
   "lineage node", or "supersede" without immediately giving the plain word.
4. **Explain risks as scenarios.** "Two students named Rahul share one locker"
   lands; "path-key collision" doesn't.
5. **Match the audience.** Manager/interviewer → business value + one clever
   detail. New engineer → analogy first, then the real file it maps to. Total
   non-technical → analogy only, skip the mapping table.
6. **Offer the ladder:** a 30-second version, a 2-minute version, and a
   "want the technical mapping?" follow-up. Let them pick the depth.

## The master analogy: the smart exam-writer at a coaching institute

You run a coaching institute. You hand a **teacher** a *syllabus document*, and
the teacher produces a full, working exam — and proves it works — end to end:

1. Reads each **topic** in the syllabus.
2. Writes **exam questions** for each topic.
3. Files those questions in the **official question bank**, grouped into one
   folder and one exam plan.
4. Before writing the **model answer sheet**, actually **walks into the real
   exam hall** to make sure the questions reference things that truly exist
   (real doors, real desks) — not imagined ones.
5. **Sits the exam in a sealed, identical exam room** so the result is fair and
   repeatable.
6. If it fails, a **diagnostician** works out *why* and suggests a fix.
7. Files the **marksheet** and updates the official records with pass/fail.

And crucially, the teacher keeps a **memory notebook**: "I already did this exact
topic — here's what I made." So re-handing the same syllabus does nothing, and
editing one paragraph re-does only that paragraph.

## The vocabulary map (story world → real system)

| Story world | Real system | Stage / file |
|---|---|---|
| Syllabus document | BRD or user story | input (`samples/*.md`) |
| One topic / paragraph | **Clause** | `clauseSplitter.ts` |
| Teacher's memory notebook | **Clause cache** | `clause-cache.json` |
| Sub-story of a topic | **User story** | Stage 01 requirement-analyst |
| Exam questions | **Test cases** | Stage 02 test-case-designer |
| Official question bank (folder + plan) | **Xray** Test issues, Test Set, Test Plan | Stage 03 jira-xray-sync |
| Walking the real exam hall first | **Grounding via Playwright MCP** | Stage 04 script-generator |
| Model answer sheet | **Playwright + Gherkin script** | Stage 04 script-generator |
| Sealed, identical exam room | **Docker sandbox** | Stage 05 sandbox-runner |
| The diagnostician | **Self-healer** | Stage 06 self-healer |
| Marksheet + updating records | **Report + Xray write-back** | Stage 07 report-writeback |
| The filing / paper-trail ledger | **Lineage graph** | `generated/lineage/graph.json` |
| Struck-through-but-kept old question | **Superseded** (never deleted) | supersede sequence |

## Ready-made plain-English explanations

**What Sutra is (one line):** "It's a robot QA engineer: hand it a requirements
document, and it writes the test cases, files them in Jira, writes and runs the
automated browser tests, and reports back — keeping a full trail so you can
trace any test result back to the exact sentence that asked for it."

**Idempotency (identical re-run does nothing):** "Photocopy a page twice, you
still have one page's worth of content — not two. Re-running the same,
unchanged requirements makes zero duplicates: same questions, same files, same
Jira tickets. Proven: the second run created 0 new tickets, 0 new files, and
finished in ~37 seconds because it recognised everything."

**Incremental regeneration (edit one paragraph):** "Change one topic in the
syllabus and the teacher redoes ONLY that topic — like track-changes editing one
paragraph of a document instead of retyping the whole thing. Everything else is
left byte-for-byte identical."

**Clause caching (the memory notebook):** "The teacher hashes each paragraph —
like a fingerprint of its exact words. Same fingerprint next time = 'I've done
this, here's what I made.' Different fingerprint = 'this changed, redo it.'"

**Supersede (never delete):** "When a topic changes, the old questions aren't
shredded — they're stamped 'superseded', a note is added, and they're pulled out
of the active set but kept on file. Like version history: nothing a human filed
is ever destroyed."

**Grounding (why the tests aren't hallucinated):** "Before writing a test, the
robot opens the *real* website and looks at the actual buttons and fields, so it
writes tests against what's genuinely on the page — not what an AI *imagined*
might be there. This is the difference between a test that runs and a
confident-sounding fake."

**Docker sandbox (fair exam room):** "The test runs in a sealed, identical
container every time — not on someone's laptop with its own quirks — so a pass
means it genuinely passed, reproducibly, anywhere."

**Self-healer (the diagnostician):** "When a test fails, instead of just a red X,
a diagnostician looks at *why* — wrong selector? page changed? feature not built
yet? — and proposes a fix, so a human starts from a diagnosis, not a mystery."

**Lineage graph (the paper trail):** "Every artifact — story, test case, ticket,
script, result — is a node in a family tree. You can point at any test result
and walk backwards to the exact BRD sentence that caused it to exist. That's
audit-grade traceability, which is gold in regulated or enterprise QA."

## Two gaps we found and fixed — as stories (great "how do you work?" answer)

*Both were caught by verification, not by a customer, and both are now fixed and
re-verified. This is a strong story to tell: it shows the find → fix → prove loop.*

**Gap 1 — two students, one locker (FIXED).** Exam questions are numbered
starting at 1 inside each sub-story, so one topic can contain two different
"Question 1"s. The answer sheet was filed in a folder *named after the question
number*, so two "Question 1"s in one topic could share — and overwrite — one
folder. Fix: added the sub-story name to the folder path (a roll number to tell
the two Rahuls apart) — folders are now `topic/sub-story/question`, provably
unique. Verified: every generated key is unique, no collisions.

**Gap 2 — the ledger wrote a duplicate line for the reused folder (FIXED).** The
real Jira folder was correctly reused every run, but the *paper-trail ledger*
wrote a fresh "…and here's the folder" line each run anyway, slowly accumulating
duplicates for the same one folder. Fix: on a reuse run the ledger now finds the
existing entry and just adds any new links to it, instead of writing a new line.
Verified: after a second run the ledger still has exactly one entry per folder.

## Depth ladder (offer these)

- **30-second:** "A robot QA engineer that turns a requirements doc into
  automated browser tests filed in Jira, runs them, and reports back — with a
  full trace from requirement to result."
- **2-minute:** the exam-writer analogy + the three superpowers (grounds tests
  in the real page, never makes duplicates, keeps a full paper trail).
- **Deep dive:** walk the vocabulary map row by row, then show the actual files.
