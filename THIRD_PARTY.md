# Third-party provenance

This kit adapts the task/evaluation infrastructure of
[cheikh025/organon](https://github.com/cheikh025/organon), pinned to commit
`fcd1e501ee589d363766136aceb60527a0f06b12`.

- `tasks/ale_bench/` and `tasks/evaluator_sources.json` are copied unchanged.
- `plugins/dsh-greedy/upstream/organon/src/` contains seven unchanged modules.
  Only the persona/instruction exports of `providers/mutate.js` are used;
  its worker implementation is not invoked.
- `provenance/organon-snapshot.json` records the original downloaded snapshot;
  not every file in that acquisition manifest is redistributed in this kit.
- `plugins/dsh-greedy/upstream/organon/SOURCE.json` records the reused module hashes.
- `setup.sh` follows Organon's installation conventions, restricted to DSH,
  this greedy plugin, and ALE-Bench.

The downloaded Organon snapshot did not include a root LICENSE file. This kit
does not assign a replacement license to upstream code, task statements, or
benchmark data. Upstream attribution and notices are retained. ALE-Bench and
DeepSeek Harness are fetched separately and retain their own licenses.

The fixed greedy loop and one-shot generation adapter replace Organon's RSI and
worker orchestration. This is an independent kit, not an official Organon or
DeepSeek distribution.
