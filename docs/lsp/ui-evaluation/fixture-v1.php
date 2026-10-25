<?php
function greetUser(string $name = 'Guest'): string { return 'Hello ' . $name; }
function addNumbers(int $left, int $right): int { return $left + $right; }
class Greeter { public string $message; public function greet(): string { return 'hi'; } }
$greeting = greetUser('A');
$greeter = new Greeter();
$number = 1;
