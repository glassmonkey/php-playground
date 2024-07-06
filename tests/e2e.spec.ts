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
  test('default code is `phpinfo()`', async ({ page }) => {
    await expect(page.getByRole('code')).toContainText('phpinfo();')
  })
  test('default preview is PHP 8.3', async ({ page }) => {
    // html preview
    await page.getByTestId('checkbox-format').check()
    await expect(await page.getByTestId('preview-html').getAttribute('srcdoc')).toContain('PHP Version 8.3')
    await expect(await page.getByTestId('preview-console')).not.toBeVisible()

    // console pvreview
    await page.getByTestId('checkbox-format').uncheck()
    await expect(await page.getByTestId('preview-console')).toContainText('PHP Version 8.3')
    await expect(await page.getByTestId('preview-html')).not.toBeVisible()
  })
})
