import type { ParsedResource, ParsedPlanSummary } from './plan_parser.ts';

// Standard 730-hour month baseline pricing catalog (USD / month)
const STATIC_PRICING_TABLE: Record<string, number> = {
  // AWS EC2
  't3.nano': 3.80,
  't3.micro': 7.50,
  't3.small': 15.00,
  't3.medium': 30.00,
  't3.large': 60.00,
  'm5.large': 70.00,
  'm5.xlarge': 140.00,
  'c5.large': 62.00,
  'c5.xlarge': 124.00,

  // AWS RDS
  'db.t3.micro': 12.50,
  'db.t3.small': 25.00,
  'db.t3.medium': 50.00,
  'db.m5.large': 130.00,

  // GCP Compute Engine
  'e2-micro': 6.11,
  'e2-small': 12.23,
  'e2-medium': 24.46,
  'e2-standard-2': 48.92,
  'e2-standard-4': 97.84,
  'n1-standard-1': 24.27,

  // GCP Cloud SQL
  'db-f1-micro': 9.25,
  'db-g1-small': 25.50,
  'db-custom-1-3840': 49.80,

  // Azure VM
  'Standard_B1s': 7.59,
  'Standard_B2s': 30.37,
  'Standard_D2s_v3': 70.00,
  'Standard_D4s_v3': 140.00
};

export interface CostDeltaResult {
  previousMonthlyCost: number;
  newMonthlyCost: number;
  monthlyDeltaCost: number; // positive = increased bill, negative = savings
  currency: 'USD';
  breakdown: Array<{
    address: string;
    action: string;
    monthlyDelta: number;
  }>;
}

export class PricingCatalog {
  /**
   * Estimates monthly running cost for a single resource.
   */
  public static getResourceMonthlyCost(res: ParsedResource, useTarget: 'before' | 'after' = 'after'): number {
    const targetObj = useTarget === 'before' ? res.before : res.after;
    if (!targetObj) return 0;

    const instanceType = targetObj.instance_type || targetObj.machine_type || targetObj.size || targetObj.instance_class || res.instanceType;
    let baseCost = 0;

    if (instanceType && STATIC_PRICING_TABLE[instanceType]) {
      baseCost = STATIC_PRICING_TABLE[instanceType];
    } else if (res.type.includes('instance') || res.type.includes('virtual_machine')) {
      baseCost = 35.00; // conservative default VM instance cost
    } else if (res.type.includes('db_') || res.type.includes('sql_database')) {
      baseCost = 50.00; // conservative default DB cost
    } else if (res.type.includes('nat_gateway')) {
      baseCost = 32.85; // AWS NAT Gateway base per month
    } else if (res.type.includes('lb') || res.type.includes('alb') || res.type.includes('elb')) {
      baseCost = 16.20; // Application Load Balancer
    }

    const storageGb = targetObj.allocated_storage || targetObj.disk_size_gb || res.storageGb;
    if (storageGb && storageGb > 0 && typeof storageGb === 'number') {
      baseCost += storageGb * 0.10;
    }

    return Math.round(baseCost * 100) / 100;
  }

  /**
   * Computes the net monthly delta cost of the plan.
   */
  public static computeDelta(plan: ParsedPlanSummary): CostDeltaResult {
    let previousCost = 0;
    let newCost = 0;
    const breakdown: CostDeltaResult['breakdown'] = [];

    // Created resources
    for (const res of plan.creates) {
      const cost = this.getResourceMonthlyCost(res, 'after');
      newCost += cost;
      if (cost > 0) {
        breakdown.push({
          address: res.address,
          action: 'CREATE',
          monthlyDelta: cost
        });
      }
    }

    // Deleted resources
    for (const res of plan.deletes) {
      const cost = this.getResourceMonthlyCost(res, 'before');
      previousCost += cost;
      if (cost > 0) {
        breakdown.push({
          address: res.address,
          action: 'DELETE',
          monthlyDelta: -cost
        });
      }
    }

    // Replaced resources (re-creation)
    for (const res of plan.replaces) {
      const costBefore = this.getResourceMonthlyCost(res, 'before');
      const costAfter = this.getResourceMonthlyCost(res, 'after');
      previousCost += costBefore;
      newCost += costAfter;
      const delta = Math.round((costAfter - costBefore) * 100) / 100;
      breakdown.push({
        address: res.address,
        action: 'REPLACE',
        monthlyDelta: delta
      });
    }

    // Updated resources (e.g. resize instance)
    for (const res of plan.updates) {
      const costBefore = this.getResourceMonthlyCost(res, 'before');
      const costAfter = this.getResourceMonthlyCost(res, 'after');
      previousCost += costBefore;
      newCost += costAfter;
      const delta = Math.round((costAfter - costBefore) * 100) / 100;
      if (delta !== 0) {
        breakdown.push({
          address: res.address,
          action: 'UPDATE',
          monthlyDelta: delta
        });
      }
    }

    const monthlyDeltaCost = Math.round((newCost - previousCost) * 100) / 100;

    return {
      previousMonthlyCost: Math.round(previousCost * 100) / 100,
      newMonthlyCost: Math.round(newCost * 100) / 100,
      monthlyDeltaCost,
      currency: 'USD',
      breakdown
    };
  }
}
