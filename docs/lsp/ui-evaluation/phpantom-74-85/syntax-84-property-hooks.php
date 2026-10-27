<?php
// PHP 8.4 syntax probe: property hooks.
class PersonProbe {
    public string $name {
        get => $this->storedName;
        set => $this->storedName = ucfirst(strtolower($value));
    }
    private string $storedName = '';
}
