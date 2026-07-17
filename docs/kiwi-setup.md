# Kiwi TCMS — local setup & orientation

Kiwi TCMS is the **free, self-hosted** test-management backend for Sutra's "Case 2"
— the same role Xray plays, behind the same `XraySyncPort` interface, at $0 forever.

> **Status:** the Kiwi adapter is **built and verified live** — the pipeline can
> now write Products, Test Plans, Test Cases and Test Runs into Kiwi behind the
> same `XraySyncPort` as Xray. Run the pipeline with `TCMS_BACKEND=kiwi` (below)
> to populate it; the "where things land" section maps each artifact to its place
> in the UI.

## Run the pipeline against Kiwi

With Kiwi up and `KIWI_*` set in `.env`, add one line:

```
TCMS_BACKEND=kiwi
```

Then run the pipeline as usual:

```bash
npm run pipeline -- --brd ./samples/sample-brd.md
```

Everything gets filed under a Kiwi **Product** (named by `KIWI_PRODUCT`, default
`Sutra`). Mapping: BRD grouping → **Test Plan**, each generated case → **Test
Case**, the execution → a **Test Run** with per-case PASSED/FAILED and the
evidence-archive path recorded as a comment. Superseded cases are **retired
(status DISABLED) and tagged `sutra-superseded`/`sutra-clause-removed`, never
deleted** — the same never-destroy philosophy as the Xray backend.

---

## 1. Baby-step setup

Docker Desktop must be running.

```bash
# 1. Start Kiwi (db + web)
docker compose -f docker/kiwi/docker-compose.yml up -d

# 2. Initialise the database AND create your admin user (interactive prompts)
docker exec -it kiwi_web /Kiwi/manage.py initial_setup
#    -> it asks for a username, email, and password. Remember these.

# 3. Open the UI (accept the self-signed certificate warning)
#    https://localhost
```

That's it. The username/password you set in step 2 are your **`KIWI_USERNAME` /
`KIWI_PASSWORD`**.

### Fill in `.env`
```
KIWI_BASE_URL=https://localhost
KIWI_USERNAME=your-admin-username
KIWI_PASSWORD=your-admin-password
```

### Prove the connection works
```bash
node scripts/kiwi-smoke.mjs
```
Expected: `✓ Auth.login OK` and `✓ Product.filter OK`. If it fails, the script
tells you whether the container is down or the credentials are wrong.

### Teardown
```bash
docker compose -f docker/kiwi/docker-compose.yml down      # stop, keep data
docker compose -f docker/kiwi/docker-compose.yml down -v   # stop AND wipe data
```

---

## 2. How Sutra's concepts map into Kiwi

You already know the Xray shape, so here's the side-by-side:

| Sutra concept | Xray (Jira) | **Kiwi TCMS** | Where in the Kiwi UI |
|---|---|---|---|
| The app / BRD source | Jira Project | **Product** (+ **Version**, **Build**) | *Search → Products* |
| The BRD / requirement grouping | Test Set / Test Plan | **Test Plan** (its description holds the requirement context) | *Search → Test Plans* |
| A generated test case | Test issue | **Test Case** (steps + expected results) | *Search → Test Cases* |
| A pipeline execution + pass/fail | Test Execution | **Test Run** → **Test Executions** (per-case status) | *Search → Test Runs* |
| Allure/HTML evidence zip | attachment on the execution | **attachment** on the Test Run / Execution | inside the Test Run page |

---

## 3. Where the BRD "stays" and where the report "is posted"

When you log in (top nav is **TESTING** / **SEARCH**), here's the tour:

### Where the BRD lives → **Test Plan** (grouped under a **Product**)
- **SEARCH → Test Plans** → open the plan Sutra created for your BRD.
- The plan's **name** ties back to the BRD; its **description/text** carries the
  requirement context, and the plan **contains the generated Test Cases** as its
  children. This is the Kiwi equivalent of the Xray Test Set + Test Plan.
- The individual requirements → test cases are under **SEARCH → Test Cases**
  (each one shows the Given/When/Then steps and expected results).

### Where the report is posted → **Test Run**
- **SEARCH → Test Runs** → open the run for your pipeline execution.
- Inside, each test case shows a **status** (PASSED / FAILED / etc.) — that's the
  write-back, the Kiwi equivalent of Xray's Test Execution.
- The **Allure/HTML report zip** is attached to the run as **evidence**, so you
  can download exactly what ran and why it passed or failed.

So, in one line: **the BRD → a Test Plan (with the cases under it); the result →
a Test Run (with per-case pass/fail + the evidence attachment).**

---

## 4. Notes & gotchas

- **Self-signed TLS:** Kiwi forces HTTPS with a self-signed cert on `localhost`.
  The browser will warn — that's expected locally. The smoke-test sets
  `NODE_TLS_REJECT_UNAUTHORIZED=0` for the same reason; it's scoped to this local
  check only, never used against a real host.
- **First boot is slow:** the `web` container runs migrations on first start; give
  it a minute before the UI responds.
- **MariaDB compatibility:** the compose pins the official pairing
  (`mariadb:latest` + `pub.kiwitcms.eu/kiwitcms/kiwi:latest`). If a future MariaDB
  major breaks Kiwi, pin `mariadb` to the version named in Kiwi's release notes.
- **Data lives in Docker volumes** (`db_data`, `uploads`) — it survives
  `down`/`up`, and is only erased by `down -v`.
