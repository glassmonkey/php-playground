import type { Program } from '../types';

// Independently reviewed programs demonstrating each semantic variant.
export const conditionalPrograms = {
	'if-elseif': {
		code: `<?php
$level = 'beginner';
if ($level === 'beginner') {
    $message = 'Start here';
} elseif ($level === 'experienced') {
    $message = 'Explore more';
} else {
    $message = 'Keep going';
}
echo $message;`,
	},
	match: {
		code: `<?php
$level = 'beginner';
$message = match ($level) {
    'beginner' => 'Start here',
    'experienced' => 'Explore more',
    default => 'Keep going',
};
echo $message;`,
	},
} satisfies Record<string, Program>;

export const divisionPrograms = {
	quotient: {
		code: `<?php
function divide($left, $right)
{
    if ($right === 0) {
        throw new InvalidArgumentException('The divisor must not be zero.');
    }
    return $left / $right;
}
try {
    echo divide(12, 3);
} catch (InvalidArgumentException $error) {
    echo $error->getMessage();
}`,
	},
	integer: {
		code: `<?php
function divide(int $left, int $right): int
{
    if ($right === 0) {
        throw new InvalidArgumentException('The divisor must not be zero.');
    }
    return intdiv($left, $right);
}
try {
    echo divide(12, 3);
} catch (InvalidArgumentException $error) {
    echo $error->getMessage();
}`,
	},
} satisfies Record<string, Program>;
