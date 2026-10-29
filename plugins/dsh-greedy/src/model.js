// DSH 0.1.7-rc.1 one-shot interface. No AgentLoop, tools, history or repair.
export function tokenTotal(usage) {
  if (!usage) throw new Error('Missing measured usage');
  const values = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
    .map(k => usage[k] ?? (k.startsWith('cache') ? 0 : NaN));
  if (values.some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error('Invalid usage');
  const sum = values.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(sum) || (usage.totalTokens !== undefined && usage.totalTokens !== sum))
    throw new Error('Inconsistent usage');
  return sum; // reasoningTokens is already included in output, never add twice.
}

export async function generate(llm, options, record) {
  const blocks = new Map();
  let usage, finish;
  for await (const chunk of llm.stream(options)) {
    record(chunk); // persist every chunk before interpreting it
    if (finish) throw new Error('Stream emitted after finish');
    if (chunk.type === 'block-end') blocks.set(chunk.index, chunk.block);
    if (chunk.type === 'usage') {
      if (usage) throw new Error('Multiple usage records require inspection');
      usage = chunk.usage;
    }
    if (chunk.type === 'finish') finish = chunk.reason;
  }
  if (!finish || !['stop', 'max-tokens'].includes(finish.kind))
    throw new Error('Unsettled model response: ' + JSON.stringify(finish));
  const tokens = tokenTotal(usage);
  const ordered = [...blocks].sort((a,b) => a[0]-b[0]).map(x => x[1]);
  if (ordered.some(b => !['text','reasoning'].includes(b.type))) throw new Error('Unexpected output block');
  return {text: ordered.filter(b => b.type === 'text').map(b => b.text).join(''), usage, tokens,
    finish: finish.kind};
}
