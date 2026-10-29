Use fixed greedy search to improve the task in this session's working directory.

Call greedy_status first. Run greedy_run with max_budget=128 and candidates=16.
Report the champion fitness and remaining candidate budget after this chunk.
Use the same max_budget for later chunks. Do not change the search policy, task,
evaluator, or plugin source. Do not invoke the evaluator separately.
If an operation is unresolved, stop and report its saved artifacts; do not replay it.

The baseline is evaluated once and is excluded from the 128 candidate budget.
Each batch shares the current champion as parent and contains up to four children.
Candidate generation inherits the session model and uses one ctx.llm call per child.
