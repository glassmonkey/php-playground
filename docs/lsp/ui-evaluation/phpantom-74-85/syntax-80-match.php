<?php
// PHP 8.0 syntax probe: match expression.
$status = 'draft';
$label = match ($status) {
    'draft' => 'Draft',
    default => 'Other',
};
