import type { ParsedPlanSummary, ParsedResource } from './plan_parser.ts';
import { PricingCatalog } from './pricing_catalog.ts';
import type { CostDeltaResult } from './pricing_catalog.ts';

export type BlastSeverity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL_DATA_LOSS_HAZARD';

export interface DestructiveAlert {
  address: string;
  type: string;
  action: 'DELETE' | 'REPLACE';
  isStateful: boolean;
  hazardDescription: string;
}

export interface BlastRadiusReport {
  score: number; // 0 to 100
  severity: BlastSeverity;
  totalDestroyed: number;
  totalReplaced: number;
  totalCreated: number;
  totalUpdated: number;
  statefulDestructions: DestructiveAlert[];
  costDelta: CostDeltaResult;
  shouldBlockDeploy: boolean;
}

export class BlastAnalyzer {
  public static evaluate(plan: ParsedPlanSummary): BlastRadiusReport {
    const statefulDestructions: DestructiveAlert[] = [];
    let score = 0;

    // Evaluate replaced resources (destructive recreate)
    for (const res of plan.replaces) {
      if (res.isStateful) {
        score += 45;
        statefulDestructions.push({
          address: res.address,
          type: res.type,
          action: 'REPLACE',
          isStateful: true,
          hazardDescription: `Resource will be destroyed and recreated. High risk of persistent data loss on ${res.type}!`
        });
      } else {
        score += 15;
      }
    }

    // Evaluate deleted resources
    for (const res of plan.deletes) {
      if (res.isStateful) {
        score += 50;
        statefulDestructions.push({
          address: res.address,
          type: res.type,
          action: 'DELETE',
          isStateful: true,
          hazardDescription: `Persistent stateful resource is scheduled for DELETION! Verify database snapshots/backups.`
        });
      } else if (res.type.includes('vpc') || res.type.includes('subnet') || res.type.includes('security_group')) {
        score += 25; // Network isolation / connectivity loss hazard
      } else {
        score += 5;
      }
    }

    // Created or updated resources contribute minor operational volatility
    score += plan.creates.length * 2;
    score += plan.updates.length * 1;

    const normalizedScore = Math.min(100, score);

    let severity: BlastSeverity = 'LOW';
    if (normalizedScore >= 75 || statefulDestructions.length > 0) {
      severity = 'CRITICAL_DATA_LOSS_HAZARD';
    } else if (normalizedScore >= 45) {
      severity = 'HIGH';
    } else if (normalizedScore >= 20) {
      severity = 'MODERATE';
    }

    const costDelta = PricingCatalog.computeDelta(plan);
    const shouldBlockDeploy = severity === 'CRITICAL_DATA_LOSS_HAZARD';

    return {
      score: normalizedScore,
      severity,
      totalDestroyed: plan.deletes.length,
      totalReplaced: plan.replaces.length,
      totalCreated: plan.creates.length,
      totalUpdated: plan.updates.length,
      statefulDestructions,
      costDelta,
      shouldBlockDeploy
    };
  }

  /**
   * Generates a GitHub PR Comment / CI Summary Markdown.
   */
  public static generateMarkdownSummary(report: BlastRadiusReport): string {
    const costSign = report.costDelta.monthlyDeltaCost >= 0 ? '+' : '';
    const costText = `${costSign}$${report.costDelta.monthlyDeltaCost.toFixed(2)} / month`;

    let md = `### 💣 TerraCost Blast Radius & FinOps Report\n\n`;
    md += `| Metric | Assessment |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Blast Radius Score** | **${report.score}/100** (${report.severity}) |\n`;
    md += `| **FinOps Monthly Delta** | **${costText}** (from $${report.costDelta.previousMonthlyCost} to $${report.costDelta.newMonthlyCost}) |\n`;
    md += `| **Changes Summary** | +${report.totalCreated} created, ~${report.totalUpdated} updated, ±${report.totalReplaced} replaced, -${report.totalDestroyed} deleted |\n`;
    md += `| **Deploy Safety Status** | ${report.shouldBlockDeploy ? '🛑 **BLOCKED (Critical Hazard)**' : '✅ **PASS (Safe to Apply)**'} |\n\n`;

    if (report.statefulDestructions.length > 0) {
      md += `#### 🚨 Critical Stateful Destruction Alerts\n`;
      for (const alert of report.statefulDestructions) {
        md += `- ⚠️ **[${alert.action}]** \`${alert.address}\` (\`${alert.type}\`)\n  ↳ ${alert.hazardDescription}\n`;
      }
      md += '\n';
    }

    if (report.costDelta.breakdown.length > 0) {
      md += `#### 💰 Monthly Cost Impact Breakdown\n`;
      md += `| Resource | Action | Cost Delta |\n`;
      md += `| :--- | :--- | :--- |\n`;
      for (const item of report.costDelta.breakdown) {
        const sign = item.monthlyDelta >= 0 ? '+' : '';
        md += `| \`${item.address}\` | \`${item.action}\` | ${sign}$${item.monthlyDelta.toFixed(2)}/mo |\n`;
      }
      md += '\n';
    }

    md += `> 🔓 [**Unlock Unlimited Enterprise Cloud Plans & Custom Pricing Tables ($49/mo via Polar.sh)**](https://polar.sh/checkout?product_id=3fb1980f-938c-453f-80b0-9235340dadcb&ref=github_step_summary)\n`;

    return md;
  }
}
