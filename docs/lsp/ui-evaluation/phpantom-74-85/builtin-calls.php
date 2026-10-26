<?php
// PHP 7.4 parses these calls as ordinary function calls; builtin availability differs by target version.
str_contains('php', 'p');
array_is_list([1, 2]);
array_first(['first', 'last']);
array_last(['first', 'last']);
