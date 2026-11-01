import { versions } from '../php-wasm/php';

// Tutorial coverage follows the versions shipped by PHP Playground.
export const tutorialVersions = versions;
export type TutorialVersion = (typeof tutorialVersions)[number];
// Advance only after the curriculum and bundled runtime have been verified.
export const latestTutorialVersion: TutorialVersion = '8.5';
export function isTutorialVersion(value: string): value is TutorialVersion {
	return tutorialVersions.some((version) => version === value);
}
