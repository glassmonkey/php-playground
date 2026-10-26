<?php
// PHP 8.0 syntax probe: nullsafe operator.
class SessionProbe { public ?object $user = null; }
$session = new SessionProbe();
$user = $session?->user;
