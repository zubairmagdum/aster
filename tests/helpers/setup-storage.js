import fs from 'fs';
import path from 'path';

export async function setupStorage(page, fixtureName) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'localStorage', `${fixtureName}.json`);
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  // Navigate to page first to establish the origin for localStorage
  await page.goto('/');
  // Inject localStorage data
  await page.evaluate((storageData) => {
    localStorage.clear();
    Object.entries(storageData).forEach(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }, data);
  // Reload to pick up the localStorage state
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}
