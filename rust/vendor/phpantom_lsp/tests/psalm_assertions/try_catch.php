<?php
// Source: Psalm TryCatchTest.php
// Auto-extracted by scripts/extract_psalm_tests.php
// Do not edit manually — re-run the extraction script instead.

// Test: tryCatchVar
namespace PsalmTest_try_catch_1 {
    try {
        $worked = true;
    }
    catch (\Exception $e) {
        $worked = false;
    }

    assertType('bool', $worked);
}

