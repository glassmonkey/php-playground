import {expect, test} from '@playwright/test';
import {versions} from "../src/php-wasm/php";

const PAGE = 'http://127.0.0.1:18888';
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

  test('default URL', async ({ page }) => {
    expect(page.url()).toBe('http://127.0.0.1:18888/?c=DwfgDgFmBQD0sAICmAPAhgWzAGyQgxgPYAmS0kYAlgHYBmhAFAJQDcQA&v=8.3&f=html')
  })

  test('switch preview', async ({ page }) => {
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

test.describe('select version', () => {
  // ref: https://github.com/microsoft/playwright/issues/7036
  versions.forEach((v) => {
    test.describe(`select version v=${v}`, () => {
      test.beforeEach(async ({page}) => {
        await page.goto(PAGE);
      })
      test(`running php info`, async ({page}) => {
        const input = page.locator('#select-input-php')
        await input.fill(v)
        await page.keyboard.down("Tab");

        // html preview
        await page.getByTestId('checkbox-format').check()
        await expect(await page.getByTestId('preview-html').getAttribute('srcdoc')).toContain(`PHP Version ${v}`)
        expect(page.url()).toContain(`v=${v}`)
      })
      test(`compute php code(1+1)`, async ({page}) => {
        // select version
        const input = page.locator('#select-input-php')
        await input.fill(v)
        await page.keyboard.down("Tab");

        const editor = page.getByRole('code')
        // focus editor
        await editor.click()
        // delete all
        while (await page.getByRole('presentation').textContent() !== '') {
          await page.keyboard.press("Backspace")
        }
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('')
        // try 1+1
        await page.keyboard.type('<? echo 1+1;')
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<? echo 1+1;')
        // run and result is 2
        await page.getByTestId('checkbox-format').uncheck()
        await expect(await page.getByTestId('preview-console')).toHaveText('2')
      })
    })
  })
})



