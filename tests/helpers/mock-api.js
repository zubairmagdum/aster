import fs from 'fs';
import path from 'path';

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'api-responses', `${name}.json`), 'utf-8'));
}

export async function mockAllApiRoutes(page, overrides = {}) {
  const fixtures = {
    extractJd: overrides.extractJd || loadFixture('extract-jd-success'),
    analyze: overrides.analyze || loadFixture('analyze-success'),
    inferPrefs: overrides.inferPrefs || loadFixture('infer-prefs-success'),
    contactStrategy: overrides.contactStrategy || loadFixture('contact-strategy'),
    outreachMessages: overrides.outreachMessages || loadFixture('outreach-messages'),
    nextActions: overrides.nextActions || loadFixture('next-actions'),
    strategyBrief: overrides.strategyBrief || loadFixture('strategy-brief'),
    resumeVersions: overrides.resumeVersions || loadFixture('resume-versions'),
    resumeRecommend: overrides.resumeRecommend || loadFixture('resume-recommend'),
    interviewPrep: overrides.interviewPrep || loadFixture('interview-prep'),
    parseResume: overrides.parseResume || loadFixture('parse-resume-success'),
  };

  await page.route('**/api/claude', async (route, request) => {
    const body = JSON.parse(request.postData());
    const prompt = body.messages?.[0]?.content || '';

    let response;
    if (prompt.includes('Extract the company name')) response = fixtures.extractJd;
    else if (prompt.includes('expert recruiter')) response = fixtures.analyze;
    else if (prompt.includes('recruiting strategist')) response = fixtures.contactStrategy;
    else if (prompt.includes('high-converting professional outreach')) response = fixtures.outreachMessages;
    else if (prompt.includes('job search coach')) response = fixtures.nextActions;
    else if (prompt.includes('job search strategist')) response = fixtures.strategyBrief;
    else if (prompt.includes('senior career strategist')) response = fixtures.resumeVersions;
    else if (prompt.includes('which version')) response = fixtures.resumeRecommend;
    else if (prompt.includes('interview coach')) response = fixtures.interviewPrep;
    else response = {};

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(response) }] }),
    });
  });

  await page.route('**/api/parse-resume', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures.parseResume),
    });
  });

  await page.route('**/api/infer-prefs', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures.inferPrefs),
    });
  });
}
