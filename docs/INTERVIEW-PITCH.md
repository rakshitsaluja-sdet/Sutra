# Sutra — Interview Pitch & USP Playbook

*Your goal: make the interviewer remember Sutra after you leave the room. This is
the script, the punchy lines, the benefits, the honest drawbacks, and the Q&A
prep — everything to turn this project into your unfair advantage.*

---

## 0. The one-liner (memorise word-for-word)

> **"Sutra is a robot QA engineer: hand it a requirements document, and it writes
> the test cases, files them in Jira, writes and runs the automated browser tests
> against the real app, and reports back — with a full trace from every result
> back to the requirement sentence that caused it."**

If you say nothing else, say that.

---

## 1. The 15-second hook (how to open)

> "Most teams spend *days* turning requirements into tracked, automated tests —
> reading the doc, writing test cases, logging them in Jira, scripting the
> automation, running it, triaging failures. I built a pipeline that does that
> whole chain automatically, and does it *idempotently* — so re-running it never
> creates duplicates, and editing one requirement regenerates only that part."

Pause. Let them ask "how?" — now you're driving.

---

## 2. The 60-second elevator pitch (spoken)

> "It's called Sutra. You give it a BRD or a user story. Stage one splits it into
> individual requirements and turns each into user stories. Stage two writes
> concrete test cases — positive, negative, edge. Stage three files them in Jira
> via Xray as linked, grouped tickets. Stage four is the part I'm proudest of:
> before it writes a single line of automation, it *opens the real application*
> with Playwright and reads the actual buttons and fields — so the test is
> grounded in what's genuinely on the page, not what an AI hallucinated. It runs
> that test in a sealed Docker container so the result is reproducible, diagnoses
> failures instead of just showing a red X, and writes pass/fail back into Jira.
>
> Two things make it production-grade rather than a demo. First, it's fully
> *idempotent* — same requirements in, zero duplicate tickets or files out; change
> one clause and only that clause regenerates, and the old version is marked
> superseded, never deleted. Second, every artifact is a node in a lineage graph,
> so you can trace any test result all the way back to the exact requirement that
> produced it — automatic, audit-grade traceability."

---

## 3. The five USPs (your differentiators — each with a punchy line)

**1. Grounded, not hallucinated.**
> "Every other AI test generator writes plausible scripts against a page it's never
> seen — they break on day one. Sutra looks at the real page first. That's the
> difference between a test that runs and a confident-sounding fake."

**2. Idempotent by design.**
> "Run it a hundred times on the same doc — you get one set of tickets, not a
> hundred. It has a memory. That's what makes it safe to wire into CI on every
> requirements change."

**3. Surgical incremental regeneration.**
> "Change one sentence, and it regenerates exactly one section — like track-changes
> for your entire test suite. And it never deletes history; it supersedes."

**4. Requirement-to-result traceability.**
> "Point at any failed test and I can walk you back to the exact BRD sentence that
> asked for it. That's the traceability auditors beg for — here it's free."

**5. Backend-agnostic architecture.**
> "The test-management integration sits behind one interface. Xray today, Kiwi TCMS
> tomorrow — I proved the abstraction by swapping the backend without touching a
> single downstream stage."

---

## 4. Benefits (translate features → value)

| Feature | The value you say out loud |
|---|---|
| Auto test-case + Jira creation | "Collapses days of manual QA authoring into one run." |
| Grounding via Playwright MCP | "Tests actually pass on first execution — no day-one breakage." |
| Idempotency | "Safe in CI; no ticket sprawl; a permanent audit trail of change." |
| Lineage graph | "Instant impact analysis and compliance evidence." |
| Docker sandbox | "Reproducible anywhere — a pass means a real pass." |
| Failure diagnosis | "Humans start from a diagnosis, not a mystery — faster triage." |
| Port abstraction | "Not locked to a paid vendor — Kiwi TCMS is a free drop-in." |

---

## 5. The tech (name-drop with confidence)

> "TypeScript/Node pipeline, one stage per module. Claude via the Anthropic Agent
> SDK as the reasoning engine. Playwright MCP for live page grounding. Playwright +
> Cucumber/Gherkin for the tests. Docker for sealed execution. Xray-on-Jira via
> GraphQL and REST, with a stub mode so it runs with zero credentials. Content-
> hashed caching and a lineage graph for idempotency and traceability. Zod for
> typed LLM output, so the AI's responses are schema-validated, not free text."

---

## 6. Honest drawbacks — and how to frame them (turn weakness into strength)

Interviewers trust candidates who name limitations. Never hide these — *frame*
them as deliberate scope and roadmap.

**"The self-healer only diagnoses today, it doesn't auto-fix yet."**
> "That's deliberate for v1. Auto-fixing is only ever right for UI *drift* — if a
> test caught a real *regression*, healing it would mask a bug. So v1 diagnoses and
> classifies every failure and flags it for a human, and never masks a failure as a
> pass. Bounded auto-repair for drift is the next milestone."

**"Live Xray write-back is coded but not yet verified against a real Jira."**
> "Everything runs today in a stub mode that records every action locally, so it's
> fully demoable and testable with zero credentials. The live path is written and
> reviewed against Xray's current API docs — verifying it against a real tenant is
> a credential-gated checklist item, not new engineering."

**"There's an AI in the loop, so output needs human review."**
> "Correct — Sutra drafts a strong first version, it doesn't replace judgment. The
> whole design leans into that: schema-validated output, full lineage, human-
> reviewable evidence at every step. It's a force multiplier for a QA engineer, not
> a replacement."

**"No concurrent-run lock yet."**
> "Known and scoped — the shared state files aren't yet lock-protected, so today
> you run one pipeline per input at a time. A file lock is a small, planned add."

> **Pro move:** mention that two robustness bugs (an ID collision and a duplicate
> lineage entry) were *caught by my own verification and fixed before they shipped*.
> It shows you test your own work adversarially.

---

## 7. Likely interview questions → strong answers

**Q: "What happens when a generated test fails?"** *(you will get this)*
> "It's classified — drift, regression, or unknown — and flagged for review with
> full evidence: an Allure report, an archived run with screenshots and traces, and
> a FAILED status written back to Jira with the evidence attached. Critically it
> never silently passes. A human starts from a diagnosis, not a red X. Auto-repair
> for drift is roadmapped, but regressions are meant to surface — that's the test
> doing its job."

**Q: "How is this different from just asking ChatGPT to write Playwright tests?"**
> "Three things a prompt can't give you: grounding — it reads the real page before
> writing, so tests don't break instantly; idempotency — re-running doesn't
> duplicate anything; and traceability — every artifact links back to its
> requirement. It's a *system*, not a one-shot generation."

**Q: "How do you keep the AI from hallucinating selectors?"**
> "Two guards. It must navigate the live app via Playwright MCP and ground selectors
> in the real accessibility tree, and it records what it observed as an audit note.
> And its output is Zod-schema-validated, so structurally-wrong responses are
> rejected, not silently used."

**Q: "How does re-running not create duplicates?"**
> "Each requirement clause is content-hashed before the LLM sees it. Same hash =
> cache hit, reuse everything, zero new tickets or files. Different hash = regenerate
> only that clause and supersede the old one. I verified it: a second identical run
> created zero new tickets and zero new files in about 37 seconds."

**Q: "What was the hardest part?"**
> "Making re-runs idempotent across process restarts. The lineage graph was being
> rebuilt from scratch every run and clobbering the previous one — so the 'never
> delete, mark superseded' model existed but was inert. Fixing that meant loading
> and extending the graph across runs and threading per-clause cache decisions
> through every stage."

**Q: "Where could this go next?"**
> "Bounded auto-repair for drift, a free Kiwi TCMS backend behind the same
> interface, a reachability pre-flight so it flags features that aren't built yet
> instead of failing on them, and a concurrent-run lock."

---

## 8. Power closing lines (pick one)

> "Sutra turns a requirements document into a running, tracked, self-diagnosing
> test suite — and proves every result traces back to a requirement. It's the
> boring, expensive middle of QA, automated end to end."

> "I didn't just wire an AI to Playwright. I built the guardrails that make AI-
> generated tests trustworthy: grounding, idempotency, and traceability."

---

## 9. Do / Don't when presenting

**Do:** lead with the one-liner · use the "reads the real page first" line — it lands
· offer to show the lineage graph or a report · name one honest limitation unprompted.

**Don't:** overclaim ("fully autonomous", "replaces QA") · hide that an AI is in the
loop · get lost in stage numbers — talk *value*, then drill in if asked · call it
finished — call it a working v1 with a clear roadmap.

---

*Companion docs: [PROJECT-EXPLAINER.md](PROJECT-EXPLAINER.md) (for non-technical
audiences) and the `explain-sutra` skill (on-demand plain-language explanations).*
