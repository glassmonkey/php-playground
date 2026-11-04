// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
	PlaygroundHeaderAd,
	TutorialIndexAd,
	TutorialLessonHeaderAd,
	TutorialArticleAd,
} from '../advertisements';

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	document
		.querySelectorAll('script[data-adsense-loader]')
		.forEach((node) => node.remove());
});

const placements = [
	{
		name: 'Playground header',
		Component: PlaygroundHeaderAd,
		slot: '1212533878',
		layout: null,
		format: null,
	},
	{
		name: 'Tutorial index',
		Component: TutorialIndexAd,
		slot: '8899452200',
		layout: null,
		format: null,
	},
	{
		name: 'Tutorial lesson header',
		Component: TutorialLessonHeaderAd,
		slot: '9386537367',
		layout: null,
		format: null,
	},
	{
		name: 'Tutorial article',
		Component: TutorialArticleAd,
		slot: '6923813529',
		layout: 'in-article',
		format: 'fluid',
	},
] as const;

it.each(placements)(
	'shows a local $name placeholder without requesting ads',
	({ Component }) => {
		// Arrange
		vi.stubEnv('PROD', false);
		// Act
		const sut = render(<Component />);
		const got = {
			placeholder: !!sut.container.querySelector(
				'.advertisement-placeholder'
			),
			ad: !!sut.container.querySelector('ins'),
			loader: !!document.querySelector('script[data-adsense-loader]'),
		};
		// Assert
		expect(got).toEqual({ placeholder: true, ad: false, loader: false });
	}
);

it.each(placements)(
	'uses the issued $name ad unit in production',
	({ Component, slot, layout, format }) => {
		// Arrange
		vi.stubEnv('PROD', true);
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				disconnect() {}
			}
		);
		// Act
		const sut = render(<Component />);
		const ad = sut.container.querySelector('ins')!;
		const got = {
			slot: ad.getAttribute('data-ad-slot'),
			client: ad.getAttribute('data-ad-client'),
			layout: ad.getAttribute('data-ad-layout'),
			format: ad.getAttribute('data-ad-format'),
			placeholder: !!sut.container.querySelector(
				'.advertisement-placeholder'
			),
		};
		// Assert
		expect(got).toEqual({
			slot,
			client: 'ca-pub-7840166449982456',
			layout,
			format,
			placeholder: false,
		});
	}
);

it('initializes production ads once per slot and shares the script across slots', () => {
	// Arrange
	vi.stubEnv('PROD', true);
	const callbacks: ResizeObserverCallback[] = [];
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(callback: ResizeObserverCallback) {
				callbacks.push(callback);
			}
			observe() {}
			disconnect() {}
		}
	);
	const push = vi.fn();
	vi.stubGlobal('adsbygoogle', { push });
	const sut = render(
		<>
			<TutorialArticleAd />
			<PlaygroundHeaderAd />
		</>
	);
	const article = sut.container.querySelector('ins')!;
	vi.spyOn(article, 'getBoundingClientRect').mockReturnValue({
		width: 400,
	} as DOMRect);
	const banner = sut.container.querySelectorAll('ins')[1];
	vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({
		width: 728,
	} as DOMRect);
	// Act: repeated notifications must not request either slot again.
	callbacks[0]([], {} as ResizeObserver);
	callbacks[0]([], {} as ResizeObserver);
	callbacks[1]([], {} as ResizeObserver);
	callbacks[1]([], {} as ResizeObserver);
	const got = {
		requests: push.mock.calls,
		loaders: document.querySelectorAll('script[data-adsense-loader]')
			.length,
		placeholder: !!sut.container.querySelector(
			'.advertisement-placeholder'
		),
	};
	// Assert
	expect(got).toEqual({
		requests: [[{}], [{}]],
		loaders: 1,
		placeholder: false,
	});
});
