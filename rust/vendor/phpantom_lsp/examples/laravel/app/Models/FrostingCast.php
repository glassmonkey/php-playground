<?php

namespace App\Models;

class FrostingCast
{
    public function get($model, string $key, mixed $value, array $attributes): ?Frosting
    {
        return new Frosting((string) $value);
    }
}
