<?php

namespace App\Models;

class Frosting
{
    public function __construct(private string $flavor = '') {}
    public function getFlavor(): string { return $this->flavor; }
    public function isSweet(): bool { return $this->flavor !== ''; }
    public function __toString(): string { return $this->flavor; }
}
