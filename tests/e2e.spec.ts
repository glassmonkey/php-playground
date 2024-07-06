import { test, expect} from '@playwright/test';

const PAGE = 'http://localhost:18888';
test.describe('default page', () => {
  test.beforeEach(async ({page}) => {
    await page.goto(PAGE);
  })
  test('has title', async ({ page }) => {
    await expect(page).toHaveTitle('PHP Playground');

  });
  test('default version is 8.3', async ({ page }) => {
    await expect(page.getByText('8.3')).toBeVisible()
  })
})
