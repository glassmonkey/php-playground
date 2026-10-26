<?php
// PHP 8.1 syntax probe: enum declaration and case resolution.
enum Status { case Draft; case Published; }
$current = Status::Draft;
