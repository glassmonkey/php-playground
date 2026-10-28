<?php

namespace App\Models;

enum OrderStatus: string
{
    case Pending = 'pending';
    case Processing = 'processing';
    case Completed = 'completed';
    case Cancelled = 'cancelled';

    public function label(): string { return $this->value; }
    public function isPending(): bool { return $this === self::Pending; }
}
