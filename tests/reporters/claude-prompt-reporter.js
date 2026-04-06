import fs from 'fs';
import path from 'path';

class ClaudePromptReporter {
  onEnd() {
    const bugDir = path.join('tests', 'artifacts', 'bug-packages');
    const promptDir = path.join('tests', 'artifacts', 'claude-prompts');
    fs.mkdirSync(promptDir, { recursive: true });

    if (!fs.existsSync(bugDir)) return;

    const bugFiles = fs.readdirSync(bugDir).filter(f => f.endsWith('.json'));
    if (bugFiles.length === 0) return;

    bugFiles.forEach(file => {
      const bug = JSON.parse(fs.readFileSync(path.join(bugDir, file), 'utf-8'));
      const prompt = this.generatePrompt(bug);
      const promptFile = path.join(promptDir, `${bug.id}.md`);
      fs.writeFileSync(promptFile, prompt);
    });

    console.log(`\n🤖 Generated ${bugFiles.length} Claude Code fix prompt(s) in tests/artifacts/claude-prompts/`);
  }

  generatePrompt(bug) {
    const fileHint = this.inferFile(bug);
    const componentHint = this.inferComponent(bug);
    const grepTitle = (bug.test.fullTitle || '').split(' > ').pop() || bug.title;

    return `Read ${fileHint} carefully. Fix the following bug:

**Bug:** ${bug.title}
**Severity:** ${bug.severity}
**Category:** ${bug.category}

**What happens:**
${bug.actual}

**What should happen:**
The test "${bug.test.fullTitle}" should pass. See test file ${bug.test.file}:${bug.test.line} for the exact assertions.

**Stack trace (if available):**
\`\`\`
${bug.stackTrace || 'No stack trace captured'}
\`\`\`

**Likely location:** ${fileHint}${componentHint ? ` — ${componentHint} component` : ''}

**Requirements:**
- Fix the bug with minimal changes
- Do not refactor surrounding code
- Do not change the test — the test defines correct behavior
- Preserve all existing functionality
- Use existing code patterns (inline styles, useState hooks, Store.get/set for localStorage)

**Acceptance criteria:**
- The failing test passes: npx playwright test ${bug.test.file} --grep "${grepTitle}"
- npm run build still succeeds
- No new console errors

After fix: git add -A && git commit -m "fix: ${bug.title.toLowerCase().slice(0, 60)}" && git push
`;
  }

  inferFile(bug) {
    if (bug.category === 'analysis' || bug.category === 'pipeline' || bug.category === 'navigation' || bug.category === 'onboarding' || bug.category === 'preferences') {
      return 'pages/index.js';
    }
    if (bug.category === 'outreach' || bug.category === 'strategy' || bug.category === 'resume-workshop' || bug.category === 'interview-prep' || bug.category === 'import-export') {
      return 'pages/index.js';
    }
    if (bug.test.file?.includes('api')) return 'pages/api/';
    return 'pages/index.js';
  }

  inferComponent(bug) {
    const map = {
      analysis: 'AnalyzeView',
      pipeline: 'PipelineView',
      navigation: 'Aster (main)',
      onboarding: 'Onboarding',
      preferences: 'PrefsModal',
      outreach: 'OutreachView',
      strategy: 'StrategyView',
      'resume-workshop': 'ResumeWorkshopView',
      'interview-prep': 'PipelineView (Interview Prep modal)',
      'import-export': 'ImportHistoryModal',
    };
    return map[bug.category] || null;
  }
}

export default ClaudePromptReporter;
