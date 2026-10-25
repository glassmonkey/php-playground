# Fixed 1.8-second pause observation

This run records the natural input state 1.8 seconds after typing stopped. It is useful for the acceptance-time observation: for slow `str_` (160 ms/character), only the partial `s` request at line 7 / character 1 existed, no response had arrived, and the suggest widget had zero rows. The same run's other cases completed. It does not establish that no later retry occurs. The extended-wait run `phpactor-natural-after-fix-2026-10-25T14-35-23-888Z/` captures the stale response discard and eventual latest-version retry.
