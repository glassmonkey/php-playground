# State-transition run; stale replay excluded

The `completion-off-no-retry` and `version-84-no-retry-85-recovery` traces are used in the report: OFF recorded no later completion/didChange before reinitialization and a fresh natural `str_` recovered; PHP 8.4 recorded no completion request and PHP 8.5 natural `str_` recovered.

The `stale-cancel-recovery` trace in this run deliberately replayed a held Worker response through a synthetic event but produced no current-version request. That harness case is excluded. The actual slow natural-input stale response discard and automatic retry are evidenced by the source trace in run `14-35-23-888Z`.
