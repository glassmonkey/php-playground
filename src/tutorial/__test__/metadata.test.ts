import { expect, it } from 'vitest';
import { lessonsByVersion } from '../content';
import { getTutorialMetadata } from '../seo';
import { versionCases } from './version-contract';

it.each(versionCases)(
	'returns the complete fixed-index metadata for PHP %s',
	(version) => {
		expect(getTutorialMetadata(version)).toEqual({
			title: `PHP ${version} Tutorial · PHP Playground`,
			description: `Learn PHP ${version} with interactive examples and experiments in the PHP Playground.`,
			canonicalPath: `/tutorial/${version}/`,
			canonicalUrl: `https://php-play.dev/tutorial/${version}/`,
			imageUrl: `https://php-play.dev/tutorial/${version}/og.png`,
			imageAlt: `PHP ${version} beginner tutorial`,
		});
	}
);
it.each(versionCases)(
	'returns the complete article metadata for PHP %s',
	(version) => {
		const lesson = lessonsByVersion[version].find(
			(entry) => entry.slug === 'variables'
		)!;
		expect(getTutorialMetadata(version, lesson)).toEqual({
			title: `Store values in variables · PHP ${version} Tutorial`,
			description: `Assign and reassign variable values. Learn PHP ${version} in the interactive PHP Playground.`,
			canonicalPath: `/tutorial/${version}/variables/`,
			canonicalUrl: `https://php-play.dev/tutorial/${version}/variables/`,
			imageUrl: `https://php-play.dev/tutorial/${version}/variables/og.png`,
			imageAlt: `PHP ${version} tutorial: Store values in variables`,
		});
	}
);
