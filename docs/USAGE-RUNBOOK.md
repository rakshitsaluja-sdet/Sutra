# Sutra — Usage Runbook (novice, baby steps)

How to run the pipeline and **validate the results** in Kiwi and in Xray/Jira.
Assumes nothing. Copy-paste friendly.

---

## 0. One-time prerequisites

1. **Docker Desktop** running (green whale icon). The test executes in a container.
2. **Node deps installed:** `npm install` (once).
3. **Auth for the AI:** either you're logged into Claude Code (OAuth), or an
   `ANTHROPIC_API_KEY` is set in `.env`. If you see `session limit`, wait for
   reset or add a metered key.
4. Copy `.env.example` to `.env` if you don't have one yet.

Sanity check everything is wired:
```bash
npm run typecheck   # should print nothing but the command
npm test            # 6 files, 29 tests pass
```

---

## 1. Your first run — stub mode (no accounts needed)

Stub mode fabricates the Jira/Xray side locally, so you can see the whole
pipeline work with zero credentials.

```bash
npm run pipeline -- --brd ./samples/sample-brd.md
```

Watch the log. You'll see each stage announce itself:
`requirement-analyst` → `test-case-designer` → `jira-xray-sync (stub)` →
`script-generator` → `sandbox-runner` → `self-healer` → `report-writeback`.

### Validate a stub run (where to look)
| What | Where |
|---|---|
| The stories it wrote | `generated/lineage/stories.json` |
| The test cases it wrote | `generated/lineage/testcases.json` |
| The fabricated Xray tickets/set/plan | `generated/lineage/xray-stub.json` |
| The generated automation | `generated/features/…`, `generated/steps/…`, `generated/pages/…` |
| The pass/fail report | `test-results/summary.md` |
| The full paper trail | `generated/lineage/graph.json` |
| Cross-run memory (idempotency) | `clause-cache.json` (root) |

**Prove idempotency yourself:** run the exact same command again. Second run
logs `clause cache hit` for every clause, creates 0 new tickets/files, and
finishes in seconds. That's the headline feature — verify it with your own eyes.

---

## 2. Run against Kiwi (free, real test-management UI)

### 2a. Start Kiwi (once)
```bash
docker compose -f docker/kiwi/docker-compose.yml up -d
docker exec -it kiwi_web /Kiwi/manage.py initial_setup   # creates your admin (first time only)
```
Open `https://localhost` (accept the self-signed cert). Log in with the admin
you just made. Put those creds in `.env`:
```
TCMS_BACKEND=kiwi
KIWI_BASE_URL=https://localhost
KIWI_USERNAME=<your-admin>
KIWI_PASSWORD=<your-admin-pw>
```
Confirm the pipeline can reach it:
```bash
node scripts/kiwi-smoke.mjs   # expect: Auth.login OK, Product.filter OK
```

### 2b. Run the pipeline into Kiwi
```bash
npm run pipeline -- --brd ./samples/sample-brd.md
```

### 2c. Validate in the Kiwi UI (baby steps)
1. `https://localhost` → log in.
2. **SEARCH → Search Products** → you'll see your product (default `Sutra`).
3. **SEARCH → Search Test Plans** → open the plan named after your BRD. It
   **contains the generated Test Cases** — this is "where the BRD lives".
4. **SEARCH → Search Test Cases** → open one → read its **steps / expected
   results**. This is one requirement turned into a concrete test.
5. **SEARCH → Search Test Runs** → open the latest → the automated case shows
   **PASSED / FAILED / BLOCKED**, with an evidence-archive comment. This is
   "where the report is posted".
6. **Edit a clause** in `sample-brd.md`, re-run → only that clause's cases
   change; the old ones get **tag `sutra-superseded` + status DISABLED**
   (Search Test Cases, filter status = DISABLED). Nothing is ever deleted.

---

## 3. Run against Xray / Jira (once you have an account)

> Blocked until you create the Jira+Xray account (see the account-setup steps).
> The code is written; these are the validation steps for when creds exist.

### 3a. Fill `.env`
```
TCMS_BACKEND=xray
JIRA_BASE_URL=https://<you>.atlassian.net
JIRA_EMAIL=<you>
JIRA_API_TOKEN=<token>
XRAY_CLIENT_ID=<id>
XRAY_CLIENT_SECRET=<secret>
XRAY_PROJECT_KEY=<KEY>
```
(If any are missing the pipeline safely forces stub — so a half-filled `.env`
never writes junk to your real Jira.)

### 3b. Run + validate in Jira
```bash
npm run pipeline -- --brd ./samples/sample-brd.md
```
Then in Jira:
1. **Issues / filter by project** → you'll see new **Test** issues (one per case).
2. Open the **Test Set** and **Test Plan** — the cases are grouped under them.
3. After execution, a **Test Execution** carries the PASSED/FAILED, linked to the
   Test Plan, with the evidence zip attached.
4. Re-run after a BRD edit → old tests get a **`sutra-superseded` label + a
   comment** and are removed from the active Test Set (never deleted).

---

## 4. Everyday commands cheat-sheet

| Do this | Command |
|---|---|
| Run the pipeline | `npm run pipeline -- --brd ./samples/sample-brd.md` |
| Force input type | add `--type brd` or `--type user-story` |
| Never automate a signup case | add `--exclude-keyword register,signup` |
| Unit tests | `npm test` |
| Typecheck | `npm run typecheck` |
| Start / stop Kiwi | `docker compose -f docker/kiwi/docker-compose.yml up -d` / `stop` |
| Wipe Kiwi data | `docker compose -f docker/kiwi/docker-compose.yml down -v` |
| Clean slate (regenerable output) | delete contents of `generated/` and `clause-cache.json` |

---

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Another pipeline run is already in progress` | The run lock — wait for the other run, or delete `generated/.pipeline.lock` if it's dead. |
| `session limit` in the log | Claude subscription cap — wait for reset or add `ANTHROPIC_API_KEY`. |
| Sandbox stage errors immediately | Docker Desktop isn't running. |
| Kiwi smoke test fails | Container down (`docker ps`), or wrong `KIWI_*` creds, or you skipped `initial_setup`. |
| A test comes back **BLOCKED** | Grounding-safety: the target app was unreachable or the feature isn't built. That's correct behaviour, not a bug. |
| `backend=xray … Forcing stub` warning | One of the 6 Xray vars is missing — the safety fallback. |
