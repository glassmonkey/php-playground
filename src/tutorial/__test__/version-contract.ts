import type { TutorialVersion } from '../config';

export interface VersionExpectation {
	features: readonly ('enums' | 'property-hooks')[];
	conditionals: 'if-elseif' | 'match';
	division: 'quotient' | 'integer';
	lessons: readonly string[];
	requestFailureFlag: 1 | 2;
}

const foundation = [
	'output',
	'variables',
	'types',
	'constants',
	'arrays',
	'operators',
	'expressions',
	'conditionals',
	'loops',
	'string-functions',
	'functions',
	'format-full-name',
	'classes',
];
const legacy = [...foundation, 'errors'];
const enumLessons = [...foundation, 'enums', 'errors'];
const hookLessons = [...foundation, 'enums', 'property-hooks', 'errors'];

// Test-owned expectations, not calculated from the curriculum resolver.
// Adding a supported runtime requires an explicit review of this contract.
export const versionContract = {
	'5.6': {
		features: [],
		conditionals: 'if-elseif',
		division: 'quotient',
		lessons: legacy,
		requestFailureFlag: 1,
	},
	'7.0': {
		features: [],
		conditionals: 'if-elseif',
		division: 'integer',
		lessons: legacy,
		requestFailureFlag: 1,
	},
	'7.1': {
		features: [],
		conditionals: 'if-elseif',
		division: 'integer',
		lessons: legacy,
		requestFailureFlag: 1,
	},
	'7.2': {
		features: [],
		conditionals: 'if-elseif',
		division: 'integer',
		lessons: legacy,
		requestFailureFlag: 1,
	},
	'7.3': {
		features: [],
		conditionals: 'if-elseif',
		division: 'integer',
		lessons: legacy,
		requestFailureFlag: 1,
	},
	'7.4': {
		features: [],
		conditionals: 'if-elseif',
		division: 'integer',
		lessons: legacy,
		requestFailureFlag: 1,
	},
	'8.0': {
		features: [],
		conditionals: 'match',
		division: 'integer',
		lessons: legacy,
		requestFailureFlag: 2,
	},
	'8.1': {
		features: ['enums'],
		conditionals: 'match',
		division: 'integer',
		lessons: enumLessons,
		requestFailureFlag: 2,
	},
	'8.2': {
		features: ['enums'],
		conditionals: 'match',
		division: 'integer',
		lessons: enumLessons,
		requestFailureFlag: 2,
	},
	'8.3': {
		features: ['enums'],
		conditionals: 'match',
		division: 'integer',
		lessons: enumLessons,
		requestFailureFlag: 2,
	},
	'8.4': {
		features: ['enums', 'property-hooks'],
		conditionals: 'match',
		division: 'integer',
		lessons: hookLessons,
		requestFailureFlag: 2,
	},
	'8.5': {
		features: ['enums', 'property-hooks'],
		conditionals: 'match',
		division: 'integer',
		lessons: hookLessons,
		requestFailureFlag: 2,
	},
} satisfies Record<TutorialVersion, VersionExpectation>;

export const versionCases = Object.entries(versionContract) as [
	TutorialVersion,
	VersionExpectation,
][];
