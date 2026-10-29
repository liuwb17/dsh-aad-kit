# dsh-aad-greedy 0.1.0

Fixed greedy Bo4 plugin for DeepSeek Harness 0.1.7-rc.1.

Install `dist/dsh-aad-greedy-0.1.0.tgz` with `dsh plugin --profile greedy add`.
The kit's root README and setup.sh describe the complete installation.

Tools: greedy_run({max_budget, candidates?, resume?}), greedy_status(), greedy_pause().
The session cwd must contain an Organon C++ task: task.json, statement.md,
solution.cpp, evaluator/evaluator.py. The model is inherited from the session.

Uses unchanged Organon budget, candidates, population, files, and evaluator
modules. Reuses the default worker prompt but generates with one ctx.llm call.
No RSI, worker agent, strategy editing, token-budget cap or private evaluation.

Run `npm test` for offline unit tests. `npm run test:runtime` requires Linux and
locally resolvable DSH workspace dependencies; it uses a simulated model and a
tiny Python evaluator, never the official ALE evaluator.

See upstream/organon/SOURCE.json for the upstream commit and file hashes.
