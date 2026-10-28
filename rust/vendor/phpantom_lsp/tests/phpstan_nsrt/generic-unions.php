<?php

namespace GenericUnions;

use function PHPStan\Testing\assertType;

class Foo
{

	/**
	 * @template T
	 * @param T|null $p
	 * @return T
	 */
	public function doFoo($p)
	{
		if ($p === null) {
			throw new \Exception();
		}

		return $p;
	}

	/**
	 * @template T
	 * @param T $p
	 * @return T
	 */
	public function doBar($p)
	{
		return $p;
	}

	/**
	 * @template T
	 * @param T|int|float $p
	 * @return T
	 */
	public function doBaz($p)
	{
		return $p;
	}

	/**
	 * @param int|string $stringOrInt
	 */
	public function testDoFoo(
		?string $nullableString,
		$stringOrInt,
		string $plainString,
		int $plainInt
	): void
	{
		// doFoo has @param T|null, @return T — should strip null from the union
		
		assertType('string', $this->doFoo($plainString));
		assertType('int', $this->doFoo($plainInt));
		
	}

	/**
	 * @param int|string $stringOrInt
	 */
	public function testDoBar(
		?string $nullableString,
		string $plainString,
		int $plainInt
	): void
	{
		// doBar has @param T, @return T — identity, preserves the full type
		assertType('string|null', $this->doBar($nullableString));
		assertType('string', $this->doBar($plainString));
		assertType('int', $this->doBar($plainInt));
		
	}

	/**
	 * @param int|string $stringOrInt
	 */
	public function testDoBaz(
		string $plainString,
		int $plainInt,
		float $plainFloat,
		$stringOrInt
	): void
	{
		// doBaz has @param T|int|float, @return T — strips int|float from T
		
		
		
		
		assertType('string', $this->doBaz($plainString));
		assertType('int', $this->doBaz($plainInt));
		assertType('float', $this->doBaz($plainFloat));
	}

}

/**
 * @template TGetDefault
 * @template TKey
 *
 * @param  TKey  $key
 * @param  TGetDefault  $default
 * @return TKey|TGetDefault
 */
function getWithDefault($key, $default = null)
{
	if (rand(0, 10) > 5) {
		return $key;
	}

	return $default;
}

function testGetWithDefault(
	string $str,
	int $num
): void
{
	
	assertType('int|string', getWithDefault($num, $str));
	assertType('int|string', getWithDefault($str, $num));
	
}