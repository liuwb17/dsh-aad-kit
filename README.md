# DSH AAD Kit

DSH AAD Kit is a program search toolkit built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It improves a program through repeated generation and evaluation: each batch produces up to four variations of the current best solution, evaluates them, and keeps the best improvement.

The toolkit runs as a DSH plugin and includes a setup script, a ready-to-install plugin package, and ten ALE-Bench tasks with their starting programs and evaluators. The instructions below target Linux and WSL, using DSH **0.1.7-rc.1** from a source checkout.

## How it works

| Component | Role | Location |
| --- | --- | --- |
| DSH session | Starts search chunks, inspects progress, and supplies the model configuration. | `PROMPT.md` |
| Search loop | Runs greedy best-of-four search through `greedy_run`. Candidates in a batch share the same parent; the best strictly improving candidate becomes the next parent. | `plugins/dsh-greedy/src/greedy.js` |
| Candidate generation | Makes one model call per candidate using the statement, parent program, and parent fitness. Edits are confined to the EVOLVE region. | `plugins/dsh-greedy/src/model.js` |
| Evaluation | Executes the task's Python evaluator through DSH and records its fitness. | `plugins/dsh-greedy/upstream/organon/src/providers/` |
| Run storage | Keeps candidate programs, evaluation results, lineage, budget, and model responses. | The task's `run/` directory |

The starting program is evaluated once and does not consume candidate budget. Each new candidate directory consumes one attempt. Search proceeds in chunks, retaining the budget and population between calls.

## Repository layout

```text
dsh-aad-kit/
├── setup.sh                     installs DSH, the plugin, and ALE-Bench dependencies
├── PROMPT.md                    a starting prompt for the DSH session
├── dist/
│   └── dsh-aad-greedy-0.1.0.tgz prebuilt plugin package
├── plugins/
│   └── dsh-greedy/              plugin source, upstream modules, and tests
├── tasks/
│   ├── ale_bench/               ten tasks with starting programs and evaluators
│   └── evaluator_sources.json  evaluator provenance
├── scripts/                     integrity checks and snapshot download utility
└── provenance/                  upstream revision and file hashes
```

## Tasks

| Benchmark | Folder | Problems | Evaluator requirements |
| --- | --- | --- | --- |
| ALE-Bench | `tasks/ale_bench/` | ahc008, ahc011, ahc015, ahc016, ahc024, ahc025, ahc026, ahc027, ahc039, ahc046 | Python and ALE-Bench Docker images, installed by `setup.sh` |

Each task contains a problem statement in `statement.md`, a starting program in `solution.cpp`, an evaluator in `evaluator/evaluator.py`, and evaluator settings in `task.json`. The editable program region lies between `#EVOLVE_START` and `#EVOLVE_END`.

The included evaluators use C++20 and public cases 0–49 with ALE-Bench's lite dataset. Each evaluator is configured for 13 workers; a batch may evaluate four candidates concurrently. Plan compute resources accordingly.

## Requirements

| Dependency | Version or requirement | Check |
| --- | --- | --- |
| Node.js | 24 or newer | `node -v` |
| pnpm | 11.7 | `pnpm -v` |
| Git | Available on PATH | `git --version` |
| DeepSeek Harness | Source checkout at 0.1.7-rc.1; setup can clone and build it | See installation below |
| Python | 3.11–3.14 with venv support | `python3 --version` |
| Docker | Engine 24+, accessible to the current user | `docker info` |
| bubblewrap | Available on PATH | `bwrap --version` |
| System libraries | cairo and ffi development libraries | See installation below |

## Installation and usage

### Step 1. Clone the kit and choose your paths

```bash
git clone https://github.com/liuwb17/dsh-aad-kit.git
cd dsh-aad-kit

export KIT="$PWD"
export DSH_REPO="$HOME/deepseek-harness"
export DSH_HOME="$HOME/.dsh-aad"
export BENCH_HOME="$DSH_HOME/benchmarks"
```

Keep these variables available in the shell used to start DSH. In particular, `DSH_HOME` must have the same value during installation and startup so DSH can find the installed profile. For containers, choose paths on persistent storage.

### Step 2. Install prerequisites

With Node.js 24 already installed, a Debian/Ubuntu setup is:

```bash
npm install -g pnpm@11.7.0
sudo apt install git python3 python3-venv bubblewrap libcairo2-dev libffi-dev
```

Install Docker Engine and ensure `docker info` succeeds as your current user.

### Step 3. Run setup

```bash
cd "$KIT"
bash setup.sh
```

Setup prepares:

1. A DSH source checkout at `dsh-v0.1.7-rc.1`, built if needed.
2. The greedy plugin installed into the `greedy` profile.
3. ALE-Bench at commit `3da9b12fb5d112dabb3af693d1a42031c95142bc`.
4. A Python environment at `$BENCH_HOME/venv` and the ALE-Bench Docker images.

An existing DSH checkout must report the required version. To install the plugin while using an independently managed evaluator environment, run `SKIP_ALE=1 bash setup.sh`. Installed Python package versions are recorded in `$BENCH_HOME/pip-freeze.txt`.

### Step 4. Create a task workspace

Copy a task for each independent search:

```bash
mkdir -p "$KIT/workspaces"
cp -a "$KIT/tasks/ale_bench/ahc008" "$KIT/workspaces/ahc008-rep1"
```

The search writes results into this copy's `run/` directory. Use a new copy for another repeat.

### Step 5. Start DSH

```bash
cd "$DSH_REPO"
PATH="$BENCH_HOME/venv/bin:$PATH" pnpm dsh web
```

Select the `greedy` profile, configure your model provider, and start a session whose working directory is `$KIT/workspaces/ahc008-rep1`. Give the session the prompt in [PROMPT.md](PROMPT.md).

Candidate generation inherits the session's provider, model, reasoning effort, and maximum output length. Search starts when the session calls `greedy_run`.

## Search controls

| Tool | Purpose |
| --- | --- |
| `greedy_run` | Generate and evaluate a chunk of candidates. |
| `greedy_status` | Read the champion, budget, and pause or blocked state. |
| `greedy_pause` | Request a pause after the current batch finishes. |

For example:

```text
greedy_run({max_budget:128, candidates:16})
```

This sets a total budget of 128 new candidates and generates up to 16 in the current call. Call it again with the same `max_budget` to continue. The total budget is fixed by the first call; omitting `candidates` uses the remaining budget. The budget counts candidate attempts rather than tokens.

Each batch contains up to four candidates. A partial final batch is allowed, and a chunk boundary ends a batch. Equal fitness retains the current parent. Positive fitness is maximized, negative fitness represents a minimization objective, and zero represents a failed evaluation.

To continue after a requested pause, call `greedy_run` with `resume:true` and the original budget. An unresolved operation requires inspection of the saved records before continuation; `resume` does not replay interrupted requests.

## Results

```text
run/
├── budget.json         total candidate budget
├── population.jsonl    candidate fitness, parent, and survival records
├── candidates/         complete candidate workspaces, starting with c000000
├── evals/              evaluator results for each candidate
└── requests/           generation prompts, streamed responses, and usage
```

`greedy_status` returns the current champion's ID and fitness. Its program is stored at `run/candidates/<id>/solution.cpp`.

## Development

Run the offline tests:

```bash
cd "$KIT/plugins/dsh-greedy"
npm test
```

Rebuild the distributable after editing the plugin, then check package and upstream file integrity:

```bash
npm pack --pack-destination ../../dist
cd "$KIT"
python3 scripts/verify.py
```

The integration test at `plugins/dsh-greedy/tests/aligned-runtime.mjs` exercises DSH services with a fixture model and a small Python evaluator. It requires Linux and locally resolvable DSH workspace dependencies.

## Acknowledgments

The task collection, evaluation infrastructure, and storage modules are adapted from [Organon](https://github.com/cheikh025/organon). Benchmark evaluation uses [ALE-Bench](https://github.com/SakanaAI/ALE-Bench), and the runtime is provided by [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). See [THIRD_PARTY.md](THIRD_PARTY.md) for source revisions and attribution.
