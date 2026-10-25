# Exploratory state run, excluded

The state runner waited for the held response before typing the remaining `tr_`, so that input did not overlap the pending completion. It also did not recognize an already-present fixture after PHP 8.5 restore. Do not use the synthetic stale-response result. The later state run is used for Completion OFF and 8.4/8.5 transitions.
