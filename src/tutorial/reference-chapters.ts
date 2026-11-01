// Editorial source taxonomy, independent of learner chapter order.
export const referenceChapters = [
	{
		id: 'basic-syntax',
		title: 'Basic syntax',
		referenceUrl: 'https://www.php.net/manual/en/language.basic-syntax.php',
	},
	{
		id: 'types',
		title: 'Types',
		referenceUrl: 'https://www.php.net/manual/en/language.types.php',
	},
	{
		id: 'variables',
		title: 'Variables',
		referenceUrl: 'https://www.php.net/manual/en/language.variables.php',
	},
	{
		id: 'constants',
		title: 'Constants',
		referenceUrl: 'https://www.php.net/manual/en/language.constants.php',
	},
	{
		id: 'expressions',
		title: 'Expressions',
		referenceUrl: 'https://www.php.net/manual/en/language.expressions.php',
	},
	{
		id: 'operators',
		title: 'Operators',
		referenceUrl: 'https://www.php.net/manual/en/language.operators.php',
	},
	{
		id: 'control-structures',
		title: 'Control Structures',
		referenceUrl:
			'https://www.php.net/manual/en/language.control-structures.php',
	},
	{
		id: 'functions',
		title: 'Functions',
		referenceUrl: 'https://www.php.net/manual/en/language.functions.php',
	},
	{
		id: 'classes-objects',
		title: 'Classes and Objects',
		referenceUrl: 'https://www.php.net/manual/en/language.oop5.php',
	},
	{
		id: 'namespaces',
		title: 'Namespaces',
		referenceUrl: 'https://www.php.net/manual/en/language.namespaces.php',
	},
	{
		id: 'enumerations',
		title: 'Enumerations',
		referenceUrl: 'https://www.php.net/manual/en/language.enumerations.php',
	},
	{
		id: 'error-handling',
		title: 'Error Handling',
		referenceUrl:
			'https://www.php.net/manual/en/language.error-handling.php',
	},
	{
		id: 'fibers',
		title: 'Fibers',
		referenceUrl: 'https://www.php.net/manual/en/language.fibers.php',
	},
	{
		id: 'generators',
		title: 'Generators',
		referenceUrl: 'https://www.php.net/manual/en/language.generators.php',
	},
	{
		id: 'attributes',
		title: 'Attributes',
		referenceUrl: 'https://www.php.net/manual/en/language.attributes.php',
	},
	{
		id: 'references',
		title: 'References Explained',
		referenceUrl: 'https://www.php.net/manual/en/language.references.php',
	},
	{
		id: 'predefined-variables',
		title: 'Predefined Variables',
		referenceUrl: 'https://www.php.net/manual/en/reserved.variables.php',
	},
	{
		id: 'string-functions',
		title: 'String Functions',
		referenceUrl: 'https://www.php.net/manual/en/ref.strings.php',
	},
] as const;
export type ReferenceChapterId = (typeof referenceChapters)[number]['id'];
