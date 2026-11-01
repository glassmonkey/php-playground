import type { Lesson, LessonSource } from './types';
import { withLearningNotes } from './learning-notes';
import { tutorialVersions, type TutorialVersion } from './config';

const coreLessons: readonly LessonSource[] = [
	{
		schemaVersion: 1,
		slug: 'output',
		chapterId: 'getting-started',
		referenceChapterId: 'basic-syntax',
		title: 'Start a PHP script',
		summary: 'Use PHP tags, comments, and echo.',
		goal: 'Mark PHP code, add a comment, and print a message.',
		programs: {
			sample: {
				code: "<?php\n// Set a name, then print a greeting.\n$name = 'Ada';\necho 'Hello, ' . $name . '!';",
			},
			starter: {
				code: '<?php\n// TODO: Print the welcome message.\n',
				input: null,
			},
			solution: {
				code: "<?php\n// Welcome the reader.\necho 'Welcome to PHP!';",
				input: null,
			},
			'exp-personalized-greeting': {
				code: '<?php\n$name = \'Mina\';\necho "Hello, {$name}!";',
			},
			'exp-two-line-welcome': {
				code: "<?php\n$name = 'Ada';\necho 'Hello, ' . $name . '!' . PHP_EOL;\necho 'Welcome to PHP!';",
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Mark PHP code, add a comment, and print a message.',
					},
					{
						type: 'paragraph',
						text: 'A PHP file can include HTML and PHP. The opening <?php tag starts PHP code; the closing ?> tag ends it. For a PHP-only file, omit the closing tag.',
					},
					{
						type: 'paragraph',
						text: 'Variable names start with $. Use = to assign a value and . to join strings. Write comments after // or between /* and */. PHP ignores comments. The echo construct writes text to output; end statements with a semicolon. Use PHP_EOL when you need a line break. In a double-quoted string, {$name} inserts the value of $name.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Write a PHP script with an opening tag and a comment, then print Welcome to PHP!',
			hint: 'Start with <?php, add a // comment, then use echo.',
			cases: [
				{
					id: 'welcome',
					label: 'Welcome message',
					input: null,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === (\"Welcome to PHP!\");\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Basics',
				url: 'https://www.php.net/manual/en/language.basic-syntax.php',
			},
			{
				title: 'PHP Manual: Strings',
				url: 'https://www.php.net/manual/en/language.types.string.php',
			},
		],

		experiments: [
			{
				id: 'personalized-greeting',
				title: 'Personalize a greeting',
				description:
					'Predict the greeting for Mina, select this experiment, then click Run.',
				programId: 'exp-personalized-greeting',
			},
			{
				id: 'two-line-welcome',
				title: 'Print a two-line welcome',
				description:
					'Predict both output lines, select this experiment, then click Run.',
				programId: 'exp-two-line-welcome',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'variables',
		chapterId: 'working-with-values',
		referenceChapterId: 'variables',
		title: 'Store values in variables',
		summary: 'Assign and reassign variable values.',
		goal: 'Store values and update a variable in a script.',
		programs: {
			sample: {
				code: "<?php\n$name = 'Mina';\n$price = 45.0;\necho $name . ' pays ';\nvar_dump($price);\n$price = 40.0;\nvar_dump($price);",
			},
			starter: {
				code: '<?php\n// TODO: Assign and reassign $price, then inspect it.\n',
				input: null,
			},
			solution: {
				code: '<?php\n$price = 45.0;\n$price = 12.5;\nvar_dump($price);',
				input: null,
			},
			'exp-reassign-price': {
				code: '<?php\n$price = 45.0;\n$price = 12.5;\nvar_dump($price);',
			},
			'exp-reassign-name': {
				code: "<?php\n$name = 'Mina';\necho $name . PHP_EOL;\n$name = 'Lee';\necho $name;",
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Assign a value to a variable with =. Assigning another value to the same variable replaces its current value. In this example, var_dump($price) prints the current value and its type. The float type represents numbers with a fractional part; the next Types lesson explores other types.',
					},
					{
						type: 'paragraph',
						text: 'Variable names start with $. A variable keeps the type of its current value, and a later assignment can replace that value.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Assign $price a float, replace its value, and inspect it with var_dump().',
			hint: 'Assign the same variable twice, then inspect its current value.',
			cases: [
				{
					id: 'reassigned-price',
					label: 'Inspect reassigned price',
					input: null,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === \"float(12.5)\\n\";\n    return ['passed' => $passed, 'message' => $passed ? 'The reassigned value matches.' : 'Check the current value of $price.'];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Variables',
				url: 'https://www.php.net/manual/en/language.variables.php',
			},
			{
				title: 'PHP Manual: Variable basics',
				url: 'https://www.php.net/manual/en/language.variables.basics.php',
			},
			{
				title: 'PHP Manual: Assignment operators',
				url: 'https://www.php.net/manual/en/language.operators.assignment.php',
			},
		],

		experiments: [
			{
				id: 'reassign-price',
				title: 'Reassign a price',
				description:
					'Predict the float after reassignment, select this experiment, then click Run.',
				programId: 'exp-reassign-price',
			},
			{
				id: 'reassign-name',
				title: 'Change a name value',
				description:
					'Predict the two names printed after reassignment, select this experiment, then click Run.',
				programId: 'exp-reassign-name',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'operators',
		chapterId: 'calculations',
		referenceChapterId: 'operators',
		title: 'Work with operators',
		summary: 'Calculate values and compare them.',
		goal: 'Use arithmetic and comparison operators to make a decision.',
		programs: {
			sample: {
				code: '<?php\n$price = 12;\n$quantity = 3;\n$total = $price * $quantity;\necho $total;\necho PHP_EOL;\nvar_dump($total > 30);',
			},
			starter: {
				code: '<?php\n$minutes = $input;\n// TODO: Print the number of seconds.\n',
				input: 90,
			},
			solution: {
				code: '<?php\n$minutes = $input;\necho $minutes * 60;',
				input: 90,
			},
			'exp-subtract-discount': {
				code: '<?php\n$price = 12;\n$quantity = 3;\n$total = $price * $quantity;\n$discountedTotal = $total - 5;\necho $discountedTotal;',
			},
			'exp-compare-threshold': {
				code: '<?php\n$price = 12;\n$quantity = 3;\n$total = $price * $quantity;\nvar_dump($total >= 30);',
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Use arithmetic and comparison operators to make a decision.',
					},
					{
						type: 'paragraph',
						text: 'Arithmetic operators such as +, -, *, and / calculate numbers. The . operator joins strings.',
					},
					{
						type: 'paragraph',
						text: 'Comparison operators such as === and > produce a boolean value. echo can hide false as empty output, so use var_dump() to see bool(true) or bool(false). Prefer === when checking both value and type.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Set $minutes to 90. Print the number of seconds by multiplying by 60.',
			hint: 'Use the * arithmetic operator.',
			cases: [
				{
					id: 'ninety-minutes',
					label: '90 minutes',
					input: 90,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ((string) ($input * 60));\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
				{
					id: 'one-minute',
					label: '1 minute',
					input: 1,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ((string) ($input * 60));\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
				{
					id: 'zero-minutes',
					label: '0 minutes',
					input: 0,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ((string) ($input * 60));\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Arithmetic Operators',
				url: 'https://www.php.net/manual/en/language.operators.arithmetic.php',
			},
			{
				title: 'PHP Manual: Comparison operators',
				url: 'https://www.php.net/manual/en/language.operators.comparison.php',
			},
			{
				title: 'PHP Manual: String operators',
				url: 'https://www.php.net/manual/en/language.operators.string.php',
			},
		],

		experiments: [
			{
				id: 'subtract-discount',
				title: 'Subtract a discount',
				description:
					'Predict the discounted total, select this experiment, then click Run.',
				programId: 'exp-subtract-discount',
			},
			{
				id: 'compare-threshold',
				title: 'Compare a threshold',
				description:
					'Predict whether var_dump() shows bool(true) or bool(false), select this experiment, then click Run.',
				programId: 'exp-compare-threshold',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'conditionals',
		chapterId: 'decisions-and-loops',
		referenceChapterId: 'control-structures',
		title: 'Choose a path',
		summary: 'Run code only when a condition matches.',
		goal: 'Use if and match to select a result.',
		programs: {
			sample: {
				code: "<?php\n$temperature = 18;\nif ($temperature >= 20) {\n    echo 'Warm';\n} else {\n    echo 'Cool';\n}\necho PHP_EOL;\n$day = 'sat';\necho match ($day) {\n    'sat', 'sun' => 'Weekend',\n    default => 'Weekday',\n};",
			},
			starter: {
				code: '<?php\n$level = $input;\n// TODO: Match the level to a message.\n',
				input: 'beginner',
			},
			solution: {
				code: "<?php\n$level = $input;\necho match ($level) {\n    'beginner' => 'Start here',\n    default => 'Keep going',\n};",
				input: 'beginner',
			},
			'exp-match-level': {
				code: "<?php\n$level = 'beginner';\n$message = match ($level) {\n    'beginner' => 'Start here',\n    'experienced' => 'Explore more',\n    default => 'Keep going',\n};\necho $message;",
			},
			'exp-group-match-values': {
				code: "<?php\n$day = 'sat';\necho match ($day) {\n    'sat', 'sun' => 'Weekend',\n    default => 'Weekday',\n};",
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Use if and match to select a result.',
					},
					{
						type: 'paragraph',
						text: 'An if statement runs its block when the condition is true. Use else for the other path, and elseif for another condition.',
					},
					{
						type: 'paragraph',
						text: 'The match expression compares with strict identity (===), returns a value, and must handle every possible input or include a default arm.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Use match to convert the string level "beginner" to "Start here" and all other values to "Keep going".',
			hint: 'Use a default arm for the other values.',
			cases: [
				{
					id: 'beginner',
					label: 'Beginner level',
					input: 'beginner',
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ($input === 'beginner' ? 'Start here' : 'Keep going');\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
				{
					id: 'experienced',
					label: 'Another level',
					input: 'experienced',
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ($input === 'beginner' ? 'Start here' : 'Keep going');\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: if',
				url: 'https://www.php.net/manual/en/control-structures.if.php',
			},
			{
				title: 'PHP Manual: match',
				url: 'https://www.php.net/manual/en/control-structures.match.php',
			},
		],

		experiments: [
			{
				id: 'match-level',
				title: 'Choose a message with match',
				description:
					'Predict the message for beginner, select this experiment, then click Run.',
				programId: 'exp-match-level',
			},
			{
				id: 'group-match-values',
				title: 'Group match values',
				description:
					'Predict the message for Saturday, select this experiment, then click Run.',
				programId: 'exp-group-match-values',
			},
		],
	},
	{
		schemaVersion: 1,
		chapterId: 'working-with-values',
		referenceChapterId: 'types',
		slug: 'types',
		title: 'Inspect PHP value types',
		summary: 'Inspect strings, numbers, booleans, and null values.',
		goal: 'Use var_dump() to inspect the type and value of simple data.',
		programs: {
			sample: {
				code: "<?php\n$quantity = 3;\n$price = 12.5;\n$available = true;\n$name = 'Notebook';\n$discount = null;\nvar_dump($quantity, $price, $available, $name, $discount);",
			},
			starter: {
				code: '<?php\n// TODO: Assign an integer, float, boolean, string, and null value.\n',
			},
			solution: {
				code: "<?php\n$quantity = 3;\n$price = 12.5;\n$available = true;\n$name = 'Notebook';\n$discount = null;\nvar_dump($quantity, $price, $available, $name, $discount);",
			},
			'exp-scalar-values': {
				code: "<?php\nvar_dump(3, 12.5, true, 'Notebook', null);",
			},
			'exp-null-zero': {
				code: '<?php\n$discount = null;\nvar_dump($discount);\n$discount = 0;\nvar_dump($discount);',
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'A value has a type. Common simple types include int, float, bool, string, and null.',
					},
					{
						type: 'paragraph',
						text: 'PHP determines the type from a value. Use var_dump() to inspect both its type and its value; null means no value is present.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Assign an integer, float, boolean, string, and null value, then inspect all five with var_dump().',
			hint: 'var_dump() accepts more than one value.',
			cases: [
				{
					id: 'inspect-values',
					label: 'Inspect five simple values',
					input: null,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $expected = \"int(3)\\nfloat(12.5)\\nbool(true)\\nstring(8) \\\"Notebook\\\"\\nNULL\\n\";\n    $passed = $output === $expected;\n    return ['passed' => $passed, 'message' => $passed ? 'All values match.' : 'Inspect each value and type.'];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Types',
				url: 'https://www.php.net/manual/en/language.types.php',
			},
		],
		experiments: [
			{
				id: 'scalar-values',
				title: 'Inspect simple values',
				description:
					'Predict the type and value shown for each value, select this experiment, then click Run.',
				programId: 'exp-scalar-values',
			},
			{
				id: 'null-zero',
				title: 'Compare null and zero',
				description:
					'Predict how null and integer zero differ in var_dump(), select this experiment, then click Run.',
				programId: 'exp-null-zero',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'arrays',
		chapterId: 'working-with-values',
		referenceChapterId: 'types',
		title: 'Group values in arrays',
		summary: 'Keep related values together in a list or map.',
		goal: 'Read and update values by key.',
		programs: {
			sample: {
				code: "<?php\n$scores = [8, 10];\n$scores[1] = 11;\n$scores[] = 9;\necho $scores[1];\necho PHP_EOL;\n$person = ['name' => 'Lee', 'city' => 'Osaka'];\necho $person['name'] . ' lives in ' . $person['city'] . '.';",
			},
			starter: {
				code: '<?php\n$colors = $input;\n// TODO: Print the second color.\n',
				input: ['red', 'green', 'blue'],
			},
			solution: {
				code: '<?php\n$colors = $input;\necho $colors[1];',
				input: ['red', 'green', 'blue'],
			},
			'exp-nested-address': {
				code: "<?php\n$person = [\n    'name' => 'Lee',\n    'address' => ['city' => 'Osaka'],\n];\necho $person['name'] . ' lives in ' . $person['address']['city'] . '.';",
			},
			'exp-numbered-scores': {
				code: "<?php\n$scores = [8, 10, 9];\necho $scores[0] . ', ' . $scores[1] . ', ' . $scores[2];",
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Read and update values by key.',
					},
					{
						type: 'paragraph',
						text: 'An array written as a list without explicit keys starts at index 0. PHP arrays can also use named keys, so the same array type acts as a map.',
					},
					{
						type: 'paragraph',
						text: 'Use [] to append a value. Use a key in square brackets to read or replace an entry; assigning an existing key changes its value.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Create an array of three colors and print the second color.',
			hint: 'Indexed arrays start at index 0.',
			cases: [
				{
					id: 'primary-colors',
					label: 'Primary colors',
					input: ['red', 'green', 'blue'],
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === (\"green\");\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
				{
					id: 'warm-colors',
					label: 'Warm colors',
					input: ['orange', 'red', 'yellow'],
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === (\"red\");\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Arrays',
				url: 'https://www.php.net/manual/en/language.types.array.php',
			},
		],

		experiments: [
			{
				id: 'nested-address',
				title: 'Read nested data',
				description:
					'Predict the city printed from the nested address, select this experiment, then click Run.',
				programId: 'exp-nested-address',
			},
			{
				id: 'numbered-scores',
				title: 'Read indexed values',
				description:
					'Predict the three values printed by index, select this experiment, then click Run.',
				programId: 'exp-numbered-scores',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'loops',
		chapterId: 'decisions-and-loops',
		referenceChapterId: 'control-structures',
		title: 'Repeat work with loops',
		summary: 'Run code for each item or a set number of times.',
		goal: 'Repeat work over array values and while a condition holds.',
		programs: {
			sample: {
				code: "<?php\n$tasks = ['read', 'practice', 'review'];\nforeach ($tasks as $task) {\n    echo '- ' . $task . PHP_EOL;\n}\n\n$count = 3;\nwhile ($count > 0) {\n    echo $count;\n    if ($count > 1) {\n        echo ', ';\n    }\n    $count--;\n}",
			},
			starter: {
				code: '<?php\n$limit = $input;\n// TODO: Print the numbers from 1 through $limit.\n',
				input: 3,
			},
			solution: {
				code: '<?php\nfor ($number = 1; $number <= $input; $number++) {\n    echo $number . PHP_EOL;\n}',
				input: 3,
			},
			'exp-count-with-for': {
				code: '<?php\nfor ($count = 1; $count <= 3; $count++) {\n    echo $count . PHP_EOL;\n}',
			},
			'exp-even-countdown': {
				code: '<?php\n$count = 4;\nwhile ($count > 0) {\n    if ($count % 2 === 0) {\n        echo $count . PHP_EOL;\n    }\n    $count--;\n}',
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Repeat work over array values and while a condition holds.',
					},
					{
						type: 'paragraph',
						text: 'A foreach loop visits each value in an array. Give each current value a variable with as.',
					},
					{
						type: 'paragraph',
						text: 'A for loop groups a starting value, a condition, and an update. ++ adds one and -- subtracts one. A while loop repeats while its condition is true; update the counter so it eventually stops. % gives the remainder, so $count % 2 === 0 checks for an even number.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Use a for loop to print 1, 2, and 3 on separate lines.',
			hint: 'Start a counter at 1 and continue while it is <= 3.',
			cases: [
				{
					id: 'three-numbers',
					label: 'Count to 3',
					input: 3,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === (\"1\\n2\\n3\\n\");\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
				{
					id: 'one-number',
					label: 'Count to 1',
					input: 1,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === (\"1\\n\");\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
				{
					id: 'zero-numbers',
					label: 'Count to 0',
					input: 0,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === (\"\");\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: foreach',
				url: 'https://www.php.net/manual/en/control-structures.foreach.php',
			},
			{
				title: 'PHP Manual: for',
				url: 'https://www.php.net/manual/en/control-structures.for.php',
			},
			{
				title: 'PHP Manual: while',
				url: 'https://www.php.net/manual/en/control-structures.while.php',
			},
		],

		experiments: [
			{
				id: 'count-with-for',
				title: 'Count with a for loop',
				description:
					'Predict the three numbers, select this experiment, then click Run.',
				programId: 'exp-count-with-for',
			},
			{
				id: 'even-countdown',
				title: 'Print even numbers in a countdown',
				description:
					'Predict which numbers are printed, select this experiment, then click Run.',
				programId: 'exp-even-countdown',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'functions',
		chapterId: 'using-functions',
		referenceChapterId: 'functions',
		title: 'Package logic in functions',
		summary: 'Name reusable steps and give them inputs.',
		goal: 'Write a typed function with a parameter and return value.',
		programs: {
			sample: {
				code: '<?php\nfunction greeting(string $name): string\n{\n    return "Hello, {$name}!";\n}\n\necho greeting(\'Sam\');',
			},
			starter: {
				code: '<?php\nfunction square(int $number): int\n{\n    // TODO: Return the number multiplied by itself.\n    return 0;\n}\n\necho square($input);',
				input: 0,
			},
			solution: {
				code: '<?php\nfunction square(int $number): int\n{\n    return $number * $number;\n}\n\necho square($input);',
				input: 0,
			},
			'exp-default-greeting': {
				code: "<?php\nfunction greeting(string $name, string $word = 'Hello'): string\n{\n    return \"{$word}, {$name}!\";\n}\necho greeting('Sam') . PHP_EOL;\necho greeting('Mina', 'Welcome');",
			},
			'exp-greet-each-name': {
				code: "<?php\nfunction greeting(string $name): string\n{\n    return \"Hello, {$name}!\";\n}\n$names = ['Sam', 'Mina'];\nforeach ($names as $name) {\n    echo greeting($name) . PHP_EOL;\n}",
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Write a typed function with a parameter and return value.',
					},
					{
						type: 'paragraph',
						text: 'A function groups statements under a name. Parameters provide input, and return sends a result back to the caller.',
					},
					{
						type: 'paragraph',
						text: 'Parameter and return types declare the expected types. PHP can coerce scalar values unless strict typing is enabled.',
					},
					{
						type: 'paragraph',
						text: 'Variables created inside a function are local to that function. Pass values in as parameters and return results instead of relying on variables from outside.',
					},
					{
						type: 'paragraph',
						text: 'A parameter can have a default value, which the function uses when that argument is omitted.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Write a function square(int $number): int that returns the number multiplied by itself, then print square(5).',
			hint: 'Use return for the calculated value.',
			cases: [
				{
					id: 'zero',
					label: 'Square zero',
					input: 0,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    if (!function_exists('square')) {\n        return ['passed' => false, 'message' => 'Define the square function.'];\n    }\n    $expected = $input * $input;\n    $actual = square($input);\n    $passed = $actual === $expected && $output === (string) $expected;\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Square is correct.' : 'The square result does not match this input.',\n    ];\n};",
				},
				{
					id: 'negative',
					label: 'Square a negative number',
					input: -3,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    if (!function_exists('square')) {\n        return ['passed' => false, 'message' => 'Define the square function.'];\n    }\n    $expected = $input * $input;\n    $actual = square($input);\n    $passed = $actual === $expected && $output === (string) $expected;\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Square is correct.' : 'The square result does not match this input.',\n    ];\n};",
				},
				{
					id: 'positive',
					label: 'Square a positive number',
					input: 5,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    if (!function_exists('square')) {\n        return ['passed' => false, 'message' => 'Define the square function.'];\n    }\n    $expected = $input * $input;\n    $actual = square($input);\n    $passed = $actual === $expected && $output === (string) $expected;\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Square is correct.' : 'The square result does not match this input.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Functions',
				url: 'https://www.php.net/manual/en/language.functions.php',
			},
			{
				title: 'PHP Manual: Variable scope',
				url: 'https://www.php.net/manual/en/language.variables.scope.php',
			},
		],

		experiments: [
			{
				id: 'default-greeting',
				title: 'Add a default greeting',
				description:
					'Predict the two greetings, select this experiment, then click Run.',
				programId: 'exp-default-greeting',
			},
			{
				id: 'greet-each-name',
				title: 'Use the function in a loop',
				description:
					'Predict one greeting per name, select this experiment, then click Run.',
				programId: 'exp-greet-each-name',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'format-full-name',
		chapterId: 'using-functions',
		referenceChapterId: 'functions',
		title: 'Format a full name',
		summary: 'Trim optional name parts and join them cleanly.',
		goal: 'Write a function that formats names with empty parts safely.',
		programs: {
			sample: {
				code: "<?php\nfunction formatFullName(string $firstName, string $lastName): string\n{\n    $firstName = trim($firstName);\n    $lastName = trim($lastName);\n\n    if ($firstName === '') {\n        return $lastName;\n    }\n\n    if ($lastName === '') {\n        return $firstName;\n    }\n\n    return $firstName . ' ' . $lastName;\n}\n\necho formatFullName('  Ada ', ' Lovelace  ');",
			},
			starter: {
				code: "<?php\nfunction formatFullName(string $firstName, string $lastName): string\n{\n    $firstName = trim($firstName);\n    $lastName = trim($lastName);\n\n    // TODO: Return the non-empty name, or join both with one space.\n    return '';\n}\n\necho formatFullName($input['first'], $input['last']);",
				input: {
					first: '  Ada ',
					last: ' Lovelace  ',
				},
			},
			solution: {
				code: "<?php\nfunction formatFullName(string $firstName, string $lastName): string\n{\n    $firstName = trim($firstName);\n    $lastName = trim($lastName);\n\n    if ($firstName === '') {\n        return $lastName;\n    }\n\n    if ($lastName === '') {\n        return $firstName;\n    }\n\n    return $firstName . ' ' . $lastName;\n}\n\necho formatFullName($input['first'], $input['last']);",
				input: {
					first: '  Ada ',
					last: ' Lovelace  ',
				},
			},
			'exp-whitespace-first-name': {
				code: "<?php\nfunction formatFullName(string $firstName, string $lastName): string\n{\n    $firstName = trim($firstName);\n    $lastName = trim($lastName);\n\n    if ($firstName === '') {\n        return $lastName;\n    }\n\n    if ($lastName === '') {\n        return $firstName;\n    }\n\n    return $firstName . ' ' . $lastName;\n}\necho formatFullName('   ', 'Hopper');",
			},
			'exp-empty-name-parts': {
				code: "<?php\nfunction formatFullName(string $firstName, string $lastName): string\n{\n    $firstName = trim($firstName);\n    $lastName = trim($lastName);\n\n    if ($firstName === '') {\n        return $lastName;\n    }\n\n    if ($lastName === '') {\n        return $firstName;\n    }\n\n    return $firstName . ' ' . $lastName;\n}\necho '[' . formatFullName('', '') . ']';",
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'why-it-works',
				title: 'Why it works',
				blocks: [
					{
						type: 'paragraph',
						text: 'Write a function that formats names with empty parts safely.',
					},
					{
						type: 'paragraph',
						text: 'trim() removes surrounding ordinary spaces, tabs, and line breaks by default. It leaves spaces inside the string alone and does not remove every Unicode whitespace character.',
					},
					{
						type: 'paragraph',
						text: 'After trimming, compare each part with an empty string. Add a separating space only when both parts have a value.',
					},
					{
						type: 'paragraph',
						text: 'Return the formatted string from a function so other code can reuse it. Try whitespace-only and empty inputs to see how trim() affects each part.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Write formatFullName(string $firstName, string $lastName): string. Trim both inputs, return the non-empty part when the other is empty, and join two non-empty parts with one space. Echo the result for $input.',
			hint: 'Trim both strings first. Check each one against an empty string before joining them.',
			cases: [
				{
					id: 'trim-both-parts',
					label: 'Trim both name parts',
					input: {
						first: '  Ada ',
						last: ' Lovelace  ',
					},
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    if (!function_exists('formatFullName')) {\n        return ['passed' => false, 'message' => 'Define the formatFullName function.'];\n    }\n    $firstName = trim($input['first']);\n    $lastName = trim($input['last']);\n    if ($firstName === '') {\n        $expected = $lastName;\n    } elseif ($lastName === '') {\n        $expected = $firstName;\n    } else {\n        $expected = $firstName . ' ' . $lastName;\n    }\n    $actual = formatFullName($input['first'], $input['last']);\n    $passed = $actual === $expected && $output === $expected;\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'The full name is formatted correctly.' : 'Check trimming and empty-name cases.',\n    ];\n};",
				},
				{
					id: 'empty-first-name',
					label: 'Empty first name',
					input: {
						first: '',
						last: 'Lovelace',
					},
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    if (!function_exists('formatFullName')) {\n        return ['passed' => false, 'message' => 'Define the formatFullName function.'];\n    }\n    $firstName = trim($input['first']);\n    $lastName = trim($input['last']);\n    if ($firstName === '') {\n        $expected = $lastName;\n    } elseif ($lastName === '') {\n        $expected = $firstName;\n    } else {\n        $expected = $firstName . ' ' . $lastName;\n    }\n    $actual = formatFullName($input['first'], $input['last']);\n    $passed = $actual === $expected && $output === $expected;\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'The full name is formatted correctly.' : 'Check trimming and empty-name cases.',\n    ];\n};",
				},
				{
					id: 'empty-last-name',
					label: 'Empty last name',
					input: {
						first: 'Ada',
						last: '',
					},
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    if (!function_exists('formatFullName')) {\n        return ['passed' => false, 'message' => 'Define the formatFullName function.'];\n    }\n    $firstName = trim($input['first']);\n    $lastName = trim($input['last']);\n    if ($firstName === '') {\n        $expected = $lastName;\n    } elseif ($lastName === '') {\n        $expected = $firstName;\n    } else {\n        $expected = $firstName . ' ' . $lastName;\n    }\n    $actual = formatFullName($input['first'], $input['last']);\n    $passed = $actual === $expected && $output === $expected;\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'The full name is formatted correctly.' : 'Check trimming and empty-name cases.',\n    ];\n};",
				},
				{
					id: 'both-empty',
					label: 'Both parts empty',
					input: {
						first: '',
						last: '',
					},
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    if (!function_exists('formatFullName')) {\n        return ['passed' => false, 'message' => 'Define the formatFullName function.'];\n    }\n    $firstName = trim($input['first']);\n    $lastName = trim($input['last']);\n    if ($firstName === '') {\n        $expected = $lastName;\n    } elseif ($lastName === '') {\n        $expected = $firstName;\n    } else {\n        $expected = $firstName . ' ' . $lastName;\n    }\n    $actual = formatFullName($input['first'], $input['last']);\n    $passed = $actual === $expected && $output === $expected;\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'The full name is formatted correctly.' : 'Check trimming and empty-name cases.',\n    ];\n};",
				},
				{
					id: 'whitespace-only-name',
					label: 'Whitespace-only first name',
					input: {
						first: '   ',
						last: 'Hopper',
					},
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    if (!function_exists('formatFullName')) {\n        return ['passed' => false, 'message' => 'Define the formatFullName function.'];\n    }\n    $firstName = trim($input['first']);\n    $lastName = trim($input['last']);\n    if ($firstName === '') {\n        $expected = $lastName;\n    } elseif ($lastName === '') {\n        $expected = $firstName;\n    } else {\n        $expected = $firstName . ' ' . $lastName;\n    }\n    $actual = formatFullName($input['first'], $input['last']);\n    $passed = $actual === $expected && $output === $expected;\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'The full name is formatted correctly.' : 'Check trimming and empty-name cases.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: trim',
				url: 'https://www.php.net/manual/en/function.trim.php',
			},
			{
				title: 'PHP Manual: String Operators',
				url: 'https://www.php.net/manual/en/language.operators.string.php',
			},
			{
				title: 'PHP Manual: Functions',
				url: 'https://www.php.net/manual/en/language.functions.php',
			},
		],

		experiments: [
			{
				id: 'whitespace-first-name',
				title: 'Treat whitespace as an empty name',
				description:
					'Predict the result when the first name contains only spaces, select this experiment, then click Run.',
				programId: 'exp-whitespace-first-name',
			},
			{
				id: 'empty-name-parts',
				title: 'Handle two empty names',
				description:
					'Predict the bracketed result for two empty names, select this experiment, then click Run.',
				programId: 'exp-empty-name-parts',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'errors',
		chapterId: 'handling-failures',
		referenceChapterId: 'error-handling',
		title: 'Handle exceptions',
		summary: 'Understand exceptions and recover when an operation fails.',
		goal: 'Throw and catch an exception with try and catch.',
		programs: {
			sample: {
				code: "<?php\nfunction divide(int $left, int $right): int\n{\n    if ($right === 0) {\n        throw new InvalidArgumentException('The divisor must not be zero.');\n    }\n\n    return intdiv($left, $right);\n}\n\ntry {\n    echo divide(12, 0);\n} catch (InvalidArgumentException $error) {\n    echo $error->getMessage();\n}",
			},
			starter: {
				code: '<?php\n$age = $input;\ntry {\n    // TODO: Reject negative ages and print the result.\n} catch (InvalidArgumentException $error) {\n    echo $error->getMessage();\n}\n',
				input: -1,
			},
			solution: {
				code: "<?php\n$age = $input;\ntry {\n    if ($age < 0) {\n        throw new InvalidArgumentException('Age cannot be negative.');\n    }\n    echo $age;\n} catch (InvalidArgumentException $error) {\n    echo $error->getMessage();\n}",
				input: -1,
			},
			'exp-successful-division': {
				code: "<?php\nfunction divide(int $left, int $right): int\n{\n    if ($right === 0) {\n        throw new InvalidArgumentException('The divisor must not be zero.');\n    }\n    return intdiv($left, $right);\n}\ntry {\n    echo divide(12, 3);\n} catch (InvalidArgumentException $error) {\n    echo $error->getMessage();\n}",
			},
			'exp-finally-message': {
				code: "<?php\nfunction divide(int $left, int $right): int\n{\n    if ($right === 0) {\n        throw new InvalidArgumentException('The divisor must not be zero.');\n    }\n    return intdiv($left, $right);\n}\ntry {\n    echo divide(12, 0);\n} catch (InvalidArgumentException $error) {\n    echo $error->getMessage();\n} finally {\n    echo PHP_EOL . 'Done.';\n}",
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Throw and catch an exception with try and catch.',
					},
					{
						type: 'paragraph',
						text: 'An exception reports an operation that cannot complete normally. Throw one when your code detects an invalid situation.',
					},
					{
						type: 'paragraph',
						text: 'Put risky work in try and handle a matching throwable in catch. Catch a specific exception type when you know which one to handle. A finally block runs after try and catch, whether or not an exception was caught.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Throw InvalidArgumentException when $age is negative, and print the exception message with try/catch.',
			hint: 'Use a condition before the normal path and catch InvalidArgumentException.',
			cases: [
				{
					id: 'negative-age',
					label: 'Negative age',
					input: -1,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ($input < 0 ? 'Age cannot be negative.' : (string) $input);\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
				{
					id: 'adult-age',
					label: 'Non-negative age',
					input: 18,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ($input < 0 ? 'Age cannot be negative.' : (string) $input);\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Error Handling',
				url: 'https://www.php.net/manual/en/language.error-handling.php',
			},
			{
				title: 'PHP Manual: finally',
				url: 'https://www.php.net/manual/en/control-structures.finally.php',
			},
		],

		experiments: [
			{
				id: 'successful-division',
				title: 'Run a successful division',
				description:
					'Predict the result for a non-zero divisor, select this experiment, then click Run.',
				programId: 'exp-successful-division',
			},
			{
				id: 'finally-message',
				title: 'Print a completion message',
				description:
					'Predict the error and completion lines, select this experiment, then click Run.',
				programId: 'exp-finally-message',
			},
		],
	},
	{
		schemaVersion: 1,
		slug: 'classes',
		chapterId: 'objects-and-state',
		referenceChapterId: 'classes-objects',
		title: 'Model data with classes',
		summary: 'Define objects with properties, a constructor, and methods.',
		goal: 'Create an object and call one of its methods.',
		programs: {
			sample: {
				code: '<?php\nclass Counter\n{\n    public int $value;\n\n    public function __construct(int $start)\n    {\n        $this->value = $start;\n    }\n\n    public function add(int $amount): void\n    {\n        $this->value += $amount;\n    }\n}\n\n$counter = new Counter(2);\n$counter->add(3);\necho $counter->value;',
			},
			starter: {
				code: "<?php\nclass Greeter\n{\n    public string $name;\n\n    public function __construct(string $name)\n    {\n        $this->name = $name;\n    }\n\n    public function greet(): string\n    {\n        // TODO: Return a greeting for this name.\n        return '';\n    }\n}\n\n$greeter = new Greeter($input);\necho $greeter->greet();",
				input: 'Kai',
			},
			solution: {
				code: "<?php\nclass Greeter\n{\n    public string $name;\n\n    public function __construct(string $name)\n    {\n        $this->name = $name;\n    }\n\n    public function greet(): string\n    {\n        return 'Hello, ' . $this->name . '!';\n    }\n}\n\n$greeter = new Greeter($input);\necho $greeter->greet();",
				input: 'Kai',
			},
			'exp-two-counters': {
				code: "<?php\nclass Counter\n{\n    public int $value;\n    public function __construct(int $start) { $this->value = $start; }\n    public function add(int $amount): void { $this->value += $amount; }\n}\n$first = new Counter(2);\n$second = new Counter(10);\n$first->add(3);\n$second->add(4);\necho $first->value . ', ' . $second->value;",
			},
			'exp-reset-counter': {
				code: '<?php\nclass Counter\n{\n    public int $value;\n    public function __construct(int $start) { $this->value = $start; }\n    public function add(int $amount): void { $this->value += $amount; }\n    public function reset(): void { $this->value = 0; }\n}\n$counter = new Counter(2);\n$counter->add(3);\n$counter->reset();\necho $counter->value;',
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'Create an object and call one of its methods.',
					},
					{
						type: 'paragraph',
						text: 'A class is a blueprint for objects. Properties store object data, and methods define what an object can do. A public property can be read or changed from outside the class.',
					},
					{
						type: 'paragraph',
						text: 'The constructor runs when you create an object. Assign its parameters to properties, then use $this inside methods to refer to the current object. A method can change state without returning a value; PHP 7.1+ can declare that with void. += adds to a property and stores the result.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Create a Greeter class with a public name property, initialize it in the constructor, and add a greet() method. Print its greeting.',
			hint: 'Have greet() return a string that uses $this->name.',
			cases: [
				{
					id: 'kai',
					label: 'Greet Kai',
					input: 'Kai',
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ('Hello, ' . $input . '!');\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
				{
					id: 'ada',
					label: 'Greet Ada',
					input: 'Ada',
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ('Hello, ' . $input . '!');\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Classes and Objects',
				url: 'https://www.php.net/manual/en/language.oop5.php',
			},
		],

		experiments: [
			{
				id: 'two-counters',
				title: 'Use two independent counters',
				description:
					'Predict each counter value, select this experiment, then click Run.',
				programId: 'exp-two-counters',
			},
			{
				id: 'reset-counter',
				title: 'Add a reset method',
				description:
					'Predict the value after reset(), select this experiment, then click Run.',
				programId: 'exp-reset-counter',
			},
		],
	},
];

const additionalLessons: readonly LessonSource[] = [
	{
		schemaVersion: 1,
		chapterId: 'working-with-values',
		referenceChapterId: 'constants',
		slug: 'constants',
		title: 'Define constants',
		summary: 'Name values that stay fixed while a script runs.',
		goal: 'Define and read a constant with const.',
		programs: {
			sample: {
				code: '<?php\nconst TAX_RATE = 0.1;\necho TAX_RATE;',
			},
			starter: {
				code: '<?php\n// TODO: Define a CURRENCY constant and print it.\n',
			},
			solution: {
				code: "<?php\nconst CURRENCY = 'USD';\necho CURRENCY;",
			},
			'exp-currency-constant': {
				code: "<?php\nconst CURRENCY = 'USD';\necho CURRENCY;",
			},
			'exp-constant-array': {
				code: "<?php\nconst COLORS = ['red', 'green', 'blue'];\necho COLORS[1];",
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'A constant names a value that does not change while a script runs.',
					},
					{
						type: 'paragraph',
						text: 'Define a constant with const and read it by name without a dollar sign. Constant names are commonly written in uppercase. The constant-array Experiment uses a list in square brackets: automatic indexes start at 0, so [1] reads its second element. The Arrays lesson will extend this to updates and named keys.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Define a constant named CURRENCY with the value USD and print it.',
			hint: 'Use const, then echo the constant name without $.',
			cases: [
				{
					id: 'currency',
					label: 'Print currency constant',
					input: null,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === 'USD';\n    return ['passed' => $passed, 'message' => $passed ? 'Constant output matches.' : 'Check the constant name and output.'];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Constants',
				url: 'https://www.php.net/manual/en/language.constants.php',
			},
			{
				title: 'PHP Manual: Constant syntax',
				url: 'https://www.php.net/manual/en/language.constants.syntax.php',
			},
		],
		experiments: [
			{
				id: 'currency-constant',
				title: 'Print a currency constant',
				description:
					'Predict the value printed from the constant name, select this experiment, then click Run.',
				programId: 'exp-currency-constant',
			},
			{
				id: 'constant-array',
				title: 'Read from a constant array',
				description:
					'Predict the color at index 1, select this experiment, then click Run.',
				programId: 'exp-constant-array',
			},
		],
	},
	{
		schemaVersion: 1,
		chapterId: 'calculations',
		referenceChapterId: 'expressions',
		slug: 'expressions',
		title: 'Combine expressions',
		summary: 'Combine values and operators to calculate a result.',
		goal: 'Use grouping to make an expression clear.',
		programs: {
			sample: {
				code: '<?php\n$subtotal = 12;\n$delivery = 3;\n$total = ($subtotal + $delivery) * 2;\necho $total;',
			},
			starter: {
				code: '<?php\n// TODO: Add subtotal and delivery, then multiply the sum by two.\n',
			},
			solution: {
				code: '<?php\n$subtotal = 12;\n$delivery = 3;\necho ($subtotal + $delivery) * 2;',
			},
			'exp-precedence': {
				code: '<?php\n$subtotal = 12;\n$delivery = 3;\necho $subtotal + $delivery * 2;',
			},
			'exp-combine-results': {
				code: '<?php\n$subtotal = 12;\n$delivery = 3;\n$items = 2;\n$total = ($subtotal + $delivery) * $items;\necho $total;',
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'An expression is code that produces a value. Numbers and variables are simple expressions; operators can combine expressions into a result.',
					},
					{
						type: 'paragraph',
						text: 'In this example, + adds values and * multiplies them. The previous Operators lesson introduced these operators.',
					},
					{
						type: 'paragraph',
						text: 'Parentheses show which part to calculate first. They can make the intended grouping clear even when operator precedence already determines the order.',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [
					{
						type: 'example',
					},
				],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [
					{
						type: 'experiments',
					},
				],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Add $subtotal and $delivery, then multiply that sum by two and print the result.',
			hint: 'Put the addition in parentheses before multiplying.',
			cases: [
				{
					id: 'grouped-total',
					label: 'Grouped total',
					input: null,
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === '30';\n    return ['passed' => $passed, 'message' => $passed ? 'Expression result matches.' : 'Check the grouping.'];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: Expressions',
				url: 'https://www.php.net/manual/en/language.expressions.php',
			},
			{
				title: 'PHP Manual: Arithmetic operators',
				url: 'https://www.php.net/manual/en/language.operators.arithmetic.php',
			},
		],
		experiments: [
			{
				id: 'precedence',
				title: 'Compare operator precedence',
				description:
					'Predict the result without grouping parentheses, select this experiment, then click Run.',
				programId: 'exp-precedence',
			},
			{
				id: 'combine-results',
				title: 'Combine a subtotal and quantity',
				description:
					'Predict the total for two items, select this experiment, then click Run.',
				programId: 'exp-combine-results',
			},
		],
	},
	{
		schemaVersion: 1,
		chapterId: 'using-functions',
		referenceChapterId: 'string-functions',
		slug: 'string-functions',
		title: 'Clean and change string case',
		summary: 'Use built-in functions to transform text.',
		goal: 'Trim outer whitespace and uppercase ASCII letters.',
		programs: {
			sample: {
				code: "<?php\n$text = '  php strings  ';\necho '[' . trim($text) . ']';",
			},
			starter: {
				code: '<?php\n// TODO: Trim the input, uppercase it, and print it.\necho $input;',
				input: '  php strings  ',
			},
			solution: {
				code: '<?php\necho strtoupper(trim($input));',
				input: '  php strings  ',
			},
			'exp-uppercase-ascii': {
				code: "<?php\necho strtoupper('php');",
			},
			'exp-trim-and-uppercase': {
				code: '<?php\n$text = " \tphp strings\n ";\necho strtoupper(trim($text));',
			},
		},
		sampleProgramId: 'sample',
		sections: [
			{
				id: 'concept',
				title: 'Learn',
				blocks: [
					{
						type: 'paragraph',
						text: 'A built-in function is a ready-made operation you call by name with parentheses.',
					},
					{
						type: 'paragraph',
						text: 'By default, trim() removes spaces, tabs, line breaks, and several other ASCII control characters from both ends of a string. It leaves the middle unchanged.',
					},
					{
						type: 'paragraph',
						text: 'strtoupper() changes ASCII letters a through z to uppercase. PHP 8.2 made this conversion locale-independent; these examples use ASCII text. For Unicode letters, the Multibyte String extension provides mb_strtoupper().',
					},
					{
						type: 'paragraph',
						text: 'Function calls can be nested. PHP evaluates trim() first, then passes its result to strtoupper().',
					},
				],
			},
			{
				id: 'example',
				title: 'Example',
				blocks: [{ type: 'example' }],
			},
			{
				id: 'experiment',
				title: 'Experiment',
				blocks: [{ type: 'experiments' }],
			},
		],
		exercise: {
			starterProgramId: 'starter',
			solutionProgramId: 'solution',
			prompt: 'Print the input after removing outer whitespace and uppercasing ASCII letters.',
			hint: 'Apply trim() before strtoupper().',
			cases: [
				{
					id: 'mixed-case',
					label: 'Mixed-case text',
					input: '  php strings  ',
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $expected = strtoupper(trim($input));\n    $passed = $output === $expected;\n    return ['passed' => $passed, 'message' => $passed ? 'Text matches.' : 'Check trimming and uppercase conversion.'];\n};",
				},
				{
					id: 'edge-whitespace',
					label: 'Tabs and line breaks',
					input: '\tPhp\n',
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $expected = strtoupper(trim($input));\n    $passed = $output === $expected;\n    return ['passed' => $passed, 'message' => $passed ? 'Text matches.' : 'Check trimming and uppercase conversion.'];\n};",
				},
				{
					id: 'empty-text',
					label: 'Empty text',
					input: '',
					checkPhp:
						"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $expected = strtoupper(trim($input));\n    $passed = $output === $expected;\n    return ['passed' => $passed, 'message' => $passed ? 'Text matches.' : 'Check trimming and uppercase conversion.'];\n};",
				},
			],
		},
		references: [
			{
				title: 'PHP Manual: String Functions',
				url: 'https://www.php.net/manual/en/ref.strings.php',
			},
			{
				title: 'PHP Manual: trim',
				url: 'https://www.php.net/manual/en/function.trim.php',
			},
			{
				title: 'PHP Manual: strtoupper',
				url: 'https://www.php.net/manual/en/function.strtoupper.php',
			},
			{
				title: 'PHP Manual: mb_strtoupper',
				url: 'https://www.php.net/manual/en/function.mb-strtoupper.php',
			},
		],
		experiments: [
			{
				id: 'uppercase-ascii',
				title: 'Uppercase ASCII text',
				description:
					'Predict the uppercase text, select this experiment, then click Run.',
				programId: 'exp-uppercase-ascii',
			},
			{
				id: 'trim-and-uppercase',
				title: 'Clean then uppercase text',
				description:
					'Predict the text after trimming and uppercasing, select this experiment, then click Run.',
				programId: 'exp-trim-and-uppercase',
			},
		],
	},
];

const enumLesson: LessonSource = {
	schemaVersion: 1,
	slug: 'enums',
	chapterId: 'objects-and-state',
	referenceChapterId: 'enumerations',
	title: 'Enums: fixed choices',
	summary: 'Represent a value that must be one of a known set.',
	goal: 'Define a backed enum and read its value.',
	programs: {
		sample: {
			code: "<?php\nenum Status: string\n{\n    case Todo = 'todo';\n    case Done = 'done';\n}\n\n$status = Status::Done;\necho $status->value;",
		},
		starter: {
			code: '<?php\nenum Color\n{\n    case Red;\n    case Blue;\n}\n\n// TODO: Print the name of Color::Blue.\n',
		},
		solution: {
			code: '<?php\nenum Color\n{\n    case Red;\n    case Blue;\n}\n\necho Color::Blue->name;',
			input: null,
		},
		'exp-match-enum-cases': {
			code: "<?php\nenum Status: string\n{\n    case Todo = 'todo';\n    case Done = 'done';\n}\n$status = Status::Done;\necho match ($status) {\n    Status::Todo => 'To do',\n    Status::Done => 'Complete',\n};",
		},
		'exp-list-enum-cases': {
			code: "<?php\nenum Status: string\n{\n    case Todo = 'todo';\n    case Done = 'done';\n}\nforeach (Status::cases() as $status) {\n    echo $status->value . PHP_EOL;\n}",
		},
	},
	sampleProgramId: 'sample',
	sections: [
		{
			id: 'concept',
			title: 'Learn',
			blocks: [
				{
					type: 'paragraph',
					text: 'Define a backed enum and read its value.',
				},
				{
					type: 'paragraph',
					text: 'An enum defines a closed set of named cases. PHP added enums in 8.1, so they are available in PHP 8.1 and later. Use :: to refer to a case; cases() returns all cases.',
				},
				{
					type: 'paragraph',
					text: 'A backed enum associates every case with a unique string or integer. Use ->value to read that backing value.',
				},
			],
		},
		{
			id: 'example',
			title: 'Example',
			blocks: [
				{
					type: 'example',
				},
			],
		},
		{
			id: 'experiment',
			title: 'Experiment',
			blocks: [
				{
					type: 'experiments',
				},
			],
		},
	],
	exercise: {
		starterProgramId: 'starter',
		solutionProgramId: 'solution',
		prompt: 'Define a Color enum with Red and Blue cases and print the name of Color::Blue.',
		hint: 'A pure enum case has a built-in name property.',
		cases: [
			{
				id: 'blue-case',
				label: 'Blue case',
				input: null,
				checkPhp:
					"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === (\"Blue\");\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
			},
		],
	},
	references: [
		{
			title: 'PHP Manual: Enumerations',
			url: 'https://www.php.net/manual/en/language.enumerations.php',
		},
	],

	experiments: [
		{
			id: 'match-enum-cases',
			title: 'Match enum cases to labels',
			description:
				'Predict the label for Status::Done, select this experiment, then click Run.',
			programId: 'exp-match-enum-cases',
		},
		{
			id: 'list-enum-cases',
			title: 'List all enum cases',
			description:
				'Predict the enum values and their order, select this experiment, then click Run.',
			programId: 'exp-list-enum-cases',
		},
	],
};

const propertyHooksLesson: LessonSource = {
	schemaVersion: 1,
	slug: 'property-hooks',
	chapterId: 'objects-and-state',
	referenceChapterId: 'classes-objects',
	title: 'Property hooks: computed properties',
	summary: 'Validate or compute values when a property is set or read.',
	goal: 'Use a set hook to normalize an assigned string.',
	programs: {
		sample: {
			code: "<?php\nclass Label\n{\n    public string $text {\n        set => trim($value);\n    }\n}\n\n$label = new Label();\n$label->text = '  New  ';\necho '[' . $label->text . ']';",
		},
		starter: {
			code: '<?php\nclass Temperature\n{\n    public float $celsius {\n        set => abs($value);\n    }\n}\n\n$temperature = new Temperature();\n$temperature->celsius = $input;\necho $temperature->celsius;',
			input: -5,
		},
		solution: {
			code: '<?php\nclass Temperature\n{\n    public float $celsius {\n        set => abs($value);\n    }\n}\n\n$temperature = new Temperature();\n$temperature->celsius = $input;\necho $temperature->celsius;',
			input: -5,
		},
		'exp-prefix-on-set': {
			code: "<?php\nclass Label\n{\n    public string $text {\n        set => 'Label: ' . trim($value);\n    }\n}\n$label = new Label();\n$label->text = '  New  ';\necho $label->text;",
		},
		'exp-bracket-on-get': {
			code: "<?php\nclass Label\n{\n    public string $text {\n        set => trim($value);\n        get => '[' . $this->text . ']';\n    }\n}\n$label = new Label();\n$label->text = '  New  ';\necho $label->text;",
		},
	},
	sampleProgramId: 'sample',
	sections: [
		{
			id: 'concept',
			title: 'Learn',
			blocks: [
				{
					type: 'paragraph',
					text: 'Use a set hook to normalize an assigned string.',
				},
				{
					type: 'paragraph',
					text: 'Property hooks were added in PHP 8.4. A set hook runs when a property is assigned; a get hook runs when it is read.',
				},
				{
					type: 'paragraph',
					text: 'The example uses the property’s backing value and trims surrounding whitespace during assignment.',
				},
				{
					type: 'paragraph',
					text: 'Inside a get hook, reading $this->text accesses the stored backing value without calling that get hook again.',
				},
			],
		},
		{
			id: 'example',
			title: 'Example',
			blocks: [
				{
					type: 'example',
				},
			],
		},
		{
			id: 'experiment',
			title: 'Experiment',
			blocks: [
				{
					type: 'experiments',
				},
			],
		},
	],
	exercise: {
		starterProgramId: 'starter',
		solutionProgramId: 'solution',
		prompt: 'Create a Temperature class with a Celsius property whose set hook stores the absolute value. Assign -5 and print it.',
		hint: 'Use a set hook expression with abs($value).',
		cases: [
			{
				id: 'negative-temperature',
				label: 'Negative temperature',
				input: -5,
				checkPhp:
					"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ((string) abs($input));\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
			},
			{
				id: 'lower-temperature',
				label: 'A different negative temperature',
				input: -12,
				checkPhp:
					"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ((string) abs($input));\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
			},
			{
				id: 'zero-temperature',
				label: 'Zero temperature',
				input: 0,
				checkPhp:
					"<?php\nreturn static function ($input, string $output, mixed $returnValue): array {\n    $passed = $output === ((string) abs($input));\n    return [\n        'passed' => $passed,\n        'message' => $passed ? 'Output matches.' : 'Output does not match this case.',\n    ];\n};",
			},
		],
	},
	references: [
		{
			title: 'PHP Manual: Property Hooks (PHP 8.4+)',
			url: 'https://www.php.net/manual/en/language.oop5.property-hooks.php',
		},
	],

	experiments: [
		{
			id: 'prefix-on-set',
			title: 'Add a prefix when setting',
			description:
				'Predict the property value after trimming and adding a prefix, select this experiment, then click Run.',
			programId: 'exp-prefix-on-set',
		},
		{
			id: 'bracket-on-get',
			title: 'Add brackets when reading',
			description:
				'Predict the property value after its get hook adds brackets, select this experiment, then click Run.',
			programId: 'exp-bracket-on-get',
		},
	],
};

const lessonsBySlug: Record<string, LessonSource> = Object.fromEntries(
	[...coreLessons, ...additionalLessons, enumLesson, propertyHooksLesson].map(
		(lesson) => [lesson.slug, lesson]
	)
);

function lesson(slug: string): LessonSource {
	const found = lessonsBySlug[slug];
	if (!found) throw new Error(`Missing tutorial lesson: ${slug}`);
	return found;
}

const curriculumOrder: readonly LessonSource[] = [
	lesson('output'),
	lesson('variables'),
	lesson('types'),
	lesson('constants'),
	lesson('arrays'),
	lesson('operators'),
	lesson('expressions'),
	lesson('conditionals'),
	lesson('loops'),
	lesson('string-functions'),
	lesson('functions'),
	lesson('format-full-name'),
	lesson('classes'),
	lesson('enums'),
	lesson('property-hooks'),
	lesson('errors'),
];

function atLeast(version: TutorialVersion, minimum: string): boolean {
	const [major, minor] = version.split('.').map(Number);
	const [minimumMajor, minimumMinor] = minimum.split('.').map(Number);
	return (
		major > minimumMajor ||
		(major === minimumMajor && minor >= minimumMinor)
	);
}

function mapProgramSources(
	lesson: LessonSource,
	transform: (programId: string, code: string) => string
): LessonSource {
	return {
		...lesson,
		programs: Object.fromEntries(
			Object.entries(lesson.programs).map(([id, program]) => [
				id,
				{ ...program, code: transform(id, program.code) },
			])
		),
	};
}

function preMatchConditionals(lesson: LessonSource): LessonSource {
	const legacyPrograms: Record<string, string> = {
		sample: `<?php
$temperature = 18;
if ($temperature >= 20) {
    echo 'Warm';
} else {
    echo 'Cool';
}
echo PHP_EOL;
$day = 'sat';
if ($day === 'sat' || $day === 'sun') {
    echo 'Weekend';
} else {
    echo 'Weekday';
}`,
		solution: `<?php
$level = $input;
if ($level === 'beginner') {
    echo 'Start here';
} else {
    echo 'Keep going';
}`,
		'exp-match-level': `<?php
$level = 'beginner';
if ($level === 'beginner') {
    $message = 'Start here';
} elseif ($level === 'experienced') {
    $message = 'Explore more';
} else {
    $message = 'Keep going';
}
echo $message;`,
		'exp-group-match-values': `<?php
$day = 'sat';
if ($day === 'sat' || $day === 'sun') {
    echo 'Weekend';
} else {
    echo 'Weekday';
}`,
	};
	const programs = { ...lesson.programs };
	for (const [id, code] of Object.entries(legacyPrograms)) {
		programs[id] = { ...programs[id], code };
	}
	return {
		...lesson,
		goal: 'Use if and elseif to select a result.',
		programs,
		sections: lesson.sections.map((section) => ({
			...section,
			blocks: section.blocks.map((block) => {
				if (block.type !== 'paragraph') return block;
				if (block.text === 'Use if and match to select a result.') {
					return {
						...block,
						text: 'Use if and elseif to select a result.',
					};
				}
				if (block.text.startsWith('The match expression')) {
					return {
						...block,
						text: 'Use === in if or elseif conditions when both value and type must match. The || operator means either condition can be true.',
					};
				}
				return block;
			}),
		})),
		exercise: {
			...lesson.exercise,
			prompt: 'Use if and elseif to print Start here for beginner and Keep going for other levels.',
			hint: 'Compare the input string with ===, then use else for the other values.',
		},
		references: lesson.references.filter(
			(reference) =>
				!reference.url.endsWith('/control-structures.match.php')
		),
		experiments: lesson.experiments.map((experiment) => {
			if (experiment.id === 'match-level') {
				return {
					...experiment,
					title: 'Choose a message with if and elseif',
					description:
						'Predict the message for beginner, select this experiment, then click Run.',
				};
			}
			if (experiment.id === 'group-match-values') {
				return {
					...experiment,
					title: 'Check two values with if',
					description:
						'Predict the message for Saturday, select this experiment, then click Run.',
				};
			}
			return experiment;
		}),
	};
}

function preScalarTypesFunctions(lesson: LessonSource): LessonSource {
	const replacements: Record<string, string> = {
		'function greeting(string $name): string': 'function greeting($name)',
		"function greeting(string $name, string $word = 'Hello'): string":
			"function greeting($name, $word = 'Hello')",
		'function square(int $number): int': 'function square($number)',
	};
	return {
		...mapProgramSources(lesson, (_id, code) => {
			let updated = code;
			for (const [typed, untyped] of Object.entries(replacements)) {
				updated = updated.replaceAll(typed, untyped);
			}
			return updated;
		}),
		goal: 'Write a function with a parameter and return value.',
		sections: lesson.sections.map((section) => ({
			...section,
			blocks: section.blocks.map((block) => {
				if (block.type !== 'paragraph') return block;
				if (
					block.text ===
					'Write a typed function with a parameter and return value.'
				) {
					return {
						...block,
						text: 'Write a function with a parameter and return value.',
					};
				}
				if (block.text.startsWith('Parameter and return types')) {
					return {
						...block,
						text: 'Scalar parameter and return type declarations were added in PHP 7.0; this PHP 5.6 lesson uses functions without type declarations.',
					};
				}
				return block;
			}),
		})),
		exercise: {
			...lesson.exercise,
			prompt: 'Write a square function that returns the number multiplied by itself, then print square(5).',
		},
	};
}

function preScalarTypesFullName(lesson: LessonSource): LessonSource {
	return {
		...mapProgramSources(lesson, (_id, code) =>
			code.replaceAll(
				'function formatFullName(string $firstName, string $lastName): string',
				'function formatFullName($firstName, $lastName)'
			)
		),
		exercise: {
			...lesson.exercise,
			prompt: lesson.exercise.prompt.replace(
				'formatFullName(string $firstName, string $lastName): string',
				'formatFullName($firstName, $lastName)'
			),
		},
	};
}

function classProgramForVersion(
	code: string,
	version: TutorialVersion
): string {
	let updated = code;
	if (!atLeast(version, '7.4')) {
		updated = updated
			.replaceAll('public int $value;', 'public $value;')
			.replaceAll('public string $name;', 'public $name;');
	}
	if (!atLeast(version, '7.1')) updated = updated.replaceAll('): void', ')');
	if (!atLeast(version, '7.0')) {
		updated = updated
			.replaceAll(
				'function __construct(int $start)',
				'function __construct($start)'
			)
			.replaceAll(
				'function __construct(string $name)',
				'function __construct($name)'
			)
			.replaceAll('function add(int $amount)', 'function add($amount)')
			.replaceAll('function greet(): string', 'function greet()')
			.replaceAll('function reset(): void', 'function reset()');
	}
	return updated;
}

function preTypedPropertiesClasses(
	lesson: LessonSource,
	version: TutorialVersion
): LessonSource {
	const adapted = mapProgramSources(lesson, (_id, code) =>
		classProgramForVersion(code, version)
	);
	if (atLeast(version, '7.1')) return adapted;
	return {
		...adapted,
		sections: adapted.sections.map((section) => ({
			...section,
			blocks: section.blocks.map((block) =>
				block.type === 'paragraph' &&
				block.text.includes('PHP 7.1+ can declare that with void.')
					? {
							...block,
							text: block.text.replace(
								'PHP 7.1+ can declare that with void.',
								'This version uses no return type; void declarations are available starting in PHP 7.1.'
							),
						}
					: block
			),
		})),
	};
}

function preIntdivErrors(lesson: LessonSource): LessonSource {
	return mapProgramSources(lesson, (_id, code) =>
		code
			.replaceAll(
				'function divide(int $left, int $right): int',
				'function divide($left, $right)'
			)
			.replaceAll(
				'return intdiv($left, $right);',
				'return $left / $right;'
			)
	);
}

function checkersForVersion(
	lesson: LessonSource,
	version: TutorialVersion
): LessonSource {
	if (atLeast(version, '8.0')) return lesson;
	const cases = lesson.exercise.cases.map((test) => ({
		...test,
		checkPhp: atLeast(version, '7.0')
			? test.checkPhp.replace(
					'string $output, mixed $returnValue',
					'string $output, $returnValue'
				)
			: test.checkPhp.replace(
					'($input, string $output, mixed $returnValue): array {',
					'($input, $output, $returnValue) {'
				),
	})) as Lesson['exercise']['cases'];
	return { ...lesson, exercise: { ...lesson.exercise, cases } };
}

function lessonForVersion(
	baseLesson: LessonSource,
	version: TutorialVersion
): LessonSource {
	let adapted = baseLesson;
	if (baseLesson.slug === 'conditionals' && !atLeast(version, '8.0')) {
		adapted = preMatchConditionals(adapted);
	}
	if (baseLesson.slug === 'functions' && !atLeast(version, '7.0')) {
		adapted = preScalarTypesFunctions(adapted);
	}
	if (baseLesson.slug === 'format-full-name' && !atLeast(version, '7.0')) {
		adapted = preScalarTypesFullName(adapted);
	}
	if (baseLesson.slug === 'classes') {
		adapted = preTypedPropertiesClasses(adapted, version);
	}
	if (baseLesson.slug === 'errors' && !atLeast(version, '7.0')) {
		adapted = preIntdivErrors(adapted);
	}
	return checkersForVersion(adapted, version);
}

function curriculumForVersion(version: TutorialVersion): readonly Lesson[] {
	return curriculumOrder
		.filter((entry) => {
			if (entry.slug === 'enums') return atLeast(version, '8.1');
			if (entry.slug === 'property-hooks') return atLeast(version, '8.4');
			return true;
		})
		.map((entry) =>
			withLearningNotes(lessonForVersion(entry, version), version)
		);
}

export const lessonsByVersion: Record<TutorialVersion, readonly Lesson[]> =
	Object.fromEntries(
		tutorialVersions.map((version) => [
			version,
			curriculumForVersion(version),
		])
	) as Record<TutorialVersion, readonly Lesson[]>;
