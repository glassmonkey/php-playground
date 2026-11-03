#!/usr/bin/env python3
"""Classify the complete public native probe, never just its failure count."""
import argparse
import json
from pathlib import Path
import re

TESTS = {
    'php74_cold_warm_builtin_and_sibling_resolve',
    'php85_cold_warm_builtin_and_sibling_resolve',
    'php74_same_name_user_function_and_local_symbols_survive',
    'php74_named_argument_feature_boundary',
    'php85_named_argument_feature_boundary',
    'php80_strrchr_parameter_boundary',
    'php83_strrchr_parameter_boundary',
}
KNOWN_TEST = 'php74_same_name_user_function_and_local_symbols_survive'
KNOWN_ASSERTION = 'PHP 7.4 same-name user documentation marker (known baseline)'


def classify(log, raw_exit):
    finishes = re.findall(r'^PHPANTOM_NATIVE_FINISH (\w+) failures=(\d+)$', log, re.M)
    outcomes = re.findall(r'^test (\w+) \.\.\. (ok|FAILED)$', log, re.M)
    summaries = re.findall(r'^test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; 0 ignored; 0 measured; 0 filtered out;', log, re.M)
    complete = (len(finishes) == 7 and {name for name, _ in finishes} == TESTS
                and len(outcomes) == 7 and {name for name, _ in outcomes} == TESTS
                and len(summaries) == 1)
    passed, failed = (int(summaries[0][1]), int(summaries[0][2])) if len(summaries) == 1 else (0, 0)
    failures = re.findall(r'^FAIL (.*)$', log, re.M)
    panics = re.findall(r"^thread '([^']+)' .*panicked at [^\n]+:\n([^\n]+)", log, re.M)
    known = (complete and raw_exit == 101 and summaries[0][0] == 'FAILED'
             and (passed, failed) == (6, 1)
             and dict(finishes) == {name: ('1' if name == KNOWN_TEST else '0') for name in TESTS}
             and dict(outcomes) == {name: ('FAILED' if name == KNOWN_TEST else 'ok') for name in TESTS}
             and len(failures) == 1 and failures[0].startswith(KNOWN_ASSERTION + ': actual=')
             and panics == [(KNOWN_TEST, 'PHPANTOM_NATIVE_ASSERTIONS_FAILED: 1 failed native checks: [')]
             and len(re.findall(r'panicked at', log)) == 1
             and log.index(f'PHPANTOM_NATIVE_FINISH {KNOWN_TEST} failures=1') < log.index('panicked at')
             and re.findall(r'\nfailures:\n((?:    \w+\n)+)\n', log) == [f'    {KNOWN_TEST}\n'])
    clean = (complete and raw_exit == 0 and summaries[0][0] == 'ok'
             and (passed, failed) == (7, 0) and not failures and 'panicked at' not in log
             and all(count == '0' for _, count in finishes)
             and all(status == 'ok' for _, status in outcomes))
    return {
        'nativeRawExit': raw_exit, 'nativePassed': passed, 'nativeFailed': failed,
        'knownLimitMatched': known, 'unexpectedFailures': 0 if known or clean else 1,
        'knownLimitAssertion': KNOWN_ASSERTION, 'knownLimitTest': KNOWN_TEST,
        'complete': complete, 'accepted': known or clean,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('log', type=Path)
    parser.add_argument('raw_exit', type=int)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = classify(args.log.read_text(), args.raw_exit)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    raise SystemExit(0 if result['accepted'] else 1)
