import fs from 'fs';
import path from 'path';

export async function setupStorage(page, fixtureName) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'localStorage', `${fixtureName}.json`);
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  await page.goto('/');
  await page.evaluate((storageData) => {
    localStorage.clear();
    Object.entries(storageData).forEach(([key, value]) => {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  }, data);
  await page.reload();
  await page.waitForLoadState('networkidle');
}
