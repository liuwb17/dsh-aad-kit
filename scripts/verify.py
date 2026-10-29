"""Offline integrity check: upstream task/modules and release/source agreement."""
import hashlib
import json
from pathlib import Path
import tarfile

root = Path(__file__).resolve().parents[1]
plugin = root / 'plugins/dsh-greedy'
snapshot = json.loads((root / 'provenance/organon-snapshot.json').read_text())
count = 0
for name, record in snapshot['files'].items():
    if name.startswith('tasks/'):
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == record['sha256'], name
        count += 1
upstream = plugin / 'upstream/organon'
for record in json.loads((upstream / 'SOURCE.json').read_text())['files']:
    assert hashlib.sha256((upstream / record['path']).read_bytes()).hexdigest() == record['sha256'], record['path']
    count += 1
manifest = json.loads((plugin / 'package.json').read_text())
with tarfile.open(root / 'dist' / f"{manifest['name']}-{manifest['version']}.tgz") as archive:
    for member in archive.getmembers():
        if member.isfile():
            name = member.name.removeprefix('package/')
            assert archive.extractfile(member).read() == (plugin / name).read_bytes(), name
print(f'OK: {count} upstream files; package {manifest["version"]} matches source.')
