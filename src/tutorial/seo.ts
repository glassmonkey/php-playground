import type { Lesson } from './types';
import type { TutorialVersion } from './config';

export const SITE_ORIGIN = 'https://php-play.dev';

export interface TutorialMetadata {
	title: string;
	description: string;
	canonicalPath: string;
	canonicalUrl: string;
	imageUrl: string;
	imageAlt: string;
}

export function getTutorialMetadata(
	version: TutorialVersion,
	lesson?: Lesson
): TutorialMetadata {
	const canonicalPath = lesson
		? `/tutorial/${version}/${lesson.slug}/`
		: `/tutorial/${version}/`;
	return {
		title: lesson
			? `${lesson.title} · PHP ${version} Tutorial`
			: `PHP ${version} Tutorial · PHP Playground`,
		description: lesson
			? `${lesson.summary} Learn PHP ${version} in the interactive PHP Playground.`
			: `Learn PHP ${version} with interactive examples and experiments in the PHP Playground.`,
		canonicalPath,
		canonicalUrl: new URL(canonicalPath, SITE_ORIGIN).toString(),
		imageUrl: new URL(`${canonicalPath}og.png`, SITE_ORIGIN).toString(),
		imageAlt: lesson
			? `PHP ${version} tutorial: ${lesson.title}`
			: `PHP ${version} beginner tutorial`,
	};
}

export function getHomeMetadata(): TutorialMetadata {
	const canonicalPath = '/';
	return {
		title: 'PHP Playground',
		description:
			'Run PHP code online in a fast, browser-based WebAssembly playground.',
		canonicalPath,
		canonicalUrl: new URL(canonicalPath, SITE_ORIGIN).toString(),
		imageUrl: new URL('/ogp.png', SITE_ORIGIN).toString(),
		imageAlt: 'PHP Playground online code editor',
	};
}
