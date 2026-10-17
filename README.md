# 💣 TerraCost Blast — Air-Gapped Blast Radius & FinOps Diff for Terraform

> **100% offline, air-gapped security and FinOps analyzer for Terraform execution plans (`terraform show -json`). Prevents catastrophic stateful data destruction and computes exact monthly cloud cost changes ($\Delta \$$/mo) with zero network calls.**

[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-TerraCost%20Blast-yellow.svg)](https://github.com/marketplace)
[![Air-Gapped Certified](https://img.shields.io/badge/Security-100%25%20Air--Gapped-blue.svg)](#)
[![Zero Infra Cost](https://img.shields.io/badge/Infra%20Cost-%240.00%20Local-purple.svg)](#)
[![Licensing](https://img.shields.io/badge/Licensing-Offline%20Ed25519-brightgreen.svg)](#)
[![Tests Passing](https://img.shields.io/badge/Tests-100%25%20Passing-brightgreen.svg)](#)

---

## 💥 The Problem: Accidental Production Outages & Silent Bill Shock

In enterprise DevOps environments, `terraform apply` is the single most dangerous command in the toolchain:
- **Catastrophic Recreation Outages**: Modifying a database schema or KMS key parameter triggers a silent `['delete', 'create']` replacement, **wiping out multi-terabyte production databases**.
- **Runaway Bill Shock**: An innocent PR changes instance types from `t3.medium` to `m5.4xlarge`, adding **\$4,500/month** to the cloud bill without anyone noticing during code review.
- **Security & Air-Gap Compliance**: Traditional FinOps SaaS tools (like Infracost Cloud) require outbound network requests streaming infrastructure metadata to external servers, which violates defense, banking, and air-gapped corporate policies.

## 🚀 The Solution: TerraCost Blast

**TerraCost Blast** operates completely air-gapped inside your local terminal or isolated CI/CD runner:
1. **Destructive Replacement Interceptor**: Flags any planned deletion or replacement on persistent stateful resources (`aws_db_instance`, `aws_rds_cluster`, `aws_s3_bucket`, `google_sql_database_instance`, `dynamodb_table`).
2. **Blast Radius Score (0 to 100)**: Computes dependency severity and automatically halts pipelines if `--fail-on-critical` is set.
3. **Air-Gapped FinOps Engine**: Contains an embedded static pricing catalog for AWS, GCP, and Azure compute, storage, and databases. Computes the exact monthly delta ($\Delta \$$/mo) **with 0 network calls**.
4. **Rich Pull Request Summaries**: Posts clean Markdown reports directly to GitHub PRs with itemized cost deltas and data loss warnings.

---

## 🛠️ GitHub Actions Workflow Integration

Add to `.github/workflows/terraform.yml`:

```yaml
name: Terraform Safety & FinOps Gate

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Plan
        run: |
          terraform init
          terraform plan -out=tfplan.binary
          terraform show -json tfplan.binary > tfplan.json

      - name: TerraCost Blast Radius & FinOps Check
        uses: topaisaas/terracost-blast@v1
        with:
          plan_json: 'tfplan.json'
          fail_on_critical: 'true'
```

---

## 💻 CLI Usage

### 1. Analyze Terraform Plan Locally
```bash
# Generate plan JSON
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary > tfplan.json

# Run TerraCost Blast
npx @topaisaas/terracost-blast tfplan.json --fail-on-critical
```
Output:
```text
💣 TerraCost Blast Radius & FinOps Evaluation:
  Blast Radius Score:  85/100 [CRITICAL_DATA_LOSS_HAZARD]
  FinOps Monthly Delta: +$22.50 / month
  Planned Changes:     +1 created, ~1 updated, ±1 replaced, -1 deleted
  Safety Verdict:      🛑 CRITICAL DATA LOSS HAZARD

🚨 Stateful Destruction Warnings:
  • [REPLACE] aws_db_instance.postgres (aws_db_instance)
    ↳ Resource will be destroyed and recreated. High risk of persistent data loss on aws_db_instance!
  • [DELETE] aws_s3_bucket.legacy_data (aws_s3_bucket)
    ↳ Persistent stateful resource is scheduled for DELETION! Verify database snapshots/backups.

💰 Cost Impact:
  • aws_instance.web (CREATE): +$30.00/mo
  • aws_instance.worker (DELETE): -$7.50/mo
```

### 2. Output Markdown for PR Comments
```bash
npx @topaisaas/terracost-blast tfplan.json --markdown
```

---

## 🔐 Zero-Server Offline Ed25519 Licensing

- **Community Free Tier**: Free forever for plans containing up to 20 resources.
- **Pro / Enterprise Sovereign Tier**: Unlimited resources, air-gap compliance certificate, customized private cloud pricing tables ($49/mo or $149 Lifetime via [Polar.sh Checkout](https://polar.sh/checkout?product_id=3fb1980f-938c-453f-80b0-9235340dadcb)).
- **100% Offline Cryptographic Validation**: Validated via Ed25519 digital signature ($0.00 infrastructure cost, zero server dependencies).

```bash
export TERRACOST_LICENSE_KEY="TERRACOST.<base64_payload>.<ed25519_signature>"
```

---

## 🧪 Unit Testing & Quality Assurance

```bash
npm test
```
- ✅ Terraform Plan JSON Action & Stateful Detection
- ✅ Blast Radius Scoring & Hazard Mitigation
- ✅ Air-Gapped FinOps Monthly Cost Delta Calculation
- ✅ Markdown Report Formatting for CI/CD
- ✅ Zero-Server Offline Ed25519 Cryptographic Licensing

---

## 📄 License
Apache-2.0.
