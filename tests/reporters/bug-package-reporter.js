import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

class BugPackageReporter {
  constructor() {
    this.failures = [];
  }

  onTestEnd(test, result) {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;

    const artifactDir = path.join('tests', 'artifacts', 'bug-packages');
    fs.mkdirSync(artifactDir, { recursive: true });

    let commitSha = 'unknown';
    let branch = 'unknown';
    try { commitSha = execSync('git rev-parse --short HEAD').toString().trim(); } catch {}
    try { branch = execSync('git branch --show-current').toString().trim(); } catch {}

    const testId = test.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
    const timestamp = new Date().toISOString();
    const bugId = `BUG-${timestamp.slice(0,10).replace(/-/g,'')}-${testId}`;

    const isCritical = test.tags?.includes('@critical');

    const bugPackage = {
      id: bugId,
      title: `${test.parent?.title || 'Test'}: ${test.title}`,
      severity: isCritical ? 'P1' : 'P2',
      category: this.inferCategory(test),
      environment: {
        browser: test.parent?.project?.name || 'chromium',
        os: process.platform,
        nodeVersion: process.version,
        ci: !!process.env.CI,
      },
      test: {
        file: test.location?.file || 'unknown',
        line: test.location?.line || 0,
        fullTitle: `${test.parent?.title || ''} > ${test.title}`,
      },
      expected: 'Test should pass — see test body for specific assertions',
      actual: result.error?.message?.slice(0, 500) || 'Unknown error',
      stackTrace: result.error?.stack?.slice(0, 1000) || '',
      attachments: result.attachments?.map(a => ({ name: a.name, path: a.path, contentType: a.contentType })) || [],
      metadata: {
        timestamp,
        commitSha,
        branch,
        duration: result.duration,
        retries: result.retry,
        tags: test.tags || [],
      },
    };

    const filePath = path.join(artifactDir, `${bugId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(bugPackage, null, 2));
    this.failures.push(bugPackage);
  }

  inferCategory(test) {
    const file = test.location?.file || '';
    if (file.includes('analyze')) return 'analysis';
    if (file.includes('pipeline')) return 'pipeline';
    if (file.includes('navigation')) return 'navigation';
    if (file.includes('onboarding')) return 'onboarding';
    if (file.includes('preferences')) return 'preferences';
    if (file.includes('outreach')) return 'outreach';
    if (file.includes('strategy')) return 'strategy';
    if (file.includes('resume') || file.includes('workshop')) return 'resume-workshop';
    if (file.includes('interview')) return 'interview-prep';
    if (file.includes('import') || file.includes('export')) return 'import-export';
    return 'general';
  }

  onEnd() {
    if (this.failures.length > 0) {
      console.log(`\n📦 Generated ${this.failures.length} bug package(s) in tests/artifacts/bug-packages/`);
      this.failures.forEach(f => console.log(`  - ${f.severity} | ${f.title}`));
    }
  }
}

export default BugPackageReporter;
