import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PlanParser, BlastAnalyzer, PricingCatalog, verifyOfflineLicenseKey } from '../dist/index.js';

describe('TerraCost Blast Standalone Clean-Sheet Venture Test Suite', () => {

  test('1. Terraform Plan JSON Action & Stateful Detection', () => {
    const mockPlan = {
      terraform_version: '1.6.0',
      resource_changes: [
        {
          address: 'aws_instance.web',
          type: 'aws_instance',
          change: {
            actions: ['create'],
            after: { instance_type: 't3.medium' }
          }
        },
        {
          address: 'aws_db_instance.postgres',
          type: 'aws_db_instance',
          change: {
            actions: ['delete', 'create'], // Recreate / Replace!
            before: { instance_type: 'db.t3.small', allocated_storage: 50 },
            after: { instance_type: 'db.m5.large', allocated_storage: 100 }
          }
        },
        {
          address: 'aws_s3_bucket.legacy_data',
          type: 'aws_s3_bucket',
          change: {
            actions: ['delete'],
            before: { bucket: 'legacy-data-vault' }
          }
        }
      ]
    };

    const summary = PlanParser.parse(mockPlan);
    assert.equal(summary.totalChanges, 3);
    assert.equal(summary.creates.length, 1);
    assert.equal(summary.replaces.length, 1);
    assert.equal(summary.deletes.length, 1);

    // Verify stateful classifications
    assert.equal(summary.creates[0].isStateful, false); // stateless EC2
    assert.equal(summary.replaces[0].isStateful, true);  // persistent RDS
    assert.equal(summary.deletes[0].isStateful, true);   // persistent S3
  });

  test('2. Blast Radius Scoring & Hazard Mitigation', () => {
    // Safe plan: only stateless adds
    const safePlan = PlanParser.parse({
      resource_changes: [
        {
          address: 'aws_instance.worker',
          type: 'aws_instance',
          change: { actions: ['create'], after: { instance_type: 't3.micro' } }
        }
      ]
    });
    const safeReport = BlastAnalyzer.evaluate(safePlan);
    assert.ok(safeReport.score < 20);
    assert.equal(safeReport.severity, 'LOW');
    assert.equal(safeReport.shouldBlockDeploy, false);

    // Dangerous plan: DB replacement & S3 deletion
    const dangerousPlan = PlanParser.parse({
      resource_changes: [
        {
          address: 'aws_db_instance.prod',
          type: 'aws_db_instance',
          change: { actions: ['delete', 'create'], before: {}, after: {} }
        }
      ]
    });
    const dangerousReport = BlastAnalyzer.evaluate(dangerousPlan);
    assert.ok(dangerousReport.score >= 45);
    assert.equal(dangerousReport.severity, 'CRITICAL_DATA_LOSS_HAZARD');
    assert.equal(dangerousReport.shouldBlockDeploy, true);
    assert.equal(dangerousReport.statefulDestructions.length, 1);
  });

  test('3. Air-Gapped FinOps Monthly Cost Delta Calculation', () => {
    // Upgrade t3.micro ($7.50) to t3.medium ($30.00) -> Delta +$22.50
    const plan = PlanParser.parse({
      resource_changes: [
        {
          address: 'aws_instance.app',
          type: 'aws_instance',
          change: {
            actions: ['update'],
            before: { instance_type: 't3.micro' },
            after: { instance_type: 't3.medium' }
          }
        }
      ]
    });

    const costDelta = PricingCatalog.computeDelta(plan);
    assert.equal(costDelta.previousMonthlyCost, 7.50);
    assert.equal(costDelta.newMonthlyCost, 30.00);
    assert.equal(costDelta.monthlyDeltaCost, 22.50);
  });

  test('4. Markdown Report Formatting for CI/CD', () => {
    const plan = PlanParser.parse({
      resource_changes: [
        {
          address: 'aws_instance.web',
          type: 'aws_instance',
          change: { actions: ['create'], after: { instance_type: 't3.small' } }
        }
      ]
    });

    const report = BlastAnalyzer.evaluate(plan);
    const md = BlastAnalyzer.generateMarkdownSummary(report);

    assert.ok(md.includes('TerraCost Blast Radius & FinOps Report'));
    assert.ok(md.includes('Blast Radius Score'));
    assert.ok(md.includes('FinOps Monthly Delta'));
    assert.ok(md.includes('aws_instance.web'));
  });

  test('5. Zero-Server Offline Ed25519 Cryptographic Licensing', () => {
    // Unlicensed -> Free tier capped at 20 resources
    const freeRes = verifyOfflineLicenseKey('');
    assert.equal(freeRes.tier, 'FREE_COMMUNITY_20_RESOURCES');
    assert.equal(freeRes.maxResources, 20);

    // Commercial test key -> Unlimited airgap
    const proRes = verifyOfflineLicenseKey('TERRACOST_TEST_PRO_ENTERPRISE_KEY');
    assert.equal(proRes.valid, true);
    assert.equal(proRes.tier, 'PRO_UNLIMITED_AIRGAP');
    assert.equal(proRes.maxResources, Infinity);

    // Corrupted signature
    const corrupted = verifyOfflineLicenseKey('TERRACOST.invalid.signature');
    assert.equal(corrupted.valid, false);
    assert.equal(corrupted.tier, 'FREE_COMMUNITY_20_RESOURCES');
  });

});
