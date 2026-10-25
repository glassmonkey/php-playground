import {expect, test, type Page} from '@playwright/test';
import lzString from 'lz-string';
import {versions, defaultVersion} from "../src/php-wasm/php";

const PAGE = (process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8888').replace(/\/$/, '');
const versionPattern = (v: string) => new RegExp(`PHP Version ${v.replace('.', '\\.')}`);

type ThemeMode = 'light' | 'dark';

type HtmlPreviewState = {
  surfaceBackgroundColor: string;
  doctype: string | null;
  compatMode: string;
  htmlBackgroundColor: string;
  bodyBackgroundColor: string;
  bodyColor: string;
  title: string;
  bodyText: string | null;
  commentText: string | null;
  textareaValue: string | null;
};

type PreviewRequest = {
  url: string;
  source: 'parent' | 'preview' | 'unknown';
};

const imageResourceURL = 'https://preview-resources.invalid/parser-side-effect-image.png';
const iframeResourceURL = 'https://preview-resources.invalid/parser-side-effect-frame.html';
const plainHtml = '<!doctype html><html><head><title>theme preview</title></head><body><p id="body-probe">theme preview</p></body></html>';
const customCssHtml = '<!doctype html><html><head><title>custom colors</title><style>body { background: rgb(12, 34, 56); color: rgb(210, 220, 230); }</style></head><body><p id="body-probe">custom CSS preview</p></body></html>';
const parserAndResourceHtml = `<!doctype html><html><head><title>title marker __HTML_PREVIEW_COLOR_MODE__ &lt;head&gt;literal&lt;/head&gt;</title></head><body><p id="body-probe">body marker __HTML_PREVIEW_COLOR_MODE__ data-php-playground-preview-theme &lt;head&gt;literal&lt;/head&gt;</p><div id="comment-probe"><!-- comment marker __HTML_PREVIEW_COLOR_MODE__ data-php-playground-preview-theme <head>literal</head> --></div><textarea id="textarea-probe">textarea marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head></textarea><img src="${imageResourceURL}" onload="window.__previewEventHandlerRan = true" onerror="window.__previewEventHandlerRan = true"><iframe src="${iframeResourceURL}"></iframe><script>window.__previewScriptRan = true;</script></body></html>`;
const rawConsoleOutput = '  raw console <output> & text\n';

const htmlPreviewVariations: {
  name: string;
  output: string;
  theme: ThemeMode;
  want: HtmlPreviewState;
  observeParserEffects?: boolean;
}[] = [
  {
    name: 'uses the light palette for HTML preview',
    output: plainHtml,
    theme: 'light',
    want: {
      surfaceBackgroundColor: 'rgb(255, 255, 255)',
      doctype: 'html',
      compatMode: 'CSS1Compat',
      htmlBackgroundColor: 'rgba(0, 0, 0, 0)',
      bodyBackgroundColor: 'rgba(0, 0, 0, 0)',
      bodyColor: 'rgb(0, 0, 0)',
      title: 'theme preview',
      bodyText: 'theme preview',
      commentText: null,
      textareaValue: null,
    },
  },
  {
    name: 'uses the dark palette for HTML preview',
    output: plainHtml,
    theme: 'dark',
    want: {
      surfaceBackgroundColor: 'rgb(30, 30, 30)',
      doctype: 'html',
      compatMode: 'CSS1Compat',
      htmlBackgroundColor: 'rgb(30, 30, 30)',
      bodyBackgroundColor: 'rgba(0, 0, 0, 0)',
      bodyColor: 'rgb(212, 212, 212)',
      title: 'theme preview',
      bodyText: 'theme preview',
      commentText: null,
      textareaValue: null,
    },
  },
  {
    name: 'renders a doctype-free HTML fragment in dark mode',
    output: '<p id="body-probe">fragment preview</p>',
    theme: 'dark',
    want: {
      surfaceBackgroundColor: 'rgb(30, 30, 30)',
      doctype: null,
      compatMode: 'CSS1Compat',
      htmlBackgroundColor: 'rgb(30, 30, 30)',
      bodyBackgroundColor: 'rgba(0, 0, 0, 0)',
      bodyColor: 'rgb(212, 212, 212)',
      title: '',
      bodyText: 'fragment preview',
      commentText: null,
      textareaValue: null,
    },
  },
  {
    name: 'keeps user CSS colors while applying the dark palette',
    output: customCssHtml,
    theme: 'dark',
    want: {
      surfaceBackgroundColor: 'rgb(30, 30, 30)',
      doctype: 'html',
      compatMode: 'CSS1Compat',
      htmlBackgroundColor: 'rgb(30, 30, 30)',
      bodyBackgroundColor: 'rgb(12, 34, 56)',
      bodyColor: 'rgb(210, 220, 230)',
      title: 'custom colors',
      bodyText: 'custom CSS preview',
      commentText: null,
      textareaValue: null,
    },
  },
  {
    name: 'preserves parser markers and isolates parser resource requests',
    output: parserAndResourceHtml,
    theme: 'dark',
    observeParserEffects: true,
    want: {
      surfaceBackgroundColor: 'rgb(30, 30, 30)',
      doctype: 'html',
      compatMode: 'CSS1Compat',
      htmlBackgroundColor: 'rgb(30, 30, 30)',
      bodyBackgroundColor: 'rgba(0, 0, 0, 0)',
      bodyColor: 'rgb(212, 212, 212)',
      title: 'title marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head>',
      bodyText: 'body marker __HTML_PREVIEW_COLOR_MODE__ data-php-playground-preview-theme <head>literal</head>',
      commentText: ' comment marker __HTML_PREVIEW_COLOR_MODE__ data-php-playground-preview-theme <head>literal</head> ',
      textareaValue: 'textarea marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head>',
    },
  },
];

const consolePreviewVariations: {
  name: string;
  output?: string;
  theme: ThemeMode;
  wantText: string;
  exact: boolean;
}[] = [
  {
    name: 'keeps default PHP output in the light console preview',
    theme: 'light',
    wantText: `PHP Version ${defaultVersion}`,
    exact: false,
  },
  {
    name: 'keeps raw console output and the light palette',
    output: rawConsoleOutput,
    theme: 'light',
    wantText: rawConsoleOutput,
    exact: true,
  },
  {
    name: 'keeps raw console output and applies the dark palette',
    output: rawConsoleOutput,
    theme: 'dark',
    wantText: rawConsoleOutput,
    exact: true,
  },
];

async function openHtmlPreview(page: Page, output?: string) {
  await page.emulateMedia({colorScheme: 'light'});
  if (output === undefined) {
    await page.goto(PAGE);
  } else {
    const params = new URLSearchParams({
      c: lzString.compressToEncodedURIComponent(`<?php echo '${output}';`),
      f: 'html',
    });
    await page.goto(`${PAGE}/?${params}`);
  }
  await expect(page.getByTestId('preview-html')).toBeVisible();
}

async function setPreviewTheme(page: Page, theme: ThemeMode) {
  const themeSwitch = page.getByText('UI Theme:').locator('..').getByRole('checkbox');
  const shouldBeChecked = theme === 'light';
  if ((await themeSwitch.isChecked()) !== shouldBeChecked) {
    await themeSwitch.locator('..').click();
  }
  await expect(themeSwitch).toBeChecked({checked: shouldBeChecked});
}

async function setPreviewFormat(page: Page, format: 'html' | 'console') {
  const formatSwitch = page.getByTestId('checkbox-format');
  const shouldBeChecked = format === 'html';
  if ((await formatSwitch.isChecked()) !== shouldBeChecked) {
    if (shouldBeChecked) {
      await formatSwitch.check();
    } else {
      await formatSwitch.uncheck();
    }
  }
  await expect(formatSwitch).toBeChecked({checked: shouldBeChecked});
}

async function readHtmlPreview(page: Page): Promise<HtmlPreviewState> {
  const frame = page.getByTestId('preview-html');
  const surfaceBackgroundColor = await frame.evaluate((element: HTMLIFrameElement) =>
    getComputedStyle(element.parentElement as HTMLElement).backgroundColor
  );
  const documentState = await page
    .frameLocator('[data-testid="preview-html"]')
    .locator('html')
    .evaluate((html: HTMLHtmlElement) => {
      const document = html.ownerDocument;
      return {
        doctype: document.doctype?.name ?? null,
        compatMode: document.compatMode,
        htmlBackgroundColor: getComputedStyle(html).backgroundColor,
        bodyBackgroundColor: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color,
        title: document.title,
        bodyText: document.querySelector('#body-probe')?.textContent ?? null,
        commentText:
          document.querySelector('#comment-probe')?.firstChild?.textContent ?? null,
        textareaValue:
          (document.querySelector('#textarea-probe') as HTMLTextAreaElement | null)
            ?.value ?? null,
      };
    });
  return {surfaceBackgroundColor, ...documentState};
}

async function observeParserEffects(page: Page, requests: PreviewRequest[]) {
  await page.addInitScript(() => {
    const pageWindow = window as Window & {
      __previewScriptRan?: boolean;
      __previewEventHandlerRan?: boolean;
    };
    pageWindow.__previewScriptRan = false;
    pageWindow.__previewEventHandlerRan = false;
  });
  await page.route('https://preview-resources.invalid/**', async (route) => {
    let source: PreviewRequest['source'] = 'unknown';
    try {
      source = route.request().frame() === page.mainFrame() ? 'parent' : 'preview';
    } catch {
      // Keep requests without a known frame visible in the assertion.
    }
    requests.push({url: route.request().url(), source});
    if (route.request().url() === imageResourceURL) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><p>nested frame fixture</p>',
    });
  });
}

function summarizeParserRequests(requests: PreviewRequest[]) {
  return {
    parent: requests.filter(({source}) => source === 'parent').map(({url}) => url),
    unknown: requests.filter(({source}) => source === 'unknown').map(({url}) => url),
    previewImage: requests.filter(({url, source}) =>
      url === imageResourceURL && source === 'preview'
    ).length,
    previewIframe: requests.filter(({url, source}) =>
      url === iframeResourceURL && source === 'preview'
    ).length,
  };
}
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

  test.describe('switch preview', () => {
    test('defaults unsupported URL formats to the HTML preview', async ({page}) => {
      await page.emulateMedia({colorScheme: 'light'});
      // End the beforeEach page first so its warmed WASM request cannot satisfy this wait.
      await page.goto('about:blank');

      const targetURL = `${PAGE}/?f=unsupported`;
      const expectedWasmURL = new URL(`/php-${defaultVersion}.wasm`, PAGE);
      const wasmReady = page.context().waitForEvent('requestfinished', {
        predicate: request => {
          const requestURL = new URL(request.url());
          return requestURL.origin === expectedWasmURL.origin && requestURL.pathname === expectedWasmURL.pathname;
        },
        timeout: 30_000,
      }).then(async request => {
        const response = await request.response();
        expect(response, 'the default PHP WASM request must receive a response').not.toBeNull();
        expect(
          [200, 304],
          'the default PHP WASM request must complete from network or cache',
        ).toContain(response?.status());
      });
      const navigation = page.goto(targetURL);
      const formatAssertions = Promise.all([
        expect(page).toHaveURL(/[?&]f=html(?:&|$)/, {timeout: 5000}),
        expect(page.getByTestId('checkbox-format')).toBeChecked({timeout: 5000}),
      ]);

      void wasmReady.catch(() => undefined);
      void navigation.catch(() => undefined);
      void formatAssertions.catch(() => undefined);
      await Promise.all([wasmReady, navigation, formatAssertions]);

      await expect(page.getByTestId('preview-html')).toBeVisible({timeout: 5000});
      await expect(page.getByTestId('preview-console')).not.toBeVisible({timeout: 5000});
      await expect(
        page.frameLocator('[data-testid="preview-html"]').locator('body'),
      ).toContainText(versionPattern(defaultVersion), {timeout: 5000});
    });

    for (const variation of htmlPreviewVariations) {
      test(variation.name, async ({page}) => {
        const observedRequests: PreviewRequest[] = [];
        if (variation.observeParserEffects) {
          await observeParserEffects(page, observedRequests);
        }

        const initialImageRequest = variation.observeParserEffects
          ? page.waitForRequest(imageResourceURL)
          : undefined;
        const initialIframeRequest = variation.observeParserEffects
          ? page.waitForRequest(iframeResourceURL)
          : undefined;
        await openHtmlPreview(page, variation.output);

        let lightRequests: PreviewRequest[] = [];
        if (variation.observeParserEffects) {
          await Promise.all([initialImageRequest, initialIframeRequest]);
          await expect.poll(() => summarizeParserRequests(observedRequests)).toEqual({
            parent: [],
            unknown: [],
            previewImage: 1,
            previewIframe: 1,
          });
          lightRequests = observedRequests.splice(0);
        }

        await setPreviewTheme(page, variation.theme);
        await expect(page.getByTestId('preview-html')).toHaveAttribute('sandbox', '');
        await expect.poll(() => readHtmlPreview(page)).toEqual(variation.want);
        if (variation.theme === 'light') {
          await expect(page.getByTestId('preview-html')).toHaveAttribute('srcdoc', variation.output);
        }

        if (variation.observeParserEffects) {
          await expect.poll(async () => {
            const pageWindow = await page.evaluate(() => {
              const currentWindow = window as Window & {
                __previewScriptRan?: boolean;
                __previewEventHandlerRan?: boolean;
              };
              return {
                scriptRan: currentWindow.__previewScriptRan,
                eventHandlerRan: currentWindow.__previewEventHandlerRan,
              };
            });
            return {
              lightRequests: summarizeParserRequests(lightRequests),
              darkRequests: summarizeParserRequests(observedRequests),
              pageWindow,
            };
          }).toEqual({
            lightRequests: {
              parent: [],
              unknown: [],
              previewImage: 1,
              previewIframe: 1,
            },
            darkRequests: {
              parent: [],
              unknown: [],
              previewImage: 1,
              previewIframe: 1,
            },
            pageWindow: {scriptRan: false, eventHandlerRan: false},
          });
        }
      });
    }

    for (const variation of consolePreviewVariations) {
      test(variation.name, async ({page}) => {
        await openHtmlPreview(page, variation.output);
        await setPreviewTheme(page, variation.theme);
        await setPreviewFormat(page, 'console');

        const preview = page.getByTestId('preview-console');
        const output = await preview.textContent();
        if (variation.exact) {
          expect(output).toBe(variation.wantText);
        } else {
          expect(output).toContain(variation.wantText);
        }
        await expect(preview).toHaveCSS(
          'background-color',
          variation.theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(30, 30, 30)'
        );
        await expect(preview).toHaveCSS(
          'color',
          variation.theme === 'light' ? 'rgb(0, 0, 0)' : 'rgb(212, 212, 212)'
        );
        await expect(page.getByTestId('preview-html')).not.toBeVisible();
      });
    }

    test('round-trips the theme across HTML and console preview', async ({page}) => {
      await openHtmlPreview(page, plainHtml);
      await setPreviewTheme(page, 'light');
      await expect.poll(() => readHtmlPreview(page)).toEqual(htmlPreviewVariations[0].want);

      await setPreviewTheme(page, 'dark');
      await expect.poll(() => readHtmlPreview(page)).toEqual(htmlPreviewVariations[1].want);

      await setPreviewTheme(page, 'light');
      await expect.poll(() => readHtmlPreview(page)).toEqual(htmlPreviewVariations[0].want);
      await expect(page.getByTestId('preview-html')).toHaveAttribute('srcdoc', plainHtml);

      await setPreviewTheme(page, 'dark');
      await setPreviewFormat(page, 'console');
      const darkConsole = page.getByTestId('preview-console');
      await expect(darkConsole).toHaveCSS('background-color', 'rgb(30, 30, 30)');
      await expect(darkConsole).toHaveCSS('color', 'rgb(212, 212, 212)');
      expect(await darkConsole.textContent()).toBe(plainHtml);

      await setPreviewTheme(page, 'light');
      const lightConsole = page.getByTestId('preview-console');
      await expect(lightConsole).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(lightConsole).toHaveCSS('color', 'rgb(0, 0, 0)');
      expect(await lightConsole.textContent()).toBe(plainHtml);
    });
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
        await expect(page.getByTestId('preview-html')).toHaveAttribute('srcdoc', versionPattern(v))
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
