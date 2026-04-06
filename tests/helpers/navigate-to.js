export async function navigateTo(page, viewName) {
  const navLabels = {
    dashboard: 'Dashboard',
    analyze: 'Analyze',
    pipeline: 'Pipeline',
    outreach: 'Outreach',
    strategy: 'Strategy',
    workshop: 'Resume',
  };
  const label = navLabels[viewName];
  if (!label) throw new Error(`Unknown view: ${viewName}`);
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(300);
}
