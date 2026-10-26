<?php
// PHP 8.0 syntax probe: named arguments.
function greetUser(string $name = 'Guest'): string { return 'Hello ' . $name; }
greetUser(name: 'Ada');
