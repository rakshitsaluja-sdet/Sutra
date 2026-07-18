# Sutra — Codebase Guide (interview-ready deep dive)

Read this top to bottom once and you can answer technical, architectural,
managerial, and scenario questions about the whole system. It goes concept →
data flow → cross-cutting "spine" → stage-by-stage → end-to-end trace → interview
drills.

---

## 1. The mental model (say this first in any interview)

> Sutra is a **7-stage pipeline** that turns a requirements document into
> Xray/Kiwi-tracked test cases and grounded Playwright automation, runs it in a
> Docker sandbox, and writes results back — while recording a **lineage graph**
> so every artifact traces back to the requirement that produced it. Two
> properties make it production-grade: **idempotency** (re-runs never duplicate)
> and **grounding** (tests are written against the real app, not a hallucination).

Everything below is detail hanging off that sentence.

---

## 2. The data that flows (learn these types — they ARE the pipeline)

```
BRD/user story (text file)
  └─ Clause[]            (clauseSplitter)      one hashable paragraph each
       └─ UserStory[]    (stage 01, LLM)       actor/goal/benefit + acceptance criteria
            └─ TestCase[] (stage 02, LLM)      steps + expected results, category, priority
                 └─ XrayTestIssueRef (stage 03) a ticket in Xray/Kiwi (key + issueId)
                      └─ GeneratedScript (stage 04) .feature + .steps + page object
                           └─ SandboxRunResult (stage 05) passed/failed + logs + artifacts
                                └─ report + write-back (stage 07) status back to the tracker
```

Alongside that chain, **every** item also becomes a **LineageNode** in one graph,
linked parent→child, so you can walk from any result back to its BRD sentence.

Key type files to read: `src/stages/01-requirement-analyst/schema.ts` (UserStory),
`src/stages/02-test-case-designer/schema.ts` (TestCase), `src/stages/03-jira-xray-sync/types.ts`
(XraySyncPort + XrayTestIssueRef + SyncMode), `src/lineage/types.ts` (LineageNode/Graph).

---

## 3. Repo map (where things live)

| Path | Role |
|---|---|
| `src/orchestrator/` | The conductor: CLI entry, the pipeline flow, the run lock |
| `src/lineage/` | The traceability graph (types, build/query, persistence) |
| `src/stages/01…07/` | The seven pipeline stages, one folder each |
| `src/sdk/client.ts` | Wrapper around the Claude Agent SDK (schema-validated LLM calls) |
| `src/utils/` | logger (pino), fsSafe (hashing + safe writes), prompts loader |
| `config/` | env loading + backend resolution; Playwright-MCP config |
| `prompts/` | The per-stage instructions given to the AI |
| `docker/` | The sandbox image + the local Kiwi stack |
| `generated/` | ALL pipeline output (gitignored, regenerable) |
| `clause-cache.json`, `xray-registry.json` | Cross-run memory (root) |

---

## 4. The "spine" — cross-cutting systems that touch every stage

These are what interviewers dig into, because they're the non-obvious engineering.

### 4a. The lineage graph — `src/lineage/`
- `types.ts`: a `LineageNode` = `{ id, type, parentIds, status (active|stale), supersedes?, clauseId?, payloadRef, metadata }`. The graph = `{ runId, inputSourceFile, inputHash, nodes }`.
- `graph.ts`: `addNode` (validates every parent exists → no dangling refs), `getDescendants`/`getAncestors` (transitive walks), `markStale` (cascades a node + all descendants to `stale`), `getNodesByClauseId`, `validateGraph` (finds orphan refs + roots), `traceToSource` (leaf → the requirement-source it came from).
- `store.ts`: `JsonFileLineageStore` loads/saves `generated/lineage/graph.json`.
- **Why it matters:** this is the "requirement-to-result traceability" USP, and the "never delete, mark stale/superseded" philosophy lives here.
- **Interview angle:** *"How do you prove a test covers a requirement?"* → walk `traceToSource`. *"What happens to old artifacts on a change?"* → `markStale` cascade, never deleted.

### 4b. Clause caching / idempotency — `src/stages/01-requirement-analyst/clauseSplitter.ts` + `clauseCache.ts`
- `splitClauses` cuts the BRD at its deepest markdown heading level into `Clause`s, each with a **sha256 hash of its own body**. User-story input becomes one synthetic `root` clause.
- `clauseCache.ts` persists, per clause, a **full snapshot** of what that clause produced (stories, test cases, Xray keys, file paths) in `clause-cache.json`, keyed `mode:inputfile#clauseId`.
- On re-run, `pipeline.ts` compares each clause's current hash to the cached one: **hit** → reuse everything, skip the LLM; **miss** → regenerate only that clause and supersede the old chain; **rename** (same hash, new id) → carry forward; **delete** (cached id absent this run) → mark deprecated + supersede.
- **Interview angle:** *"How is re-running safe?"* → content-hash per clause; the LLM's non-deterministic prose can't be a cache key, the source bytes can. *"Why per-clause LLM calls?"* → a monolithic call can never skip work for an unchanged section.

### 4c. The backend port abstraction — `src/stages/03-jira-xray-sync/types.ts`
- `XraySyncPort` is the interface every backend implements: `pushTestCase`, `createTestSet/Plan`, `addTestsToTestSet`, `removeTestsFromTestSet`, `supersedeTestIssue`, `linkTestExecutionToPlan`, plus a `mode`.
- Three implementations: `StubXrayClient` (records to JSON, no creds), `XrayClient` (GraphQL + Jira REST), `KiwiClient` (JSON-RPC). `buildXraySyncPort(config)` picks one by `config.backend`.
- **Interview angle:** classic Ports-and-Adapters (hexagonal) — stages 3 and 7 depend on the *interface*, so adding Kiwi changed **zero** downstream code. This is the answer to *"how extensible is it?"*

### 4d. Config & backend resolution — `config/env.ts`
- Zod-validates `process.env`; `resolveBackend` picks `stub | xray | kiwi` (TCMS_BACKEND wins; else legacy XRAY_MODE mapping) and **falls back to stub if the chosen backend's creds are incomplete** — "never runs half-authenticated." Unit-tested in `config/env.test.ts`.

### 4e. The run lock — `src/orchestrator/lock.ts`
- Atomic `O_EXCL` lock file; refuses a second concurrent run, reclaims a stale lock from a crashed run (pid-liveness check). Protects the shared state files.

### 4f. Grounding-safety — stage 04 + self-healer + write-back
- `reachability.ts` pre-flight (is the app even up?) + a `cannotGround` schema escape hatch (the model can honestly decline) → the test is marked **BLOCKED**, never faked. `diagnose.ts` adds a `possibly-not-implemented` failure class. **Interview angle:** *"what if the feature isn't built?"* — we block honestly, we never hallucinate a passing test.

---

## 5. Stage by stage (input → key logic → output)

### Stage 01 — Requirement Analyst (`src/stages/01-requirement-analyst/`)
- **In:** the input file. **Out:** `UserStory[]` per clause + `requirement-source`/`user-story` lineage nodes.
- `loadInputText.ts` + `parsers/` read `.md`/`.txt`/`.docx`. `detectInputType.ts` heuristically classifies BRD vs user-story (no LLM). `clauseSplitter.ts` splits + hashes. `agent.ts`: `loadAndSplitInput` (no LLM yet), then `runRequirementAnalystForClause` calls the LLM **per clause** with the clause body + the doc's Background + a sibling-headings index (so cross-references work without breaking caching).
- **Why per-clause + background:** real BRDs cross-reference ("same fields as login §2.1"); we feed context without re-sending hashed text.

### Stage 02 — Test Case Designer (`02-test-case-designer/`)
- **In:** `UserStory[]`. **Out:** `TestCase[]` (positive/negative/edge/boundary, priority) + `test-case` nodes.
- `agent.ts` calls the LLM once per story. `schema.ts` = the `TestCase` shape.
- **Gotcha you fixed:** test-case ids restart at `TC-1` per story, so downstream keys must include the storyId to stay unique.

### Stage 03 — Jira/Xray Sync (`03-jira-xray-sync/`)
- **In:** `TestCase[]`. **Out:** tracker tickets grouped in a Test Set + Test Plan; `xray-test-issue/set/plan` nodes.
- `agent.ts` orchestrates: `pushTestCases` (only for miss clauses), `ensureTestSetAndPlan` (reuse via `xrayRegistry.ts` across runs; `upsertGroupingNode` de-dupes the lineage node on reuse), `supersedeClauseTestCases`. The three backends sit behind `types.ts`.
- `xrayAuth.ts` (Xray OAuth-ish client-id/secret token), `jiraRestClient.ts` (Basic-auth label/comment/resolve-id), `kiwiRpc.ts` (session-cookie JSON-RPC), `kiwiClient.ts` (maps the port onto Kiwi's Product/TestPlan/TestCase model).

### Stage 04 — Script Generator (`04-script-generator/`)
- **In:** one primary `TestCase`. **Out:** a grounded `.feature` + step defs + optional page object, or a **blocked** result.
- `agent.ts`: reachability pre-flight → wipe the case's feature dir → LLM **navigates the real app via Playwright MCP** and writes selectors it actually saw → returns `ScriptGenerationResult` (`generated | blocked`). Uses a **stable path key** `clauseId/storyId/testCaseId` (not the volatile Xray key) so re-runs find the same files.
- **The USP lives here:** grounding. `groundingNotes` is the audit trail proving it wasn't hallucinated.

### Stage 05 — Sandbox Runner (`05-sandbox-runner/`)
- **In:** the generated script. **Out:** `SandboxRunResult` (passed, logs, artifacts) + `sandbox-run`/`promoted-run` nodes.
- `runner.ts` runs Playwright inside the Docker image (`docker/sandbox.Dockerfile`); `playwrightConfigTemplate.ts` writes the in-container config; `promote.ts` moves a good run's artifacts out. **Why a sandbox:** reproducible, isolated — a pass means a real pass on any machine.

### Stage 06 — Self-Healer (`06-self-healer/`)
- **In:** a failed `SandboxRunResult`. **Out:** a `heal-attempt` node with a classification.
- `diagnose.ts` `classifyFailure`: `possibly-not-implemented | likely-drift | likely-regression | unknown`. `index.ts` **diagnoses only** in this milestone — flags for a human, never auto-repairs, never masks a fail as a pass.
- **Interview angle:** healing is only ever right for *drift*; a *regression* must surface (the test caught a real bug). That's a design choice, not a limitation.

### Stage 07 — Report & Write-back (`07-report-writeback/`)
- **In:** the run (or a blocked result). **Out:** an Allure/HTML report + archive, and the pass/fail/blocked status written to the tracker; `report`/`xray-execution-result` nodes.
- `reportGenerator.ts` + `readResults.ts` + `archiveRun.ts` build the local report/zip. `xrayResultsImport.ts` (+ `xrayEvidence.ts`) and `kiwiResultsImport.ts` push results per backend. `blockedWriteback.ts` records a BLOCKED outcome without a run.

---

## 6. Follow one BRD sentence end-to-end (the whole story in one trace)

1. `sample-brd.md` §2.1 "Successful login" → `splitClauses` → `Clause{ clauseId:'2-1-successful-login', hash }`.
2. Cache miss → LLM writes a `UserStory` → `requirement-source` + `user-story` nodes.
3. Stage 02 LLM writes `TestCase{ id:'TC-1', 'Login shows email+password' }` → `test-case` node.
4. Stage 03 `pushTestCase` → `KIWI-1` (or `SUT-123`) ticket → `xray-test-issue` node; grouped into a Test Plan.
5. Stage 04 pre-flight OK → Playwright MCP opens the real app, sees the fields → writes `features/2-1-successful-login/US-1/TC-1/login.feature` → `script-feature`/`script-step-def` nodes.
6. Stage 05 runs it in Docker → PASSED → `sandbox-run`/`promoted-run` nodes.
7. Stage 07 → `test-results/summary.md` + status PASSED written to the tracker → `report`/`xray-execution-result` nodes.
8. `traceToSource(resultNode)` walks all the way back to step 1. **That's the pitch, proven in data.**
9. Re-run unchanged → every clause `cache hit`, 0 new tickets/files. Edit §2.1 → only its chain regenerates, old chain `stale`/superseded.

---

## 7. Interview drills

### Technical / architecture
- *"Walk me through the architecture."* → §1 + §2 + the port abstraction (§4c).
- *"How do you avoid duplicate tickets on re-run?"* → clause content-hash cache (§4b).
- *"How do you add a new test-management tool?"* → implement `XraySyncPort`; zero downstream change (§4c). You did exactly this with Kiwi.
- *"How is the AI output kept safe/structured?"* → Zod-schema-validated Agent SDK calls (`sdk/client.ts`); grounding via Playwright MCP; `cannotGround` escape hatch.
- *"What's your test strategy for the framework itself?"* → unit tests over pure logic (splitter, graph, diagnose, config); live integration for the I/O edges; end-to-end runs. (`npm test` = 29 tests.)

### Managerial / product
- *"What does this save?"* → days of manual test authoring + Jira logging + scripting, collapsed into one idempotent run; audit-grade traceability for free.
- *"What's the risk / where's the human?"* → AI drafts, humans review; nothing auto-merged; failures surface with a diagnosis; blocked features never faked.
- *"Roadmap?"* → live-Xray verification, Jira-as-input for BAs, bounded auto-repair for drift, an observability dashboard.

### Scenario
- *"A test fails at 2am in CI — what does the on-call see?"* → exit non-zero, an Allure report + archived screenshots/traces, a failure **classification**, and a FAILED status in the tracker with evidence — a diagnosis, not a mystery.
- *"A BRD paragraph changes wording only, not meaning."* → its hash changes → that one clause regenerates, old cases superseded (not duplicated), everything else untouched.
- *"The feature described isn't built yet."* → reachability/`cannotGround` → marked **BLOCKED**, no fake pass, flagged for a human.
- *"Two people trigger a run on the same BRD at once."* → the run lock refuses the second; no clobbered state.

---

## 8. Glossary

- **Clause** — one hashable BRD paragraph; the unit of idempotency.
- **Lineage node** — one artifact in the traceability graph.
- **Supersede** — retire an old artifact (label/tag + comment + unlist), never delete.
- **Grounding** — reading the real app before writing selectors, so tests aren't hallucinated.
- **Port / adapter** — `XraySyncPort` + its stub/Xray/Kiwi implementations.
- **Stub mode** — fabricates the tracker locally; runs with zero credentials.
- **BLOCKED** — grounding-safety outcome: couldn't honestly test (unreachable / not built).

---

*Companion docs: `PROJECT-EXPLAINER.md` (non-technical), `INTERVIEW-PITCH.md`
(USP + spoken scripts), `USAGE-RUNBOOK.md` (how to run + validate),
`kiwi-setup.md` (Kiwi). The `explain-sutra` skill gives on-demand plain-language
explanations of any piece.*
