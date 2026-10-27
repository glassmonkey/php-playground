<?php
// PHP 8.1 syntax probe: readonly property.
class ReadonlyProbe {
    public readonly string $label;
    public function __construct(string $label) { $this->label = $label; }
}
