import { readFile } from 'node:fs/promises';

interface PlaywrightJsonTestResult {
  status: string;
}
interface PlaywrightJsonTest {
  // Individual test entries (one per project/browser) carry no title of their
  // own in Playwright's JSON reporter schema — only the parent spec does.
  projectName?: string;
  results: PlaywrightJsonTestResult[];
}
interface PlaywrightJsonSpec {
  title: string;
  tests: PlaywrightJsonTest[];
}
interface PlaywrightJsonSuite {
  title: string;
  specs?: PlaywrightJsonSpec[];
  suites?: PlaywrightJsonSuite[];
}
interface PlaywrightJsonReport {
  suites: PlaywrightJsonSuite[];
}

export interface TestOutcome {
  title: string;
  passed: boolean;
}

function collectSpecs(suite: PlaywrightJsonSuite): PlaywrightJsonSpec[] {
  const specs = [...(suite.specs ?? [])];
  for (const child of suite.suites ?? []) {
    specs.push(...collectSpecs(child));
  }
  return specs;
}

/** Parses Playwright's built-in JSON reporter output into a flat pass/fail list. */
export async function readSandboxResults(resultsJsonPath: string): Promise<TestOutcome[]> {
  const raw = await readFile(resultsJsonPath, 'utf-8');
  const report = JSON.parse(raw) as PlaywrightJsonReport;
  const specs = report.suites.flatMap(collectSpecs);
  return specs.flatMap((spec) =>
    spec.tests.map((test) => ({
      title: test.projectName ? `${spec.title} [${test.projectName}]` : spec.title,
      passed: test.results.length > 0 && test.results.every((r) => r.status === 'passed'),
    })),
  );
}
