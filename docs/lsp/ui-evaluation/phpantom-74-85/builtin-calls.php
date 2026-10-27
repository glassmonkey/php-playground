<?php
// PHP 7.4 parses these calls as ordinary function calls; builtin availability differs by target version.
str_contains('php', 'p');
json_validate('{"php": 8}');
array_find([1, 2], static fn (int $value): bool => $value > 1);
array_is_list([1, 2]);
array_first(['first', 'last']);
array_last(['first', 'last']);
