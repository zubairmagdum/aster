/**
 * Contract test: makes a real call to the Claude API and verifies the
 * response matches the JSON schema expected by the Aster frontend.
 *
 * Run manually before releases: npm run test:contract
 * Requires ANTHROPIC_API_KEY in environment.
 * NOT included in CI — too slow and costs real API credits.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY;

const skipReason = !API_KEY ? 'ANTHROPIC_API_KEY not set — skipping contract test' : null;

const SAMPLE_RESUME = `Jane Smith — Senior Software Engineer with 7 years experience. Built platform APIs at Stripe (2020-2024) and growth features at Airbnb (2017-2020). Skills: Python, Go, React, AWS, distributed systems, CI/CD, A/B testing. Education: BS Computer Science MIT.`;

const SAMPLE_JD = `Senior Software Engineer, Platform — Remote
We are looking for a Senior Software Engineer to join our platform team at Acme Corp. You will design and build scalable APIs serving millions of users. Requirements: 5+ years experience, Python or Go, AWS/GCP, CI/CD. We offer $180K-$220K, equity, remote work, unlimited PTO, and 401k match.`;

const SAMPLE_PREFS = {
  minSalary: 175000,
  employmentType: 'Full-time',
  workMode: 'Remote',
  importantPerks: ['Equity/stock options', 'Remote work'],
  targetIndustries: ['Technology'],
  customTargetIndustries: '',
};

function buildAnalyzePrompt() {
  return `You are an expert recruiter and career strategist.

CANDIDATE RESUME:
${SAMPLE_RESUME}

USER'S LEARNED PROFILE:
{}

USER PREFERENCES:
- Target comp: $${Math.round(SAMPLE_PREFS.minSalary / 1000)}K+
- Employment type: ${SAMPLE_PREFS.employmentType}
- Work mode: ${SAMPLE_PREFS.workMode}
- Important perks: ${SAMPLE_PREFS.importantPerks.join(', ')}
- Target industries: ${SAMPLE_PREFS.targetIndustries.join(', ')}

RESUME VERSIONS:
None created yet

JOB DESCRIPTION:
${SAMPLE_JD}

Return ONLY valid JSON (no markdown, no fences):
{
  "fitScore": <0-100>,
  "matchScore": <0-100 vs learned profile, null if no profile data>,
  "verdict": "<Apply Now|Apply with Tailoring|Long Shot|Skip>",
  "verdictReason": "<one punchy sentence>",
  "strengths": ["<str>","<str>","<str>"],
  "gaps": ["<gap>","<gap>"],
  "transferability": {
    "score": <0-100>,
    "reason": "<one sentence — what skills transfer even if domain doesn't match>",
    "angle": "<how to position the application to overcome the domain gap>"
  },
  "atsKeywords": ["<kw>",...],
  "tailoredSummary": "<2-3 sentence professional summary for this JD>",
  "tailoredBullets": [
    {"bullet":"<rewritten bullet>","job":"<the company this role belongs to>","action":"<add|replace>","replaces":"<first 6 words of bullet to replace, or null if add>"},
    {"bullet":"<rewritten bullet>","job":"<role>","action":"<add|replace>","replaces":"<or null>"},
    {"bullet":"<rewritten bullet>","job":"<role>","action":"<add|replace>","replaces":"<or null>"}
  ],
  "nextAction": "<specific single next step>",
  "resumeRecommendation": {
    "version": "<best matching resume version label from user's saved versions, or null if none exist>",
    "reason": "<one sentence explaining the match. If no versions exist, suggest the user visit the Resume tab to generate positioning angles.>"
  },
  "estimatedCompRange": "<$X - $Y or null. Estimate compensation range based only on signals in this JD: explicit salary mentions, company name and size, role seniority, location, and equity mentions. Do not use external benchmarks. Return null if insufficient signal.>",
  "perksFound": ["<perk found in JD>",...],
  "perksMatch": "<Good match|Missing preferred perks|null>",
  "compWarning": <null or "estimated comp below your target">,
  "roleDNA": {
    "function":"<the primary function of this role>",
    "domain":"<the industry or domain of this role>",
    "productType":"<the type of product, service, or work involved>",
    "customer":"<who this organization primarily serves>",
    "stage":"<organization stage or size e.g. startup, growth, enterprise, public>",
    "seniority":"<seniority level of this role e.g. Junior, Mid, Senior, Lead, Director>",
    "workMode":"<Remote|Hybrid|Onsite>",
    "coreSkills":["<skill>",...],
    "keywords":["<ats term>",...]
  }
}`;
}

describe.skipIf(!!skipReason)('Claude API Contract Test @contract', () => {
  let result;

  beforeAll(async () => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{ role: 'user', content: buildAnalyzePrompt() }],
      }),
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    result = JSON.parse(text.replace(/```json|```/g, '').trim());
  }, 30000);

  // ── Top-level fields ──────────────────────────────────────────────────

  it('returns fitScore as number 0-100', () => {
    expect(typeof result.fitScore).toBe('number');
    expect(result.fitScore).toBeGreaterThanOrEqual(0);
    expect(result.fitScore).toBeLessThanOrEqual(100);
  });

  it('returns matchScore as number or null', () => {
    expect(result.matchScore === null || typeof result.matchScore === 'number').toBe(true);
  });

  it('returns verdict as valid enum', () => {
    expect(['Apply Now', 'Apply with Tailoring', 'Long Shot', 'Skip']).toContain(result.verdict);
  });

  it('returns verdictReason as non-empty string', () => {
    expect(typeof result.verdictReason).toBe('string');
    expect(result.verdictReason.length).toBeGreaterThan(0);
  });

  it('returns strengths as array of strings', () => {
    expect(Array.isArray(result.strengths)).toBe(true);
    expect(result.strengths.length).toBeGreaterThanOrEqual(1);
    result.strengths.forEach(s => expect(typeof s).toBe('string'));
  });

  it('returns gaps as array of strings', () => {
    expect(Array.isArray(result.gaps)).toBe(true);
    result.gaps.forEach(g => expect(typeof g).toBe('string'));
  });

  // ── Transferability ────────────────────────────────────────────────────

  it('returns transferability.score as number 0-100', () => {
    expect(typeof result.transferability).toBe('object');
    expect(typeof result.transferability.score).toBe('number');
    expect(result.transferability.score).toBeGreaterThanOrEqual(0);
    expect(result.transferability.score).toBeLessThanOrEqual(100);
  });

  it('returns transferability.reason as string', () => {
    expect(typeof result.transferability.reason).toBe('string');
    expect(result.transferability.reason.length).toBeGreaterThan(0);
  });

  it('returns transferability.angle as string', () => {
    expect(typeof result.transferability.angle).toBe('string');
    expect(result.transferability.angle.length).toBeGreaterThan(0);
  });

  // ── ATS and resume tailoring ───────────────────────────────────────────

  it('returns atsKeywords as array of strings', () => {
    expect(Array.isArray(result.atsKeywords)).toBe(true);
    expect(result.atsKeywords.length).toBeGreaterThanOrEqual(1);
  });

  it('returns tailoredSummary as non-empty string', () => {
    expect(typeof result.tailoredSummary).toBe('string');
    expect(result.tailoredSummary.length).toBeGreaterThan(10);
  });

  it('returns tailoredBullets as array of objects with correct shape', () => {
    expect(Array.isArray(result.tailoredBullets)).toBe(true);
    expect(result.tailoredBullets.length).toBeGreaterThanOrEqual(1);
    const bullet = result.tailoredBullets[0];
    expect(typeof bullet.bullet).toBe('string');
    expect(typeof bullet.job).toBe('string');
    expect(['add', 'replace']).toContain(bullet.action);
  });

  it('returns nextAction as string', () => {
    expect(typeof result.nextAction).toBe('string');
    expect(result.nextAction.length).toBeGreaterThan(0);
  });

  // ── Resume recommendation ─────────────────────────────────────────────

  it('returns resumeRecommendation with version and reason', () => {
    expect(typeof result.resumeRecommendation).toBe('object');
    expect(result.resumeRecommendation.version === null || typeof result.resumeRecommendation.version === 'string').toBe(true);
    expect(typeof result.resumeRecommendation.reason).toBe('string');
  });

  // ── Comp and perks ─────────────────────────────────────────────────────

  it('returns estimatedCompRange as string or null', () => {
    expect(result.estimatedCompRange === null || typeof result.estimatedCompRange === 'string').toBe(true);
    // JD mentions $180K-$220K so we expect a non-null range
    if (result.estimatedCompRange) {
      expect(result.estimatedCompRange).toMatch(/\$/);
    }
  });

  it('returns perksFound as array', () => {
    expect(Array.isArray(result.perksFound)).toBe(true);
    // JD mentions equity, remote, PTO, 401k — expect at least one found
    expect(result.perksFound.length).toBeGreaterThanOrEqual(1);
  });

  it('returns perksMatch as string or null', () => {
    expect(result.perksMatch === null || typeof result.perksMatch === 'string').toBe(true);
  });

  it('returns compWarning as string or null', () => {
    expect(result.compWarning === null || typeof result.compWarning === 'string').toBe(true);
  });

  // ── roleDNA ────────────────────────────────────────────────────────────

  it('returns roleDNA with all expected fields', () => {
    expect(typeof result.roleDNA).toBe('object');
    const dna = result.roleDNA;
    expect(typeof dna.function).toBe('string');
    expect(typeof dna.domain).toBe('string');
    expect(typeof dna.productType).toBe('string');
    expect(typeof dna.customer).toBe('string');
    expect(typeof dna.stage).toBe('string');
    expect(typeof dna.seniority).toBe('string');
    expect(typeof dna.workMode).toBe('string');
    expect(Array.isArray(dna.coreSkills)).toBe(true);
    expect(Array.isArray(dna.keywords)).toBe(true);
  });

  it('returns roleDNA.workMode as valid enum', () => {
    expect(['Remote', 'Hybrid', 'Onsite']).toContain(result.roleDNA.workMode);
  });

  it('returns roleDNA.coreSkills as non-empty array', () => {
    expect(result.roleDNA.coreSkills.length).toBeGreaterThanOrEqual(1);
    result.roleDNA.coreSkills.forEach(s => expect(typeof s).toBe('string'));
  });
});
