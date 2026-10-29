# dsh-aad-kit

基于 DeepSeek Harness 的固定 greedy 搜索套件。沿用 [Organon](https://github.com/cheikh025/organon) 的目录、任务、预算、候选存储与评测模块，使用 **greedy Bo4 + ctx.llm 单次生成**，没有 RSI 或 candidate-builder worker。插件版本 **0.1.0**，DSH 版本 **0.1.7-rc.1**。

## 仓库布局

```text
setup.sh                     安装 DSH、greedy 插件与 ALE 评测环境
PROMPT.md                    发给 DSH 会话的启动提示
dist/                        可安装的插件 tgz
plugins/dsh-greedy/           插件源码与离线测试
tasks/ale_bench/              十道题的题面、baseline、评测代码及配置
tasks/evaluator_sources.json 原版评测来源
scripts/                     发布校验与上游快照下载工具
provenance/                  固定版本与哈希记录
```

## 安装

支持 Linux / WSL。预先安装 Node.js 24、pnpm 11.7、git、Python 3.11–3.14（含 venv）、Docker Engine 24+、bubblewrap，以及 cairo/ffi 系统依赖。Docker 必须能由当前用户使用。

```bash
git clone https://github.com/liuwb17/dsh-aad-kit.git
cd dsh-aad-kit
export KIT="$PWD"
export DSH_REPO="$HOME/deepseek-harness"
export DSH_HOME="$HOME/.dsh-aad"
export BENCH_HOME="$DSH_HOME/benchmarks"
bash setup.sh
```

`setup.sh` 安装独立的 `greedy` profile；必要时克隆并构建固定版本的 DSH，安装 ALE-Bench Python 环境并构建其 Docker 镜像。不会启动搜索。已有 DSH 版本不匹配时退出，不切换现有 checkout。只安装插件可用 `SKIP_ALE=1 bash setup.sh`，但正式评测仍需 ALE 环境。

ALE-Bench 固定 commit `3da9b12fb5d112dabb3af693d1a42031c95142bc`；Python 的间接依赖由安装时解析，实际版本写入 `pip-freeze.txt`。DSH 认证和模型配置在 DSH 中完成，仓库不提供 API 密钥。

## 启动搜索

复制任务到新的工作目录，避免不同实验共用 run：

```bash
mkdir -p "$KIT/workspaces"
cp -a "$KIT/tasks/ale_bench/ahc008" "$KIT/workspaces/ahc008-rep1"
cd "$DSH_REPO"
PATH="$BENCH_HOME/venv/bin:$PATH" pnpm dsh web
```

保持安装时的 `DSH_HOME`。在 Web 中选择 `greedy` profile，设置模型，创建 cwd 指向上述 `ahc008-rep1` 的会话，发送 [PROMPT.md](PROMPT.md)。核心调用为：

```text
greedy_run({max_budget:128, candidates:16})
```

这会评测单个 baseline（仅首次、不计候选预算），执行四批 Bo4，再报告冠军和剩余预算。再次调用相同参数继续；max_budget 一旦固定不能更改。没有 token 总预算，模型/provider/推理档位和最大输出长度继承 DSH 会话。`greedy_status` 查看状态，`greedy_pause` 在当前批完成后暂停；`resume:true` 只解除主动暂停。

## 与 Organon 的对应关系

| 部分 | 实现 |
|---|---|
| 题目与 baseline | 原版 statement.md、solution.cpp、task.json、evaluator/evaluator.py |
| 预算与存储 | 原版 budget/candidates/population/files 模块 |
| 评测 | 原版 evaluate.js 和 run_evaluator.py，经 DSH subprocess 执行 |
| 评分排序 | 原版 merit，支持正分最大化、负分最小化、0 分失败 |
| 生成提示 | 原版 persona/instruction，附内联题面、父代源码和完整 cpp 输出约定 |
| 候选生成 | 一次 ctx.llm 调用，只修改 EVOLVE 区域；无 worker、工具或多轮修复 |
| 搜索策略 | 固定 greedy；批内共享父代，批末严格改进才换冠军；平分保留旧冠军 |
| RSI | 不包含策略修改、meta agent、动态 provider 或 Evolve Mode preset |

尾批可不足四个；分段边界也是批边界，会影响轨迹。已结算但格式错误/截断的生成保留父代副本并评测。模型用量不明或评测进程异常会保留检查点并停止，不自动重放。原版 runner 内部的重试、错误转分数、timeout 和 sandbox 语义不变。记录位于 `run/candidates/`、`run/evals/`、`run/population.jsonl` 和额外的 `run/requests/`。

十题为 ahc008、011、015、016、024、025、026、027、039、046；不含 ahc001。仓库包含题目和评测源码，不包含生成后的 testcase 或 Docker 镜像。原版 ALE evaluator 使用 lite_version=True、public 0..49、cpp20、num_workers=13、sandbox=false。四个并行候选分别执行评测，需要相应计算资源；没有共享 broker 的 CPU 配额。没有自动私有评测入口。

## 开发与验证

```bash
cd "$KIT/plugins/dsh-greedy"
npm test
npm pack --pack-destination ../../dist
cd "$KIT"
python3 scripts/verify.py
```

`src/index.js` 注册 Cordis 工具；`src/aligned.js` 实现固定循环；`src/model.js` 收集响应与用量；`upstream/organon/` 存放七个原样复用模块。测试仅使用模拟模型与小型评测函数。真实 DSH 服务接线的测试脚本为 `tests/aligned-runtime.mjs`，需要本地可解析的 DSH workspace 依赖及 Linux Python。

本版已通过四项离线测试和真实 Cordis/LlmRuntime/tools/subprocess 的模拟集成测试。未执行付费模型请求、ALE 正式评测或完整 Docker 安装。来源与复用范围见 [THIRD_PARTY.md](THIRD_PARTY.md)。
