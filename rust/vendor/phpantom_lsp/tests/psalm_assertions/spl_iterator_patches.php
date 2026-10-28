<?php
// Test that iterator decorator patches propagate generic types.

/** @var ArrayIterator<int, string> $inner */

$cachingIter = new CachingIterator($inner);
$cachingValue = $cachingIter->current();
assertType('string', $cachingValue);

$infiniteIter = new InfiniteIterator($inner);
$infiniteValue = $infiniteIter->current();
assertType('string', $infiniteValue);

$limitIter = new LimitIterator($inner, 0, 10);
$limitValue = $limitIter->current();
assertType('string', $limitValue);

$noRewindIter = new NoRewindIterator($inner);
$noRewindValue = $noRewindIter->current();
assertType('string', $noRewindValue);

$cbFilterIter = new CallbackFilterIterator($inner, function ($v) { return true; });
$cbFilterValue = $cbFilterIter->current();
assertType('string', $cbFilterValue);

/** @var array<string, int> $typedArray */
$arrayIter = new ArrayIterator($typedArray);
assertType('ArrayIterator<string, int>', $arrayIter);
$arrayIterValue = $arrayIter->current();
assertType('int', $arrayIterValue);
