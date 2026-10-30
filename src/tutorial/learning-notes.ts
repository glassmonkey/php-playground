import type {
	ExperimentLearning,
	Lesson,
	LessonLearning,
	LessonSource,
} from './types';
import type { TutorialVersion } from './config';

type Notes = LessonLearning & {
	experiments: Record<string, Omit<ExperimentLearning, 'goalRef'>>;
};

// Author/reviewer notes, not a second copy of code, prose or expected output.
// Version-dependent reasons are selected alongside the resolved source below.
const notes: Record<string, Notes> = {
	output: {
		prerequisiteLessons: [],
		exampleReason:
			'PHP executes statements inside its opening tag; comments do not write output. Concatenation joins the greeting parts.',
		misconceptions: [
			{
				belief: 'A comment is printed with the code.',
				correction:
					'Only output-producing constructs such as echo write the greeting; comments are ignored.',
			},
		],
		experiments: {
			'personalized-greeting': {
				change: 'Use a different name and double-quoted interpolation.',
				observe: 'Which name appears inside the greeting.',
				reason: 'Interpolation reads the current value of the variable inside the double-quoted string.',
			},
			'two-line-welcome': {
				change: 'Add a second echo and a PHP_EOL separator.',
				observe: 'The line boundary between the two messages.',
				reason: 'Separate echo statements do not imply a line break; PHP_EOL writes the separator explicitly.',
			},
		},
	},
	variables: {
		prerequisiteLessons: ['output'],
		exampleReason:
			'Each assignment replaces the current value; var_dump inspects the value at the point where it is called.',
		misconceptions: [
			{
				belief: 'Reassignment changes output already printed.',
				correction:
					'Earlier output remains; later reads use the new value.',
			},
		],
		experiments: {
			'reassign-price': {
				change: 'Assign a new price before inspecting it.',
				observe: 'The type and current value at the final read.',
				reason: 'The second assignment replaces the earlier float value.',
			},
			'reassign-name': {
				change: 'Read the name both before and after reassignment.',
				observe: 'Whether both printed names change.',
				reason: 'Each echo reads the variable at that moment; reassignment cannot rewrite previous output.',
			},
		},
	},
	types: {
		prerequisiteLessons: ['variables'],
		exampleReason:
			'var_dump reports both type and value for each argument, so different kinds of data remain distinguishable.',
		misconceptions: [
			{
				belief: 'Null and integer zero are the same value.',
				correction:
					'Null represents absence of a value; zero is an integer value.',
			},
		],
		experiments: {
			'scalar-values': {
				change: 'Inspect literal values rather than named variables.',
				observe: 'The distinct type labels for the arguments.',
				reason: 'Values have types whether supplied literally or through variables.',
			},
			'null-zero': {
				change: 'Replace null with integer zero.',
				observe: 'How the type label changes.',
				reason: 'Assignment stores the new value and its type; null does not become a numeric zero.',
			},
		},
	},
	constants: {
		prerequisiteLessons: ['types'],
		exampleReason:
			'const binds a name to a value that is read without a dollar sign.',
		misconceptions: [
			{
				belief: 'A constant is read using a dollar sign like a variable.',
				correction:
					'A constant name is used directly; a dollar-prefixed name denotes a variable instead.',
			},
		],
		experiments: {
			'currency-constant': {
				change: 'Define a string constant instead of a numeric constant.',
				observe:
					'Whether reading the constant prints its stored string.',
				reason: 'A const declaration can bind a string value as well as a number.',
			},
			'constant-array': {
				change: 'Store several colors in a constant array and read index 1.',
				observe: 'Which color occupies the selected index.',
				reason: 'An automatically numbered array starts at index 0, so index 1 selects its second element.',
			},
		},
	},
	arrays: {
		prerequisiteLessons: ['variables', 'constants'],
		exampleReason:
			'An indexed assignment updates one entry, an empty index appends, and named keys read the matching stored values.',
		misconceptions: [
			{
				belief: 'The first element of an automatically indexed array has index 1.',
				correction: 'Automatic numeric indexing starts at 0.',
			},
		],
		experiments: {
			'nested-address': {
				change: 'Put the city inside an address array.',
				observe: 'The two key lookups needed to read the city.',
				reason: 'The first key retrieves the nested array; the second retrieves its city entry.',
			},
			'numbered-scores': {
				change: 'Read three explicit numeric indexes.',
				observe: 'The order of entries selected by indexes 0, 1 and 2.',
				reason: 'Each index identifies one position in the automatically numbered array.',
			},
		},
	},
	operators: {
		prerequisiteLessons: ['types'],
		exampleReason:
			'Multiplication produces the total, then comparison produces a boolean rather than changing the total.',
		misconceptions: [
			{
				belief: 'A comparison assigns a new numeric total.',
				correction:
					'A comparison evaluates to a boolean; assignment uses the separate = operator.',
			},
		],
		experiments: {
			'subtract-discount': {
				change: 'Subtract a fixed discount after multiplication.',
				observe: 'The total after both arithmetic steps.',
				reason: 'The discounted value is computed from the already calculated total.',
			},
			'compare-threshold': {
				change: 'Use an inclusive threshold comparison.',
				observe: 'The boolean type and truth value.',
				reason: 'The >= operator is true when the left value is greater than or equal to the right value.',
			},
		},
	},
	expressions: {
		prerequisiteLessons: ['operators'],
		exampleReason:
			'Parentheses group the addition so its result becomes an operand of multiplication.',
		misconceptions: [
			{
				belief: 'Every arithmetic expression is evaluated strictly left to right.',
				correction:
					'Operator precedence affects grouping; explicit parentheses can change that grouping.',
			},
		],
		experiments: {
			precedence: {
				change: 'Remove the parentheses around addition.',
				observe: 'Whether the result differs from the Example.',
				reason: 'Multiplication has higher precedence than addition, so only delivery is doubled in this expression.',
			},
			'combine-results': {
				change: 'Replace the fixed multiplier with an item-count variable.',
				observe: 'How the grouped cost and item count combine.',
				reason: 'Grouping is unchanged when an operand comes from a variable rather than a literal.',
			},
		},
	},
	conditionals: {
		prerequisiteLessons: ['expressions'],
		exampleReason:
			'The if condition chooses one branch; match uses strict comparison and returns the value from the selected arm.',
		misconceptions: [
			{
				belief: 'A match arm compares values using loose equality.',
				correction:
					'match compares both type and value using strict identity.',
			},
		],
		experiments: {
			'match-level': {
				change: 'Select a message from a level value.',
				observe: 'Which message belongs to the selected level.',
				reason: 'match returns the arm whose value is strictly identical to the level, or default when none matches.',
			},
			'group-match-values': {
				change: 'Group two day values into a single arm.',
				observe:
					'Whether either weekend value selects the same message.',
				reason: 'Comma-separated match conditions share the arm result; unmatched values select default.',
			},
		},
	},
	loops: {
		prerequisiteLessons: ['arrays', 'conditionals'],
		exampleReason:
			'foreach visits each task, while the countdown repeats only while its condition remains true and its counter decreases.',
		misconceptions: [
			{
				belief: 'A while loop automatically moves its counter toward termination.',
				correction:
					'The body must change the state used by the condition when termination depends on it.',
			},
		],
		experiments: {
			'count-with-for': {
				change: 'Keep initialization, condition and increment in a for header.',
				observe: 'Which values satisfy the inclusive upper bound.',
				reason: 'The condition is checked before each iteration and the increment runs after its body.',
			},
			'even-countdown': {
				change: 'Filter countdown values using a remainder test.',
				observe:
					'Which iterations produce output rather than only updating the counter.',
				reason: 'Remainder zero identifies even integers; the decrement still runs on every iteration.',
			},
		},
	},
	'string-functions': {
		prerequisiteLessons: ['types'],
		exampleReason:
			'trim removes outer whitespace; the surrounding brackets make the string boundaries visible.',
		misconceptions: [
			{
				belief: 'trim removes all spaces throughout a string.',
				correction:
					'trim removes matching characters at the ends, preserving the interior space in this example.',
			},
		],
		experiments: {
			'uppercase-ascii': {
				change: 'Call strtoupper on ASCII letters.',
				observe: 'The case of the returned letters.',
				reason: 'strtoupper returns the uppercase form of the ASCII text.',
			},
			'trim-and-uppercase': {
				change: 'Pass the result of trim into strtoupper.',
				observe: 'Both the remaining boundaries and letter case.',
				reason: 'The inner call returns the trimmed text that the outer call then uppercases.',
			},
		},
	},
	functions: {
		prerequisiteLessons: ['string-functions', 'loops'],
		exampleReason:
			'The call binds its argument to the parameter; return supplies the greeting for echo to print.',
		misconceptions: [
			{
				belief: 'Returning a string automatically prints it.',
				correction:
					'return supplies a value to the caller; echo prints that returned value here.',
			},
		],
		experiments: {
			'default-greeting': {
				change: 'Add an optional greeting word with a default.',
				observe:
					'The difference between omitting and supplying the second argument.',
				reason: 'The default is used only when that argument is omitted; an explicit argument replaces it for that call.',
			},
			'greet-each-name': {
				change: 'Call the same function for each name in an array.',
				observe: 'How each argument produces a separate greeting.',
				reason: 'Each iteration passes its current name into a fresh call of the function.',
			},
		},
	},
	'format-full-name': {
		prerequisiteLessons: ['functions', 'conditionals'],
		exampleReason:
			'Both names are trimmed before empty-part checks; early returns avoid inserting an unwanted separator.',
		misconceptions: [
			{
				belief: 'A whitespace-only name is already an empty string.',
				correction:
					'It becomes empty after trim, which is why normalization precedes the checks.',
			},
		],
		experiments: {
			'whitespace-first-name': {
				change: 'Supply only spaces for the first name.',
				observe:
					'Whether the result has an unwanted leading separator.',
				reason: 'Trimming makes the first part empty and its early return supplies only the last name.',
			},
			'empty-name-parts': {
				change: 'Supply two empty strings and surround the result with brackets.',
				observe: 'Whether anything appears between the brackets.',
				reason: 'The first empty-part branch returns the last part, which is also empty.',
			},
		},
	},
	classes: {
		prerequisiteLessons: ['functions'],
		exampleReason:
			'Construction initializes an object property; the method updates that object through $this.',
		misconceptions: [
			{
				belief: 'Two new instances automatically share their property values.',
				correction:
					'Each new Counter has its own state; a method updates the instance on which it is called.',
			},
		],
		experiments: {
			'two-counters': {
				change: 'Create and update two separate Counter objects.',
				observe: 'Whether updating one counter changes the other.',
				reason: 'Each new expression creates a distinct instance with independently initialized state.',
			},
			'reset-counter': {
				change: 'Add a reset method and call it after incrementing.',
				observe: 'Which mutation determines the final property value.',
				reason: 'reset assigns zero to the current instance after add has already run.',
			},
		},
	},
	enums: {
		prerequisiteLessons: ['classes', 'conditionals', 'loops'],
		exampleReason:
			'An enum case is an object from a closed set; its value property exposes the declared backing string.',
		misconceptions: [
			{
				belief: 'A backed enum case is just its backing string.',
				correction:
					'The case and its backing value are distinct; ->value reads the string from the case.',
			},
		],
		experiments: {
			'match-enum-cases': {
				change: 'Use enum cases as match conditions.',
				observe: 'The label associated with the selected case.',
				reason: 'The selected case is compared with the case objects listed in the match arms.',
			},
			'list-enum-cases': {
				change: 'Iterate the cases returned by cases().',
				observe: 'The backing values and their order.',
				reason: 'cases() returns all cases in declaration order; each ->value reads that case backing value.',
			},
		},
	},
	'property-hooks': {
		prerequisiteLessons: ['classes', 'string-functions'],
		exampleReason:
			'The set hook trims the incoming value before it is stored in the backed property.',
		misconceptions: [
			{
				belief: 'A set hook only changes how a property is displayed.',
				correction:
					'The set hook transforms assignment; the get hook controls reads.',
			},
		],
		experiments: {
			'prefix-on-set': {
				change: 'Add a prefix inside the set hook.',
				observe:
					'Whether the assigned value is normalized before the prefix is added.',
				reason: 'The hook stores the result of concatenating the prefix with the trimmed input.',
			},
			'bracket-on-get': {
				change: 'Add a get hook that surrounds the stored text.',
				observe:
					'How reading differs from the value normalized during assignment.',
				reason: 'The set hook trims on assignment; the get hook formats the backed value on each read.',
			},
		},
	},
	errors: {
		prerequisiteLessons: ['functions', 'conditionals', 'classes'],
		exampleReason:
			'The zero-divisor check throws before division; the matching catch prints the exception message.',
		misconceptions: [
			{
				belief: 'Execution continues at the statement after throw inside the try block.',
				correction:
					'A thrown exception transfers control to a matching catch; the remaining statements in that try path are skipped.',
			},
		],
		experiments: {
			'successful-division': {
				change: 'Supply a nonzero divisor.',
				observe:
					'Whether normal return or the catch path produces the output.',
				reason: 'The guard does not throw, so integer division returns a value and catch is skipped.',
			},
			'finally-message': {
				change: 'Add a finally block after catch.',
				observe:
					'The order of the error message and the completion line.',
				reason: 'After the exception is caught, finally runs as control leaves this try/catch construct.',
			},
		},
	},
};

export function withLearningNotes(
	source: LessonSource,
	version: TutorialVersion
): Lesson {
	let selected = notes[source.slug];
	if (!selected) throw new Error(`Missing learning notes: ${source.slug}`);
	if (source.slug === 'conditionals' && Number(version.split('.')[0]) < 8) {
		selected = {
			...selected,
			exampleReason:
				'The first true if or elseif condition selects a branch; === compares both type and value, and || combines alternative day checks.',
			misconceptions: [
				{
					belief: 'Every elseif branch runs after a true if branch.',
					correction:
						'Only the first matching branch in one if/elseif/else chain executes.',
				},
			],
			experiments: {
				'match-level': {
					change: 'Choose a message using if and elseif.',
					observe: 'Which branch is selected by the current level.',
					reason: 'The first strict equality condition that is true supplies the message; else handles the remaining values.',
				},
				'group-match-values': {
					change: 'Combine two strict day checks with ||.',
					observe:
						'Whether either weekend value selects the same branch.',
					reason: 'Logical OR is true when at least one strict day comparison is true.',
				},
			},
		};
	}
	if (source.slug === 'errors' && Number(version.split('.')[0]) < 7) {
		selected = {
			...selected,
			experiments: {
				...selected.experiments,
				'successful-division': {
					...selected.experiments['successful-division'],
					reason: 'The guard does not throw, so / returns the quotient and catch is skipped. Unlike intdiv, / does not truncate a non-integral quotient.',
				},
			},
		};
	}
	const { experiments, ...learning } = selected;
	if (Object.keys(experiments).length !== source.experiments.length)
		throw new Error(`Learning experiment count mismatch: ${source.slug}`);
	return {
		...source,
		learning,
		experiments: source.experiments.map((experiment) => {
			const intent = experiments[experiment.id];
			if (!intent)
				throw new Error(
					`Missing learning notes: ${source.slug}/${experiment.id}`
				);
			return {
				...experiment,
				learning: { goalRef: 'lesson.goal', ...intent },
			};
		}),
	};
}
