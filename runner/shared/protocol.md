# Runner protocol v1

The API writes one UTF-8 JSON object to the runner's standard input. The runner
returns exactly one JSON object to standard output. User program output is
redirected to bounded files inside `/work`, so it cannot corrupt this channel.

The request contains `runId`, `source`, `languageMode`, optional predeclared
`stdin`, and server-controlled `limits`. The response contains compilation
metadata, raw debugger records, runtime termination, toolchain identity and
timings. The API validates and normalizes this result before exposing it.

The container receives no database URL, cloud credentials, API secret or host
filesystem mount. Its network namespace is disabled by the orchestrator.
