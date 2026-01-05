import {expect, test} from '@playwright/test';
import {versions, defaultVersion} from "../src/php-wasm/php";

const PAGE = 'http://127.0.0.1:8888';
test.describe('default page', () => {
  test.beforeEach(async ({page}) => {
    await page.goto(PAGE);
  })
  test('has title', async ({ page }) => {
    await expect(page).toHaveTitle('PHP Playground');
  });
  test('default version shows latest available', async ({ page }) => {
    await expect(page.getByText(defaultVersion)).toBeVisible()
  })
  test('default code is `phpinfo()`', async ({ page }) => {
    await expect(page.getByRole('code')).toContainText('phpinfo();')
  })

  test('default URL', async ({ page }) => {
    const defaultPage = `${PAGE}/?c=DwfgDgFmBQD0sAICmAPAhgWzAGyQgxgPYAmS0kYAlgHYBmhAFAJQDcQA&v=${defaultVersion}&f=html`
    await page.waitForURL(defaultPage)
    expect(page.url()).toContain(defaultPage)
  })

  test('switch preview', async ({ page }) => {
    // html preview
    await page.getByTestId('checkbox-format').check()
    await expect(await page.getByTestId('preview-html').getAttribute('srcdoc')).toContain(`PHP Version ${defaultVersion}`)
    await expect(await page.getByTestId('preview-console')).not.toBeVisible()

    // console pvreview
    await page.getByTestId('checkbox-format').uncheck()
    await expect(await page.getByTestId('preview-console')).toContainText(`PHP Version ${defaultVersion}`)
    await expect(await page.getByTestId('preview-html')).not.toBeVisible()
  })
})

test.describe('select version', () => {
  // Run different versions in parallel
  test.describe.configure({ mode: 'parallel' });

  // ref: https://github.com/microsoft/playwright/issues/7036
  versions.forEach((v) => {
    test.describe(`select version v=${v}`, () => {
      // Run tests serially within the same version
      test.describe.configure({ mode: 'serial' });

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
        await page.goto(`${PAGE}/?c=DwfgUEA`);
        // select version
        const input = page.locator('#select-input-php')
        await input.fill(v)
        await page.keyboard.down("Tab");

        const editor = page.getByRole('code')
        // focus editor
        await editor.click()
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<?')
        // try 1+1
        await page.keyboard.type(' echo(1+1);')
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<? echo(1+1);')
        // run and result is 2
        await page.getByTestId('checkbox-format').uncheck()
        await expect(await page.getByTestId('preview-console')).toHaveText('2')
      })

      test(`compute php code(1+1) with strict`, async ({page}) => {
        if (v < '7.0') {
          console.log("strict_types is not supported")
          return
        }
        await page.goto(`${PAGE}/?c=DwfgUEA`);
        // select version
        const input = page.locator('#select-input-php')
        await input.fill(v)
        await page.keyboard.down("Tab");

        const editor = page.getByRole('code')
        // focus editor
        await editor.click()
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<?')
        // try 1+1
        await page.keyboard.type(' declare(strict_types=1);echo(1+1);')
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<? declare(strict_types=1);echo(1+1);')
        // run and result is 2
        await page.getByTestId('checkbox-format').uncheck()
        await expect(await page.getByTestId('preview-console')).toHaveText('2')
      })
      test(`not compute text`, async ({page}) => {
        await page.goto(`${PAGE}/?c=DwQgtBYHxA`);
        // select version
        const input = page.locator('#select-input-php')
        await input.fill(v)
        await page.keyboard.down("Tab");

        const editor = page.getByRole('code')
        // focus editor
        await editor.click()
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<!---->')
        // try 1+1
        await page.keyboard.type('Hello, World')
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<!---->Hello, World')
        // run and result is 2
        await page.getByTestId('checkbox-format').uncheck()
        await expect(await page.getByTestId('preview-console')).toHaveText('<!---->Hello, World')
      })
      test(`include compute text`, async ({page}) => {
        await page.goto(`${PAGE}/?c=DwQgtBYHxA`); // <!---->
        // select version
        const input = page.locator('#select-input-php')
        await input.fill(v)
        await page.keyboard.down("Tab");

        const editor = page.getByRole('code')
        // focus editor
        await editor.click()
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<!---->')
        // try 1+1
        await page.keyboard.type('<body><?echo "x"."y"."z"?></body>')
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<!----><body><?echo "x"."y"."z"?></body>')
        // run and result is 2
        await page.getByTestId('checkbox-format').uncheck()
        await expect(await page.getByTestId('preview-console')).toHaveText('<!----><body>xyz</body>')
      })
      test(`infinite loop and comment out`, async ({page}) => {
        await page.goto(`${PAGE}/?c=DwfgUEA`); // <?
        // select version
        const input = page.locator('#select-input-php')
        await input.fill(v)
        await page.keyboard.down("Tab");

        // switch to console preview
        await page.getByTestId('checkbox-format').uncheck()

        const editor = page.getByRole('code')
        // focus editor
        await editor.click()
        // display code in editor
        await expect(page.getByRole('presentation')).toHaveText('<?')

        // Add newline first, then type infinite loop
        await page.keyboard.press('End')
        await page.keyboard.press('Enter')
        await page.keyboard.type('while(true){}')
        // Wait 500ms
        await page.waitForTimeout(500)
        // Check that loading spinner is visible
        await expect(page.getByTestId('loading-spinner')).toBeVisible()

        // Add new line with echo
        await page.keyboard.press('End')
        await page.keyboard.press('Enter')
        await page.keyboard.type("echo 1+1;")
        // Wait 500ms
        await page.waitForTimeout(500)
        // Check that loading spinner is still visible (blocked by infinite loop)
        await expect(page.getByTestId('loading-spinner')).toBeVisible()

        // Comment out the infinite loop - move to while line and add //
        await page.keyboard.press('ArrowUp')
        await page.keyboard.press('Home')
        await page.keyboard.type('//')

        // Wait for execution to complete and check result
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({timeout: 5000})
        await expect(page.getByTestId('preview-console')).toHaveText('2')
      })
    })
  })
})
