export type PlannedAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REPLACE' | 'NOOP';

export interface ParsedResource {
  address: string;
  type: string;
  name: string;
  provider: string;
  action: PlannedAction;
  instanceType?: string;
  storageGb?: number;
  isStateful: boolean;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
}

export interface ParsedPlanSummary {
  terraformVersion?: string;
  totalChanges: number;
  creates: ParsedResource[];
  updates: ParsedResource[];
  deletes: ParsedResource[];
  replaces: ParsedResource[];
  noops: ParsedResource[];
}

// Stateful resource signatures where DELETE / REPLACE risks irrecoverable data loss
const STATEFUL_RESOURCE_PATTERNS = [
  /db_instance/,
  /rds_cluster/,
  /s3_bucket/,
  /dynamodb_table/,
  /elasticache/,
  /sql_database_instance/,
  /storage_bucket/,
  /cosmosdb/,
  /mssql_database/,
  /kms_key/,
  /ebs_volume/
];

export class PlanParser {
  public static isStatefulType(resourceType: string): boolean {
    return STATEFUL_RESOURCE_PATTERNS.some(p => p.test(resourceType.toLowerCase()));
  }

  /**
   * Parses standard `terraform show -json` output into structured resource changes.
   */
  public static parse(jsonStringOrObject: string | Record<string, any>): ParsedPlanSummary {
    const raw = typeof jsonStringOrObject === 'string'
      ? JSON.parse(jsonStringOrObject)
      : jsonStringOrObject;

    const resourceChanges = raw.resource_changes || [];
    const summary: ParsedPlanSummary = {
      terraformVersion: raw.terraform_version,
      totalChanges: 0,
      creates: [],
      updates: [],
      deletes: [],
      replaces: [],
      noops: []
    };

    for (const rc of resourceChanges) {
      const actions: string[] = rc.change?.actions || [];
      const before = rc.change?.before || null;
      const after = rc.change?.after || null;
      const type = rc.type || 'unknown_resource';
      const address = rc.address || rc.name || 'unknown';

      let action: PlannedAction = 'NOOP';

      if (actions.includes('create') && actions.includes('delete')) {
        action = 'REPLACE';
      } else if (actions.includes('create')) {
        action = 'CREATE';
      } else if (actions.includes('delete')) {
        action = 'DELETE';
      } else if (actions.includes('update')) {
        action = 'UPDATE';
      } else {
        action = 'NOOP';
      }

      // Extract hardware specs for cost calculation
      const targetObj = after || before || {};
      const instanceType = targetObj.instance_type || targetObj.machine_type || targetObj.size || targetObj.instance_class;
      const storageGb = targetObj.allocated_storage || targetObj.size || targetObj.disk_size_gb;

      const parsedRes: ParsedResource = {
        address,
        type,
        name: rc.name || address,
        provider: rc.provider_name || 'terraform',
        action,
        instanceType,
        storageGb: storageGb ? Number(storageGb) : undefined,
        isStateful: this.isStatefulType(type),
        before,
        after
      };

      if (action === 'CREATE') {
        summary.creates.push(parsedRes);
        summary.totalChanges++;
      } else if (action === 'UPDATE') {
        summary.updates.push(parsedRes);
        summary.totalChanges++;
      } else if (action === 'DELETE') {
        summary.deletes.push(parsedRes);
        summary.totalChanges++;
      } else if (action === 'REPLACE') {
        summary.replaces.push(parsedRes);
        summary.totalChanges++;
      } else {
        summary.noops.push(parsedRes);
      }
    }

    return summary;
  }
}
