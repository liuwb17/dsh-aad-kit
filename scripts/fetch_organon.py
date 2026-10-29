"""Fetch a pinned, byte-verified Organon ALE task/evaluator snapshot; never execute it."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

REPO = 'cheikh025/organon'
COMMIT = 'fcd1e501ee589d363766136aceb60527a0f06b12'


def fetch(destination, tree_file=None):
    destination = Path(destination)
    tree = json.loads(Path(tree_file).read_text()) if tree_file else json.load(urllib.request.urlopen(
        f'https://api.github.com/repos/{REPO}/git/trees/{COMMIT}?recursive=1', timeout=40))
    if tree['sha'] != COMMIT:
        raise ValueError('Tree identity mismatch')
    if tree.get('truncated'):
        raise ValueError('Incomplete upstream tree')
    selected = [x for x in tree['tree'] if x['type'] == 'blob' and (
        x['path'].startswith('tasks/ale_bench/') or
        x['path'] in ['README.md', 'LICENSE', 'setup.sh', 'tasks/evaluator_sources.json',
                     'plugins/dsh-evolve-loop/src/providers/run_evaluator.py',
                     'plugins/dsh-evolve-loop/src/providers/evaluate.js'])]
    extra = {'plugins/dsh-evolve-loop/src/'+p for p in [
        'budget.js','candidates.js','population.js','files.js','providers/mutate.js']}
    selected += [x for x in tree['tree'] if x['type']=='blob' and x['path'] in extra]

    def download(entry):
        relative = entry['path']
        target = destination / relative
        data = urllib.request.urlopen(
            f'https://raw.githubusercontent.com/{REPO}/{COMMIT}/{relative}', timeout=60).read()
        git_sha = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if git_sha != entry['sha']:
            raise ValueError('Upstream blob mismatch: ' + relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_bytes() != data:
            raise FileExistsError('Refuse overwrite: ' + str(target))
        target.write_bytes(data)
        return relative, {'sha256': hashlib.sha256(data).hexdigest(), 'git_blob': git_sha, 'bytes': len(data)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        files = dict(pool.map(download, selected))
    manifest = {'repository': f'https://github.com/{REPO}', 'commit': COMMIT,
                'files': files, 'executed': False}
    (destination / 'SOURCE_MANIFEST.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'destination': str(destination), 'commit': COMMIT, 'files': len(files)}))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination')
    parser.add_argument('--tree-file')
    args = parser.parse_args()
    fetch(args.destination, args.tree_file)
