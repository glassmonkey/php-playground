# PHPantom — Bug Fixes

Every bug below must be fixed at its root cause. "Detect the
symptom and suppress the diagnostic" is not an acceptable fix.
If the type resolution pipeline produces wrong data, fix the
pipeline so it produces correct data. Downstream consumers
(diagnostics, hover, completion, definition) should never need
to second-guess upstream output.

Each entry below carries an **Impact · Complexity** rating using the same
scale defined in [`docs/todo.md`](../todo.md), but a bug's row lives
**here only** — do not add or link a bug entry to `docs/todo.md`'s sprint
or backlog tables. This file is its own list, not a domain document
sprint items draw from: whenever it holds anything, that is actively
addressed, independently of sprint planning.

Bugs land here from wherever they surface: found while working on another
task, or sweeps of the sample projects under `projects/`. Entries are
grouped by the mechanism that has to change, not by the symptom that
surfaced: one entry is one root cause, however many shapes it shows up in.

## Crashes

No outstanding items.

## Type comparison

No outstanding items.

## Standard-library return types

No outstanding items.

## Reachability

No outstanding items.

## Narrowing

No outstanding items.

## Array types

No outstanding items.

## Laravel

No outstanding items.

## Blade

No outstanding items.

## Templates

No outstanding items.

## Name resolution

### B677. `unset` in a `@var` union is resolved as a class name

**Impact: Medium · Complexity: Low-Medium**

```php
/** @var \DateTime|unset $guarded */          // reported: Class 'App\unset' not found
if (isset($guarded)) {
    echo date_format($guarded, 'Y-m-d');      // reported: App\unset does not satisfy DateTimeInterface
}
```

`unset` in a docblock union is the Blade-view idiom for "this variable
may not be defined at all" (issue #366). We resolve the spelling against
the current namespace like any class name, so every such `@var` is an
`unknown_class`, and the phantom class then rides along in the variable's
type: `isset()` does not remove it, so the guarded call still reports an
argument mismatch.

`unset` has to be a docblock keyword (`php_type/keywords.rs`) rather than
a class name, and the type it stands for has to be something `isset()`
narrows away. The simplest honest reading is `null`: `\DateTime|unset`
becomes `?\DateTime`, which the existing `isset()`/`!== null` narrowing
already handles. A true possibly-undefined state would be more precise,
but nothing downstream needs it to make the guarded reads correct.

Found running the php-typing-conformance suite
(`regressions_unset_pseudo_type.php`). Phpactor, Intelephense, devsense
and Qodana all pass it.

## Code actions

No outstanding items.

## Miscellaneous

No outstanding items.
