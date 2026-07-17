import type { AppConfig } from '../../../config/env.js';
import { logger } from '../../utils/logger.js';
import { KiwiRpc } from './kiwiRpc.js';
import type { CreateGroupInput, PushTestCaseInput, SupersedeTestIssueInput, XraySyncPort, XrayTestIssueRef } from './types.js';

// Kiwi default seed data (verified by introspection against a fresh instance):
const CASE_STATUS_CONFIRMED = 2;
const CASE_STATUS_DISABLED = 3; // used to retire a superseded case without deleting it
const PLAN_TYPE_ACCEPTANCE = 5;
const PRIORITY_BY_LEVEL: Record<'high' | 'medium' | 'low', number> = { high: 1, medium: 2, low: 3 };

interface BootstrappedIds {
  classificationId: number;
  productId: number;
  versionId: number;
  categoryId: number;
}

/**
 * Kiwi TCMS backend behind the same XraySyncPort as Xray. Mapping:
 *   Xray Test issue   -> Kiwi TestCase
 *   Xray Test Set     -> Kiwi TestPlan (the grouping that holds the cases)
 *   Xray Test Plan    -> the same Kiwi TestPlan (Kiwi has no separate concept;
 *                        executions run against a TestPlan as TestRuns)
 * Results write-back (a TestRun with per-case statuses) lives in
 * kiwiResultsImport.ts, called from the report-writeback stage.
 *
 * `issueId` returned from pushTestCase is the numeric Kiwi TestCase id (as a
 * string) — that is what add/remove-from-plan and supersede operate on.
 */
export class KiwiClient implements XraySyncPort {
  readonly mode = 'kiwi' as const;
  private readonly rpc: KiwiRpc;
  private readonly productName: string;
  private ready?: Promise<BootstrappedIds>;

  constructor(config: AppConfig) {
    const kiwi = config.kiwi!;
    this.rpc = new KiwiRpc(kiwi.baseUrl, kiwi.username, kiwi.password, kiwi.tlsInsecure);
    this.productName = kiwi.productName;
  }

  /** Log in and ensure Classification/Product/Version/Category exist — memoized, runs once. */
  private bootstrap(): Promise<BootstrappedIds> {
    if (!this.ready) this.ready = this.doBootstrap();
    return this.ready;
  }

  private async doBootstrap(): Promise<BootstrappedIds> {
    await this.rpc.login();
    const classificationId = await this.ensure('Classification', { name: 'Sutra' }, { name: 'Sutra' });
    const productId = await this.ensure('Product', { name: this.productName }, { name: this.productName, classification: classificationId });
    const versionId = await this.ensure('Version', { product: productId, value: 'unspecified' }, { product: productId, value: 'unspecified' });
    // Product creation auto-adds a default category; reuse the first one for this product.
    const categoryId = await this.ensure('Category', { product: productId }, { name: '--default--', product: productId });
    logger.info({ productId, versionId }, '[jira-xray-sync] (kiwi) product ready');
    return { classificationId, productId, versionId, categoryId };
  }

  /** filter-or-create: returns the id of the first match, else creates one and returns its id. */
  private async ensure(entity: string, filter: Record<string, unknown>, create: Record<string, unknown>): Promise<number> {
    const found = await this.rpc.call<Array<{ id: number }>>(`${entity}.filter`, [filter]);
    if (found.length > 0) return found[0]!.id;
    const created = await this.rpc.call<{ id: number }>(`${entity}.create`, [create]);
    return created.id;
  }

  async pushTestCase(input: PushTestCaseInput): Promise<XrayTestIssueRef> {
    const { categoryId } = await this.bootstrap();
    const stepsText = input.testCase.steps.map((s, i) => `${i + 1}. ${s.step}\n   => ${s.expectedResult}`).join('\n');
    const created = await this.rpc.call<{ id: number }>('TestCase.create', [
      {
        summary: input.testCase.title,
        category: categoryId,
        priority: PRIORITY_BY_LEVEL[input.testCase.priority],
        case_status: CASE_STATUS_CONFIRMED,
        is_automated: true,
        text: `Sutra story ${input.storyId} / ${input.testCase.category}\n\n${input.testCase.preconditions ? `Preconditions: ${input.testCase.preconditions}\n\n` : ''}${stepsText}`,
      },
    ]);
    logger.info({ caseId: created.id, testCaseId: input.testCase.id }, '[jira-xray-sync] (kiwi) test case created');
    return { key: `KIWI-${created.id}`, issueId: String(created.id) };
  }

  async createTestSet(input: CreateGroupInput): Promise<XrayTestIssueRef> {
    const plan = await this.ensurePlan(input.summary);
    for (const caseId of input.testIssueIds) await this.addCaseToPlan(plan, caseId);
    logger.info({ planId: plan, caseCount: input.testIssueIds.length }, '[jira-xray-sync] (kiwi) test plan (set) ready');
    return { key: `KIWI-PLAN-${plan}`, issueId: String(plan) };
  }

  /** Kiwi has one grouping concept, so the "plan" resolves to the same TestPlan as the "set". */
  async createTestPlan(input: CreateGroupInput): Promise<XrayTestIssueRef> {
    const plan = await this.ensurePlan(input.summary);
    return { key: `KIWI-PLAN-${plan}`, issueId: String(plan) };
  }

  async addTestsToTestSet(testSetIssueId: string, testIssueIds: string[]): Promise<void> {
    for (const caseId of testIssueIds) await this.addCaseToPlan(Number(testSetIssueId), caseId);
    logger.info({ planId: testSetIssueId, addedCount: testIssueIds.length }, '[jira-xray-sync] (kiwi) cases added to plan');
  }

  async removeTestsFromTestSet(testSetIssueId: string, testIssueIds: string[]): Promise<void> {
    for (const caseId of testIssueIds) {
      await this.rpc.call('TestPlan.remove_case', [Number(testSetIssueId), Number(caseId)]).catch((err: unknown) => {
        logger.warn({ err, caseId }, '[jira-xray-sync] (kiwi) remove_case failed (already absent?)');
      });
    }
    logger.info({ planId: testSetIssueId, removedCount: testIssueIds.length }, '[jira-xray-sync] (kiwi) cases removed from plan');
  }

  async linkTestExecutionToPlan(testPlanIssueId: string, testExecutionIssueId: string): Promise<void> {
    // In Kiwi a TestRun is created under a TestPlan already, so there is nothing to link.
    logger.info({ testPlanIssueId, testExecutionIssueId }, '[jira-xray-sync] (kiwi) run already belongs to its plan — no link needed');
  }

  /** Never deletes: tags the case, retires it (status DISABLED), and pulls it from the active plan. */
  async supersedeTestIssue(input: SupersedeTestIssueInput): Promise<void> {
    await this.bootstrap();
    if (!input.oldIssueId) {
      logger.warn({ oldKey: input.oldKey }, '[jira-xray-sync] (kiwi) supersede: no case id on hand — skipping');
      return;
    }
    const caseId = Number(input.oldIssueId);
    const tag = input.reason === 'clause-removed' ? 'sutra-clause-removed' : 'sutra-superseded';
    await this.rpc.call('TestCase.add_tag', [caseId, tag]).catch((err: unknown) => logger.warn({ err }, '[jira-xray-sync] (kiwi) add_tag failed'));
    await this.rpc.call('TestCase.update', [caseId, { case_status: CASE_STATUS_DISABLED }]).catch((err: unknown) =>
      logger.warn({ err }, '[jira-xray-sync] (kiwi) retire (update status) failed'),
    );
    if (input.testSetIssueId) {
      await this.rpc.call('TestPlan.remove_case', [Number(input.testSetIssueId), caseId]).catch(() => {});
    }
    logger.info({ oldKey: input.oldKey, reason: input.reason }, '[jira-xray-sync] (kiwi) test case superseded (tagged + retired, not deleted)');
  }

  // --- helpers ---

  private async ensurePlan(name: string): Promise<number> {
    const { productId, versionId } = await this.bootstrap();
    const existing = await this.rpc.call<Array<{ id: number }>>('TestPlan.filter', [{ name, product: productId }]);
    if (existing.length > 0) return existing[0]!.id;
    const created = await this.rpc.call<{ id: number }>('TestPlan.create', [
      { name, product: productId, product_version: versionId, type: PLAN_TYPE_ACCEPTANCE, is_active: true },
    ]);
    return created.id;
  }

  private async addCaseToPlan(planId: number, caseId: string): Promise<void> {
    await this.rpc.call('TestPlan.add_case', [planId, Number(caseId)]).catch((err: unknown) => {
      logger.warn({ err, caseId }, '[jira-xray-sync] (kiwi) add_case failed (already present?)');
    });
  }
}
