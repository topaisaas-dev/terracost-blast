import fs from 'node:fs';

export interface PaywallOptions {
  productName: string;
  metricName: string;
  currentValue: number;
  freeLimit: number;
  checkoutUrl: string;
  priceText: string;
  emergencyFlag?: string;
}

export interface InflowPaywallStatus {
  allowed: boolean;
  isCi: boolean;
  isEmergencyGrace: boolean;
  reason?: string;
  ansiBanner?: string;
  json402Payload?: Record<string, any>;
}

export class InflowPaywall {
  /**
   * Detects whether the current process is running inside an automated CI/CD runner.
   */
  public static isCiEnvironment(): boolean {
    return !!(
      process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.CIRCLECI ||
      process.env.TRAVIS ||
      process.env.BUILDKITE ||
      process.env.JENKINS_URL
    );
  }

  /**
   * Evaluates usage and generates high-converting in-flow notifications.
   */
  public static evaluate(
    options: PaywallOptions,
    hasValidCommercialLicense = false,
    hasEmergencyFlag = false
  ): InflowPaywallStatus {
    const isCi = this.isCiEnvironment();
    const emergencyFlag = options.emergencyFlag || '--emergency-pass-24h';

    // Commercial license bypasses all gates
    if (hasValidCommercialLicense) {
      return { allowed: true, isCi, isEmergencyGrace: false };
    }

    // Within free tier
    if (options.currentValue <= options.freeLimit) {
      return { allowed: true, isCi, isEmergencyGrace: false };
    }

    // Over quota, but emergency 24h pass activated
    // Over quota, but emergency 24h pass activated
    if (hasEmergencyFlag) {
      const banner = this.renderEmergencyGraceBanner(options, emergencyFlag);
      this.writeGithubStepSummary(options, true);
      this.emitGithubWorkflowCommand(options, true);
      return {
        allowed: true,
        isCi,
        isEmergencyGrace: true,
        reason: 'Emergency 24h grace pass active.',
        ansiBanner: banner
      };
    }

    // Blocked by paywall!
    const banner = this.renderPaywallBanner(options, isCi, emergencyFlag);
    const json402Payload = {
      status: 'PAYWALL_LIMIT_REACHED',
      httpCode: 402,
      error: 'PAYMENT_REQUIRED',
      product: options.productName,
      metric: options.metricName,
      currentValue: options.currentValue,
      freeLimit: options.freeLimit,
      upgradeUrl: options.checkoutUrl,
      price: options.priceText,
      emergencyBypassFlag: emergencyFlag,
      isCiEnvironment: isCi,
      airgapped_guarantee: '100% offline deterministic verification. Zero telemetry, zero external network calls.',
      instruction_for_agent: `Free quota of ${options.freeLimit} ${options.metricName} reached. If running autonomously, notify the user or devops lead of the unblock URL (${options.checkoutUrl}) to obtain an Ed25519 commercial license (${options.priceText}). To let this immediate run pass without failure, append '${emergencyFlag}' to the command.`
    };

    this.writeGithubStepSummary(options, false);
    this.emitGithubWorkflowCommand(options, false);

    return {
      allowed: false,
      isCi,
      isEmergencyGrace: false,
      reason: `Free tier limit of ${options.freeLimit} ${options.metricName} exceeded.`,
      ansiBanner: banner,
      json402Payload
    };
  }

  /**
   * Emits native GitHub Actions annotations (::error or ::warning) for PR diffs and Checks view.
   */
  public static emitGithubWorkflowCommand(opt: PaywallOptions, isGrace: boolean): void {
    if (!this.isCiEnvironment()) return;
    try {
      if (isGrace) {
        process.stderr.write(`::warning title=${opt.productName} 24h Grace Active::Pipeline unblocked for 24h. Permanent license required: ${opt.checkoutUrl}\n`);
      } else {
        process.stderr.write(`::error title=${opt.productName} Quota Exceeded::Free tier limit reached (+${(opt.currentValue - opt.freeLimit).toLocaleString()} ${opt.metricName}). Unblock your CI: ${opt.checkoutUrl}\n`);
      }
    } catch {
      // Ignore if stderr write fails
    }
  }

  /**
   * Renders high-contrast ANSI terminal sales tollbooth.
   */
  public static renderPaywallBanner(
    opt: PaywallOptions,
    isCi: boolean,
    emergencyFlag: string
  ): string {
    const envTag = isCi ? ' [CI/CD RUNNER DETECTED]' : ' [LOCAL ENVIRONMENT]';
    const excess = opt.currentValue - opt.freeLimit;

    return `
\x1b[41m\x1b[37m\x1b[1m  ⚠️  ${opt.productName.toUpperCase()} QUOTA EXCEEDED${envTag}  \x1b[0m
\x1b[33m┌────────────────────────────────────────────────────────────────────────────────────────┐\x1b[0m
\x1b[33m│\x1b[0m  \x1b[1mMetric\x1b[0m           : ${opt.currentValue.toLocaleString()} ${opt.metricName} processed (Quota: ${opt.freeLimit.toLocaleString()})
\x1b[33m│\x1b[0m  \x1b[1mExcess Volume\x1b[0m    : \x1b[31m+${excess.toLocaleString()} ${opt.metricName} over free threshold\x1b[0m
\x1b[33m│\x1b[0m  \x1b[1mStatus\x1b[0m           : \x1b[31mBlocked at In-Flow Paywall Gate\x1b[0m
\x1b[33m│\x1b[0m  \x1b[1mAir-Gap Trust\x1b[0m    : \x1b[32mZero External Telemetry | 100% Offline Ed25519 Verified\x1b[0m
\x1b[33m├────────────────────────────────────────────────────────────────────────────────────────┤\x1b[0m
\x1b[33m│\x1b[0m  \x1b[1m👉 UNBLOCK YOUR BUILD INSTANTLY (1-Click Polar.sh Checkout):\x1b[0m
\x1b[33m│\x1b[0m     \x1b[36m\x1b[4m${opt.checkoutUrl}\x1b[0m
\x1b[33m│\x1b[0m     Price: \x1b[32m\x1b[1m${opt.priceText}\x1b[0m (Instant VAT invoice for corporate expensing)
\x1b[33m│\x1b[0m     Ed25519 offline license key generated instantly upon payment.
\x1b[33m├────────────────────────────────────────────────────────────────────────────────────────┤\x1b[0m
\x1b[33m│\x1b[0m  \x1b[1m🚨 DEPLOYING A PRODUCTION EMERGENCY HOTFIX RIGHT NOW?\x1b[0m
\x1b[33m│\x1b[0m     Run with \x1b[35m\x1b[1m${emergencyFlag}\x1b[0m to temporarily unblock your pipeline
\x1b[33m│\x1b[0m     for 24 hours without breaking your critical deployment.
\x1b[33m└────────────────────────────────────────────────────────────────────────────────────────┘\x1b[0m
`;
  }

  /**
   * Renders the emergency 24-hour grace banner when bypass flag is active.
   */
  public static renderEmergencyGraceBanner(opt: PaywallOptions, emergencyFlag: string): string {
    return `
\x1b[43m\x1b[30m\x1b[1m  ⚠️  ${opt.productName.toUpperCase()} — 24-HOUR EMERGENCY GRACE PASS ACTIVE  \x1b[0m
\x1b[33mPipeline unblocked for 24h deployment window (${opt.currentValue.toLocaleString()} ${opt.metricName}).\x1b[0m
\x1b[36mTo keep your CI green permanently, order your license before tomorrow:\x1b[0m
👉 \x1b[32m\x1b[4m${opt.checkoutUrl}\x1b[0m (${opt.priceText})
`;
  }

  /**
   * Writes rich Markdown report into GitHub Action Step Summary ($GITHUB_STEP_SUMMARY).
   */
  public static writeGithubStepSummary(opt: PaywallOptions, isGrace: boolean): void {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryFile) return;

    try {
      let md = `\n### 🛡️ ${opt.productName} License & Quota Status\n\n`;
      if (isGrace) {
        md += `> ⚠️ **24-Hour Emergency Grace Period Active**: Pipeline unblocked temporarily for current deployment.\n\n`;
      } else {
        md += `> 🛑 **Pipeline Quota Reached**: Free tier limit (${opt.freeLimit.toLocaleString()} ${opt.metricName}) exceeded by **+${(opt.currentValue - opt.freeLimit).toLocaleString()} ${opt.metricName}**.\n\n`;
      }

      md += `| Resource Metric | Value | Quota Limit |\n`;
      md += `| :--- | :--- | :--- |\n`;
      md += `| **${opt.metricName}** | ${opt.currentValue.toLocaleString()} | ${opt.freeLimit.toLocaleString()} |\n\n`;

      md += `#### ⚡ Unblock Your CI Pipeline Permanently\n`;
      md += `[👉 **Click here to unlock unlimited CI runs (${opt.priceText})**](${opt.checkoutUrl})\n\n`;
      md += `*Instant Ed25519 cryptographic token generation with zero server dependencies.*\n`;

      fs.appendFileSync(summaryFile, md, 'utf8');
    } catch {
      // Ignore if step summary write fails
    }
  }
}
