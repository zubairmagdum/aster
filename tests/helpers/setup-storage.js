import fs from 'fs';
import path from 'path';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function computeRelativeDates(data) {
  if (!data.aster_jobs || !Array.isArray(data.aster_jobs)) return data;
  const dateMap = {
    job_1: daysAgo(7),
    job_2: daysAgo(5),
    job_3: daysAgo(3),
    job_4: daysAgo(12),
    job_5: daysAgo(14),
  };
  return {
    ...data,
    aster_jobs: data.aster_jobs.map(j => dateMap[j.id] ? { ...j, dateAdded: dateMap[j.id] } : j),
  };
}

export async function setupStorage(page, fixtureName) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'localStorage', `${fixtureName}.json`);
  let data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  // Compute relative dates for with-5-jobs fixture
  if (fixtureName === 'with-5-jobs') {
    data = computeRelativeDates(data);
  }

  await page.goto('/');
  await page.evaluate((storageData) => {
    localStorage.clear();
    Object.entries(storageData).forEach(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }, data);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}
