# Pre-bakes a Linux-native node_modules for the generated test suite so the
# host's (Windows) node_modules never has to be mounted in — avoids native
# binary (esbuild etc.) platform mismatches entirely. Only generated/ and
# test-results/ are mounted at runtime; everything else lives in this image.
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.61.1-noble
FROM ${PLAYWRIGHT_IMAGE}

# Allure's report generator (allure-commandline) is a Java CLI — the base
# Playwright image doesn't ship a JRE, so it's added explicitly here.
RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-17-jre-headless && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /work

RUN npm init -y >/dev/null && \
    npm install --no-audit --no-fund \
      @playwright/test@1.61.1 \
      playwright@1.61.1 \
      playwright-bdd@9.2.0 \
      allure-playwright@3.10.2 \
      allure-commandline@2.43.0

# Always generate the Allure static report, even on test failure, but exit
# with the *test* run's status code — Allure generation failure must never
# mask (or fake-pass) a real test result.
CMD ["sh", "-c", "\
  npx bddgen --config=generated/playwright.config.ts && \
  (npx playwright test --config=generated/playwright.config.ts; code=$?; \
   npx allure generate test-results/allure-results --clean -o test-results/allure-report || true; \
   exit $code)"]
