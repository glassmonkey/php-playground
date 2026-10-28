<?php

namespace IssetNarrowing;

use function PHPStan\Testing\assertType;

class Foo
{
	public function fooMethod(): void {}
}

class Bar
{
	public function barMethod(): void {}
}

class Holder
{
	public ?Foo $prop = null;
	public ?Bar $bar = null;
}

/**
 * @param Foo|null $nullable
 */
function issetNarrowsNullable(?Foo $nullable): void
{
	if (isset($nullable)) {
		assertType('Foo', $nullable);
	}
}

/**
 * @param Foo|null $nullable
 */
function notIssetNarrowsToNull(?Foo $nullable): void
{
	if (!isset($nullable)) {
		assertType('null', $nullable);
	}
}

/**
 * @param Foo|null $nullable
 */
function issetElseBranch(?Foo $nullable): void
{
	if (isset($nullable)) {
		assertType('Foo', $nullable);
	} else {
		assertType('null', $nullable);
	}
}

/**
 * @param Foo|null $nullable
 */
function issetEarlyReturn(?Foo $nullable): void
{
	if (!isset($nullable)) {
		return;
	}

	assertType('Foo', $nullable);
}

/**
 * @param Foo|null $a
 * @param Bar|null $b
 */
function multipleIsset(?Foo $a, ?Bar $b): void
{
	if (isset($a)) {
		assertType('Foo', $a);
	}

	if (isset($b)) {
		assertType('Bar', $b);
	}
}

/**
 * @param Foo|null $a
 * @param Bar|null $b
 */
function issetBothParams(?Foo $a, ?Bar $b): void
{
	if (isset($a) && isset($b)) {
		assertType('Foo', $a);
		assertType('Bar', $b);
	}
}

/**
 * @param Foo|null $nullable
 */
function nullCoalescingBasic(?Foo $nullable): void
{
	$result = $nullable ?? new Bar();
	assertType('Bar|Foo', $result);
}

function issetOnProperty(Holder $holder): void
{
	if (isset($holder->prop)) {
		assertType('Foo', $holder->prop);
	}
}

/**
 * @param string|null $nullable
 */
function issetNarrowsString(?string $nullable): void
{
	if (isset($nullable)) {
		assertType('string', $nullable);
	}
}

/**
 * @param int|null $nullable
 */
function issetNarrowsInt(?int $nullable): void
{
	if (isset($nullable)) {
		assertType('int', $nullable);
	}
}

/**
 * @param Foo|null $nullable
 */
function issetAssignment(?Foo $nullable): void
{
	if (isset($nullable)) {
		$foo = $nullable;
		assertType('Foo', $foo);
	}
}

/**
 * @param Foo|null $nullable
 */
function issetNegatedEarlyReturnElse(?Foo $nullable): void
{
	if (isset($nullable)) {
		assertType('Foo', $nullable);
		return;
	}

	assertType('null', $nullable);
}

/**
 * @param Foo|Bar|null $union
 */
function issetOnUnionWithNull($union): void
{
	if (isset($union)) {
		assertType('Bar|Foo', $union);
	}
}

/**
 * @param array|null $nullable
 */
function issetNarrowsArray(?array $nullable): void
{
	if (isset($nullable)) {
		assertType('array', $nullable);
	}
}