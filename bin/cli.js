#!/usr/bin/env node

import fs from 'node:fs';
import { PlanParser } from '../src/plan_parser.ts';
import { BlastAnalyzer } from '../src/blast_analyzer.ts';
import { verifyOfflineLicenseKey } from '../src/license_verifier.ts';
import { InflowPaywall } from '../src/inflow_paywall.ts';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(`
💣 TerraCost Blast — Air-Gapped Blast Radius & FinOps Diff for Terraform
Usage:
  terracost <tfplan.json> [--fail-on-critical] [--markdown] [--json] [--license <KEY>]

Options:
  <tfplan.json>             Path to JSON plan generated via 'terraform show -json tfplan.binary'
  --fail-on-critical        Exit with code 1 if persistent stateful data destruction is detected
  --markdown                Print GitHub PR comment / CI step summary in Markdown
  --json                    Output machine-readable JSON evaluation
  --license <KEY>           Offline Ed25519 commercial license (or TERRACOST_LICENSE_KEY)
  --emergency-pass-24h      24-hour temporary grace period bypass for urgent production CI deploys
`);
  process.exit(0);
}

const planPath = args.find(a => !a.startsWith('-'));
if (!planPath) {
  console.error('Error: Path to Terraform JSON plan is required.');
  process.exit(1);
}

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const licenseKey = getArgValue('--license') || process.env.TERRACOST_LICENSE_KEY;
const license = verifyOfflineLicenseKey(licenseKey);
const hasEmergencyGrace = args.includes('--emergency-pass-24h') || !!process.env.TERRACOST_EMERGENCY_GRACE;

try {
  const planJson = fs.readFileSync(planPath, 'utf8');
  const summary = PlanParser.parse(planJson);

  // In-Flow Paywall evaluation
  const paywallStatus = InflowPaywall.evaluate({
    productName: 'TerraCost Blast & FinOps',
    metricName: 'resources',
    currentValue: summary.totalChanges,
    freeLimit: license.maxResources,
    checkoutUrl: 'https://buy.polar.sh/polar_cl_bHsPkpJfvHmG9STDpIdNGVMLpSwVG6wHoQPTz3Fa7TY',
    priceText: '$49/month or $149 Lifetime'
  }, license.valid, hasEmergencyGrace);

  if (!paywallStatus.allowed) {
    if (paywallStatus.ansiBanner) {
      process.stderr.write(paywallStatus.ansiBanner);
    }
    process.exit(1);
  }

  if (paywallStatus.isEmergencyGrace && paywallStatus.ansiBanner) {
    process.stderr.write(paywallStatus.ansiBanner);
  }

  const report = BlastAnalyzer.evaluate(summary);

  // Automatically write rich report to GitHub Step Summary if running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        BlastAnalyzer.generateMarkdownSummary(report) + '\n',
        'utf8'
      );
    } catch {
      // Ignore step summary write error
    }
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify({ report, license }, null, 2));
  } else if (args.includes('--markdown')) {
    console.log(BlastAnalyzer.generateMarkdownSummary(report));
  } else {
    console.log('\n💣 TerraCost Blast Radius & FinOps Evaluation:');
    console.log(`  Blast Radius Score:  ${report.score}/100 [${report.severity}]`);
    const sign = report.costDelta.monthlyDeltaCost >= 0 ? '+' : '';
    console.log(`  FinOps Monthly Delta: ${sign}$${report.costDelta.monthlyDeltaCost.toFixed(2)} / month`);
    console.log(`  Planned Changes:     +${report.totalCreated} created, ~${report.totalUpdated} updated, ±${report.totalReplaced} replaced, -${report.totalDestroyed} deleted`);
    console.log(`  Safety Verdict:      ${report.shouldBlockDeploy ? '🛑 CRITICAL DATA LOSS HAZARD' : '✅ SAFE TO APPLY'}`);

    if (report.statefulDestructions.length > 0) {
      console.log('\n🚨 Stateful Destruction Warnings:');
      report.statefulDestructions.forEach(d => {
        console.log(`  • [${d.action}] ${d.address} (${d.type})`);
        console.log(`    ↳ ${d.hazardDescription}`);
      });
    }

    if (report.costDelta.breakdown.length > 0) {
      console.log('\n💰 Cost Impact:');
      report.costDelta.breakdown.forEach(b => {
        const s = b.monthlyDelta >= 0 ? '+' : '';
        console.log(`  • ${b.address} (${b.action}): ${s}$${b.monthlyDelta.toFixed(2)}/mo`);
      });
    }
  }

  if (args.includes('--fail-on-critical') && report.shouldBlockDeploy) {
    console.error('\n🛑 Pipeline halted: Critical stateful destruction detected and --fail-on-critical is set.');
    process.exit(1);
  }
} catch (err) {
  console.error('Error evaluating plan:', err.message);
  process.exit(1);
}

