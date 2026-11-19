<?php
#[\Attribute(\Attribute::TARGET_CLASS)] class FixtureClass {}
#[\Attribute(\Attribute::TARGET_FUNCTION)] class FixtureFunction {}
#[\Attribute(\Attribute::TARGET_METHOD)] class FixtureMethod {}
#[\Attribute(\Attribute::TARGET_PROPERTY)] class FixtureProperty {}
#[\Attribute(\Attribute::TARGET_CLASS_CONSTANT)] class FixtureConstant {}
#[\Attribute(\Attribute::TARGET_PARAMETER)] class FixtureParameter {}
class TypeTarget {}
class Box { public string $property="value"; public function call(int $count) {} }
