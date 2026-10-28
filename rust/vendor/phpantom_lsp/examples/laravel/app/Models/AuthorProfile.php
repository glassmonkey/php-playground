<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuthorProfile extends Model
{
    public function getBio(): string { return ''; }
    public function getAvatar(): string { return ''; }
}
