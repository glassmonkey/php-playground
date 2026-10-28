import { expect, test } from '@playwright/test';
import lzString from 'lz-string';
import { readFileSync } from 'node:fs';
import { lessonsByVersion } from '../src/tutorial/content';
import { chapters } from '../src/tutorial/chapters';
import {
	latestTutorialVersion,
	tutorialVersions,
} from '../src/tutorial/config';

const PAGE = 'http://127.0.0.1:8888';
const experimentOutputBaseline = JSON.parse(
	readFileSync(
		'src/tutorial/authoring/fixtures/experiment-outputs.json',
		'utf8'
	)
) as {
	versions: Record<string, Record<string, Record<string, string>>>;
};
const output = (page: import('@playwright/test').Page) =>
	page.getByTestId('tutorial-output');
const expectOutput = async (
	page: import('@playwright/test').Page,
	want: string
) => {
	await expect
		.poll(() =>
			output(page)
				.locator('pre')
				.evaluate((element) => element.textContent)
		)
		.toBe(want);
};
test.describe('versioned tutorial routes', () => {
	test('redirects the tutorial entry and latest alias to the configured latest version', async ({
		page,
	}) => {
		await page.goto(`${PAGE}/tutorial`);
		await expect(page).toHaveURL(
			new RegExp(`/tutorial/${latestTutorialVersion}/?$`)
		);
		await expect(
			page.getByRole('link', { name: 'PHP Playground', exact: true })
		).toBeVisible();

		const latestFirstLesson = lessonsByVersion[latestTutorialVersion][0];
		await page.goto(`${PAGE}/tutorial/latest/${latestFirstLesson.slug}`);
		await expect(page).toHaveURL(
			new RegExp(
				`/tutorial/${latestTutorialVersion}/${latestFirstLesson.slug}/?$`
			)
		);
		await expect(
			page.getByRole('heading', { name: latestFirstLesson.title })
		).toBeVisible();
	});

	test('orders the course from values through functions and objects, independently of reference categories', async ({
		page,
	}) => {
		const version = '8.5';
		const expectedGroups = [
			{ id: 'getting-started', slugs: ['output'] },
			{
				id: 'working-with-values',
				slugs: ['variables', 'types', 'constants', 'arrays'],
			},
			{ id: 'calculations', slugs: ['operators', 'expressions'] },
			{ id: 'decisions-and-loops', slugs: ['conditionals', 'loops'] },
			{
				id: 'using-functions',
				slugs: ['string-functions', 'functions', 'format-full-name'],
			},
			{
				id: 'objects-and-state',
				slugs: ['classes', 'enums', 'property-hooks'],
			},
			{ id: 'handling-failures', slugs: ['errors'] },
		];
		await page.goto(`${PAGE}/tutorial/${version}`);
		await expect(page.locator('.tutorial-chapter')).toHaveCount(7);
		const wantLinks = expectedGroups.flatMap((group) =>
			group.slugs.map((slug) => `/tutorial/${version}/${slug}/`)
		);
		const indexLinks = await page
			.locator('.tutorial-chapter .tutorial-lessons a')
			.evaluateAll((links) =>
				links.map((link) => link.getAttribute('href'))
			);
		expect(indexLinks).toEqual(wantLinks);
		for (const group of expectedGroups) {
			const links = page.locator(
				`#chapter-${group.id} .tutorial-lessons a`
			);
			expect(
				await links.evaluateAll((items) =>
					items.map((link) => link.getAttribute('href'))
				)
			).toEqual(
				group.slugs.map((slug) => `/tutorial/${version}/${slug}/`)
			);
		}
		await page.goto(`${PAGE}/tutorial/${version}/variables/`);
		const syllabus = page.getByRole('navigation', {
			name: 'Course contents',
		});
		expect(
			await syllabus
				.locator('a')
				.evaluateAll((links) =>
					links.map((link) => link.getAttribute('href'))
				)
		).toEqual(wantLinks);
		await expect(
			syllabus.locator('a[aria-current="page"]')
		).toHaveAttribute('href', '/tutorial/8.5/variables/');
		await expect(
			page.getByRole('link', { name: /Inspect PHP value types/ }).last()
		).toHaveAttribute('href', '/tutorial/8.5/types/');
	});

	test('keeps each supported version addressable', async ({ page }) => {
		for (const version of tutorialVersions) {
			const firstLesson = lessonsByVersion[version][0];
			await page.goto(`${PAGE}/tutorial/${version}/${firstLesson.slug}`);
			await expect(page).toHaveURL(
				new RegExp(`/tutorial/${version}/${firstLesson.slug}/?$`)
			);
			await expect(page.getByLabel('Learn with')).toHaveValue(version);
		}
	});

	test('shows a breadcrumb from Playground through version to the lesson', async ({
		page,
	}) => {
		const version = latestTutorialVersion;
		const lesson = lessonsByVersion[version][0];
		await page.goto(`${PAGE}/tutorial/${version}/${lesson.slug}`);
		const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });

		await expect(
			page.getByRole('link', { name: 'PHP Playground', exact: true })
		).toHaveAttribute('href', '/');
		await expect(
			breadcrumb.getByRole('link', { name: 'Tutorial' })
		).toHaveAttribute('href', '/tutorial/');
		await expect(
			breadcrumb.getByRole('link', { name: `PHP ${version}` })
		).toHaveAttribute('href', `/tutorial/${version}/`);
		const chapter = chapters.find((item) => item.id === lesson.chapterId)!;
		await expect(
			breadcrumb.getByRole('link', { name: chapter.title })
		).toHaveAttribute(
			'href',
			`/tutorial/${version}/#chapter-${chapter.id}`
		);
		await expect(
			breadcrumb.locator('li[aria-current="page"]').last()
		).toHaveText(lesson.title);
	});

	test('switches versions and falls back when a lesson is unavailable', async ({
		page,
	}) => {
		await page.goto(`${PAGE}/tutorial/8.4/property-hooks`);
		await page.getByLabel('Learn with').selectOption('8.5');
		await expect(page).toHaveURL(/\/tutorial\/8\.5\/property-hooks\/?$/);
		await expect(
			page.getByRole('heading', {
				name: 'Property hooks: computed properties',
			})
		).toBeVisible();

		await page.getByLabel('Learn with').selectOption('8.3');
		await expect(page).toHaveURL(/\/tutorial\/8\.3\/?$/);
		await expect(
			page.getByRole('heading', { name: 'Your learning path' })
		).toBeVisible();
		await expect(
			page
				.locator(
					`a[href="/tutorial/8.3/${lessonsByVersion['8.3'][0].slug}/"]`
				)
				.first()
		).toBeVisible();
	});

	test('hides unsupported features at their version boundaries', async ({
		page,
	}) => {
		for (const [version, enumCount, hookCount] of [
			['5.6', 0, 0],
			['7.4', 0, 0],
			['8.0', 0, 0],
			['8.1', 1, 0],
			['8.3', 1, 0],
			['8.4', 1, 1],
		] as const) {
			await page.goto(`${PAGE}/tutorial/${version}/`);
			await expect(
				page.locator(`.tutorial-lessons a[href$="/enums/"]`)
			).toHaveCount(enumCount);
			await expect(
				page.locator(`.tutorial-lessons a[href$="/property-hooks/"]`)
			).toHaveCount(hookCount);
		}
		await page.goto(`${PAGE}/tutorial/8.0/enums/`);
		await expect(
			page.getByRole('heading', { name: 'Lesson not found' })
		).toBeVisible();
		await page.goto(`${PAGE}/tutorial/8.3/property-hooks/`);
		await expect(
			page.getByRole('heading', { name: 'Lesson not found' })
		).toBeVisible();
	});
	test('uses legacy conditionals before PHP 8 and runs PHP 5.6 only on request', async ({
		page,
	}) => {
		for (const version of ['5.6', '7.0', '7.1', '7.2', '7.3', '7.4']) {
			await page.goto(`${PAGE}/tutorial/${version}/conditionals/`);
			expect(await page.getByLabel('Edit code').inputValue()).not.toMatch(
				/\bmatch\s*\(/
			);
			await expect(output(page)).toContainText(
				'Press Run to see your output here.'
			);
		}
		await page.goto(`${PAGE}/tutorial/5.6/conditionals/`);
		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expectOutput(page, 'Cool\nWeekend');
	});

	test('shows useful pages for an unsupported version and an unknown lesson', async ({
		page,
	}) => {
		await page.goto(`${PAGE}/tutorial/9.9/output`);
		await expect(
			page.getByRole('heading', {
				name: 'No lessons for this version yet',
			})
		).toBeVisible();

		await page.goto(`${PAGE}/tutorial/8.5/not-a-lesson`);
		await expect(
			page.getByRole('heading', { name: 'Lesson not found' })
		).toBeVisible();
		await expect(
			page.getByRole('link', { name: /PHP 8\.5 lesson index/i })
		).toBeVisible();

		await page.goto(`${PAGE}/tutorial/8.5/not-a-lesson/extra`);
		await expect(
			page.getByRole('heading', { name: 'Lesson not found' })
		).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'Browse the tutorial' })
		).toBeVisible();
	});
});

test.describe('lesson drafts and execution', () => {
	test('persists a draft across reloads and isolates drafts by PHP version', async ({
		page,
	}) => {
		const editor = page.getByLabel('Edit code');

		const draftSlug = lessonsByVersion['8.3'][0].slug;
		await page.goto(`${PAGE}/tutorial/8.3/${draftSlug}`);
		await editor.fill("echo 'draft for 8.3';");
		await page.reload();
		await expect(editor).toHaveValue("echo 'draft for 8.3';");

		await page.goto(
			`${PAGE}/tutorial/8.4/${lessonsByVersion['8.4'][0].slug}`
		);
		await expect(editor).toHaveValue(
			lessonsByVersion['8.4'][0].programs[
				lessonsByVersion['8.4'][0].sampleProgramId
			].code
		);
		await editor.fill("echo 'draft for 8.4';");
		await page.reload();
		await expect(editor).toHaveValue("echo 'draft for 8.4';");

		await page.goto(`${PAGE}/tutorial/8.3/${draftSlug}`);
		await expect(editor).toHaveValue("echo 'draft for 8.3';");
	});

	test('toggles and persists the shared theme control, with plain PHP version labels', async ({
		page,
	}) => {
		test.setTimeout(60_000);
		const lesson = lessonsByVersion['8.5'][0];
		await page.emulateMedia({ colorScheme: 'light' });
		await page.goto(`${PAGE}/tutorial/8.5/${lesson.slug}`);
		const modeSwitch = page.getByRole('checkbox', { name: 'Light mode' });
		const tutorialVersionSelect = page.getByLabel('Learn with');
		const hasDarkTheme = () =>
			page
				.locator('.tutorial')
				.evaluate(
					(element) => element.closest('.chakra-ui-dark') !== null
				);

		await expect(modeSwitch).toBeChecked();
		await expect(tutorialVersionSelect.locator('option')).toHaveText([
			'PHP 8.5',
			'PHP 8.4',
			'PHP 8.3',
			'PHP 8.2',
			'PHP 8.1',
			'PHP 8.0',
			'PHP 7.4',
			'PHP 7.3',
			'PHP 7.2',
			'PHP 7.1',
			'PHP 7.0',
			'PHP 5.6',
		]);

		await modeSwitch.focus();
		await modeSwitch.press('Space');
		await expect(modeSwitch).not.toBeChecked();
		expect(await hasDarkTheme()).toBe(true);

		await page.reload();
		await expect(modeSwitch).not.toBeChecked();
		expect(await hasDarkTheme()).toBe(true);

		await modeSwitch.focus();
		await modeSwitch.press('Space');
		await expect(modeSwitch).toBeChecked();
		expect(await hasDarkTheme()).toBe(false);
		await page.reload();
		await expect(modeSwitch).toBeChecked();
		expect(await hasDarkTheme()).toBe(false);
	});

	test('resets to the sample and shares the current draft with its PHP version', async ({
		page,
	}) => {
		const lesson = lessonsByVersion['8.5'][0];
		await page.goto(`${PAGE}/tutorial/8.5/${lesson.slug}`);
		const editor = page.getByLabel('Edit code');
		const playgroundLink = page.getByRole('link', {
			name: 'Open in Playground ↗',
		});

		await editor.fill("<?php\necho 'Shared draft';");
		const handoffURL = new URL(
			(await playgroundLink.getAttribute('href'))!,
			PAGE
		);
		expect(handoffURL.searchParams.get('v')).toBe('8.5');
		expect(handoffURL.searchParams.get('f')).toBe('console');
		expect(
			lzString.decompressFromEncodedURIComponent(
				handoffURL.searchParams.get('c') ?? ''
			)
		).toBe("<?php\necho 'Shared draft';");

		await page.getByRole('button', { name: 'Reset' }).click();
		await expect(editor).toHaveValue(
			lesson.programs[lesson.sampleProgramId].code
		);
	});

	test('runs a self-contained Example without unused input or a handoff prelude', async ({
		page,
	}) => {
		const lesson = lessonsByVersion['8.5'].find(
			(item) => item.slug === 'format-full-name'
		)!;
		const sample = lesson.programs[lesson.sampleProgramId];
		expect(sample.input).toBeUndefined();
		await page.goto(`${PAGE}/tutorial/8.5/${lesson.slug}`);
		await expect(page.getByLabel('Edit code')).toHaveValue(sample.code);
		await expect(page.getByText('Run input', { exact: true })).toHaveCount(
			0
		);
		const handoff = new URL(
			(await page
				.getByRole('link', { name: 'Open in Playground ↗' })
				.getAttribute('href'))!,
			PAGE
		);
		expect(handoff.searchParams.get('v')).toBe('8.5');
		expect(handoff.searchParams.get('f')).toBe('console');
		expect(
			lzString.decompressFromEncodedURIComponent(
				handoff.searchParams.get('c') ?? ''
			)
		).toBe(sample.code);
		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expectOutput(page, 'Ada Lovelace');
	});

	test('selects and edits experiment variants in one manual-run editor', async ({
		page,
	}) => {
		test.setTimeout(40_000);
		const lesson = lessonsByVersion['8.5'].find(
			(item) => item.slug === 'format-full-name'
		)!;
		await page.goto(`${PAGE}/tutorial/8.5/${lesson.slug}`);
		const editor = page.getByLabel('Edit code');
		const exampleSection = page.locator('#example');
		const experimentSection = page.locator('#experiment');
		const sample = exampleSection.getByRole('button', {
			name: 'Example',
			exact: true,
		});
		const [first, second] = lesson.experiments;
		const firstButton = experimentSection.getByRole('button', {
			name: `Try ${first.title}`,
		});
		const secondButton = experimentSection.getByRole('button', {
			name: `Try ${second.title}`,
		});
		const emptyOutput = 'Press Run to see your output here.';
		await expect(sample).toHaveAttribute('aria-pressed', 'true');
		await expect(editor).toHaveValue(
			lesson.programs[lesson.sampleProgramId].code
		);
		await expect(output(page).locator('pre')).toHaveText(emptyOutput);
		await expect(page.getByTestId('reference-output')).toHaveCount(0);
		await expect(
			page.getByText('Program output', { exact: true })
		).toHaveCount(0);
		await expect(
			experimentSection.getByRole('button', {
				name: 'Example',
				exact: true,
			})
		).toHaveCount(0);
		await expect(page.locator('textarea')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Run' })).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Check exercise' })
		).toHaveCount(0);
		await expect(page.getByTestId('exercise-feedback')).toHaveCount(0);

		await firstButton.click();
		await expect(firstButton).toHaveAttribute('aria-pressed', 'true');
		await expect(editor).toHaveValue(lesson.programs[first.programId].code);
		await expect(output(page).locator('pre')).toHaveText(emptyOutput);
		await expect(page.locator('.tutorial-run-input')).toHaveCount(0);
		const experimentHandoff = new URL(
			(await page
				.getByRole('link', { name: 'Open in Playground ↗' })
				.getAttribute('href'))!,
			PAGE
		);
		expect(experimentHandoff.searchParams.get('v')).toBe('8.5');
		expect(
			lzString.decompressFromEncodedURIComponent(
				experimentHandoff.searchParams.get('c') ?? ''
			)
		).toBe(lesson.programs[first.programId].code);
		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expectOutput(
			page,
			experimentOutputBaseline.versions['8.5'][lesson.slug][first.id]
		);

		await editor.fill("<?php\necho 'First variant draft';");
		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expectOutput(page, 'First variant draft');
		await page.reload();
		await expect(editor).toHaveValue(
			lesson.programs[lesson.sampleProgramId].code
		);
		await firstButton.click();
		await expect(editor).toHaveValue("<?php\necho 'First variant draft';");
		await expect(output(page).locator('pre')).toHaveText(emptyOutput);

		await secondButton.click();
		await expect(editor).toHaveValue(
			lesson.programs[second.programId].code
		);
		await expect(output(page).locator('pre')).toHaveText(emptyOutput);
		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expectOutput(
			page,
			experimentOutputBaseline.versions['8.5'][lesson.slug][second.id]
		);
		await firstButton.click();
		await expect(editor).toHaveValue("<?php\necho 'First variant draft';");
		await expect(output(page).locator('pre')).toHaveText(emptyOutput);
		await sample.click();
		await expect(editor).toHaveValue(
			lesson.programs[lesson.sampleProgramId].code
		);
		await expect(output(page).locator('pre')).toHaveText(emptyOutput);
		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expectOutput(page, 'Ada Lovelace');
	});

	test('cancels active work when selecting another experiment or PHP version', async ({
		page,
	}) => {
		const version = '8.5';
		const lesson = lessonsByVersion[version].find(
			(item) => item.slug === 'format-full-name'
		)!;
		const experiment = lesson.experiments[0];
		await page.goto(`${PAGE}/tutorial/${version}/${lesson.slug}`);
		const editor = page.getByLabel('Edit code');
		const runButton = page.getByRole('button', { name: 'Run' });

		await editor.fill('<?php\nwhile (true) {}');
		await runButton.click();
		await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
		await page
			.getByRole('button', { name: `Try ${experiment.title}` })
			.click();
		await expect(editor).toHaveValue(
			lesson.programs[experiment.programId].code
		);
		await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
		await expect(output(page).locator('pre')).toHaveText(
			'Press Run to see your output here.'
		);

		await editor.fill('<?php\nwhile (true) {}');
		await runButton.click();
		await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
		await page.getByLabel('Learn with').selectOption('8.4');
		await expect(page).toHaveURL(/\/tutorial\/8\.4\/format-full-name\/?$/);
		await expect(editor).toHaveValue(
			lessonsByVersion['8.4'].find((item) => item.slug === lesson.slug)!
				.programs[
				lessonsByVersion['8.4'].find(
					(item) => item.slug === lesson.slug
				)!.sampleProgramId
			].code
		);
		await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
		await expect(output(page).locator('pre')).toHaveText(
			'Press Run to see your output here.'
		);
	});

	test('shows empty output, stops a failed run, then recovers with corrected code', async ({
		page,
	}) => {
		await page.goto(
			`${PAGE}/tutorial/8.5/${lessonsByVersion['8.5'][0].slug}`
		);
		const editor = page.getByLabel('Edit code');
		const runButton = page.getByRole('button', { name: 'Run' });

		await editor.fill('<?php\n$value = 1;');
		await runButton.click();
		await expectOutput(page, '(No output)');

		await editor.fill('<?php\nwhile (true) {}');
		await runButton.click();
		const stopButton = page.getByRole('button', { name: 'Stop' });
		await expect(stopButton).toBeVisible();
		await stopButton.click();
		await expect(page.getByRole('alert')).toHaveText('Execution stopped.');

		await editor.fill("<?php\necho 'Recovered';");
		await runButton.click();
		await expectOutput(page, 'Recovered');
		await expect(page.getByRole('alert')).toHaveCount(0);
	});

	test('shows a PHP parse error and runs corrected code afterward', async ({
		page,
	}) => {
		await page.goto(
			`${PAGE}/tutorial/8.5/${lessonsByVersion['8.5'][0].slug}`
		);
		const editor = page.getByLabel('Edit code');
		const runButton = page.getByRole('button', { name: 'Run' });

		await editor.fill('<?php\necho ;');
		await runButton.click();
		await expect(output(page)).toContainText(/Parse error|syntax error/i);

		await editor.fill("<?php\necho 'Recovered';");
		await runButton.click();
		await expectOutput(page, 'Recovered');
	});

	test('fits a narrow mobile viewport without horizontal page overflow', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(
			`${PAGE}/tutorial/8.5/${lessonsByVersion['8.5'][0].slug}`
		);
		await expect(page.getByLabel('Edit code')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run' })).toBeVisible();

		const pageWidths = await page.evaluate(() => ({
			viewport: document.documentElement.clientWidth,
			content: document.documentElement.scrollWidth,
		}));
		expect(pageWidths.content).toBeLessThanOrEqual(pageWidths.viewport);
	});

	test('uses the tutorial shell at desktop width without global about content or overflow', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		const lesson = lessonsByVersion[latestTutorialVersion][0];
		await page.goto(
			`${PAGE}/tutorial/${latestTutorialVersion}/${lesson.slug}`
		);

		const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
		await expect(
			page.getByRole('link', { name: 'PHP Playground', exact: true })
		).toBeVisible();
		await expect(
			breadcrumb.getByRole('link', { name: 'Tutorial' })
		).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'About PHP Playground?' })
		).toHaveCount(0);

		const workspaceColumns = await page
			.locator('.tutorial-lesson-layout')
			.evaluate(
				(element) =>
					getComputedStyle(element)
						.gridTemplateColumns.split(' ')
						.filter(Boolean).length
			);
		expect(workspaceColumns).toBe(3);

		const pageWidths = await page.evaluate(() => ({
			viewport: document.documentElement.clientWidth,
			content: document.documentElement.scrollWidth,
		}));
		expect(pageWidths.content).toBeLessThanOrEqual(pageWidths.viewport);
	});
});
