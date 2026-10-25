# Partial run, superseded

The line and position association was corrected, but the slow `str_` case was sampled after a fixed 1.8-second wait before the old partial-prefix response had completed. It therefore records no final-version request/response or rows for that case. Later runs separately record the 1.8-second user-visible boundary and the eventual retry after the old response; use those for interpretation.
