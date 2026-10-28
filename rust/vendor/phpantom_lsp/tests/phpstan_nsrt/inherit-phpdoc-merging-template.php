<?php declare(strict_types = 1);

namespace InheritDocMergingTemplate;

use function PHPStan\Testing\assertType;

/**
 * @template T
 * @template U
 */
class Foo
{

	/**
	 * @param T $a
	 * @param U $b
	 * @return T|array<U>
	 */
	public function doFoo($a, $b)
	{

	}

}

class Bar extends Foo
{

	public function doFoo($a, $b)
	{
		
		
		
	}

	public function doBar()
	{
		
		
	}

}

/**
 * @template T of object
 */
class Baz
{

	/**
	 * @param T $a
	 */
	public function doFoo($a)
	{

	}

}

class Lorem extends Baz
{

	public function doFoo($a)
	{
		// No @extends annotation, so T falls back to its bound: object
		assertType('object', $a);
	}

}

/**
 * @extends Baz<\stdClass>
 */
class Ipsum extends Baz
{

	public function doFoo($a)
	{
		// @extends Baz<\stdClass> substitutes T → stdClass
		assertType('stdClass', $a);
	}

}

/**
 * @template X
 * @template Y
 */
class Multi
{

	/**
	 * @param X $x
	 * @param Y $y
	 * @return X
	 */
	public function process($x, $y)
	{

	}

}

/**
 * @extends Multi<int, string>
 */
class ConcreteMulti extends Multi
{

	public function process($x, $y)
	{
		// @extends Multi<int, string> substitutes X → int, Y → string
		assertType('int', $x);
		assertType('string', $y);
	}

}

/**
 * @template V of \Countable
 */
class Bounded
{

	/**
	 * @param V $v
	 * @return V
	 */
	public function take($v)
	{

	}

}

class UnboundedChild extends Bounded
{

	public function take($v)
	{
		// No @extends, falls back to the bound
		assertType('Countable', $v);
	}

}

/**
 * @extends Bounded<\ArrayObject>
 */
class BoundedChild extends Bounded
{

	public function take($v)
	{
		// @extends Bounded<\ArrayObject> substitutes V → ArrayObject
		assertType('ArrayObject', $v);
	}

}