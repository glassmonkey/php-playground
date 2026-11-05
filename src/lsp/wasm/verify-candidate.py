#!/usr/bin/env python3
"""Verify an existing immutable candidate against a newly verified build."""
import hashlib
import json
from pathlib import Path
import sys


def identity(manifest):
    # Attempt timing, Docker instance and output paths are evidence, not build inputs.
    return {
        key: manifest[key] for key in
        ('schemaVersion', 'phase', 'phpTarget', 'buildIdentity', 'source', 'artifact')
    } | {
        'stubs': {key: manifest['stubs'][key] for key in (
            'repository', 'commit', 'resolvedCommitMarker', 'archiveSha256', 'lockSha256',
            'fullEmbeddedStubs', 'treeSha256', 'mapSha256', 'fileCount')},
        'build': {key: manifest['build'][key] for key in (
            'target', 'command', 'cargoVersion', 'rustcVerbose')},
        'baseImageRef': manifest['docker']['baseImageRef'],
    }


def verified_manifest(directory):
    manifest = json.loads((directory / 'provenance.json').read_text())
    artifact = manifest['artifact']
    if artifact['path'] != 'phpantom_lsp.wasm':
        raise ValueError('Unexpected candidate artifact path')
    data = (directory / artifact['path']).read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    if sha != artifact['sha256'] or len(data) != artifact['bytes']:
        raise ValueError('Candidate bytes do not match provenance')
    if (directory / 'phpantom_lsp.wasm.sha256').read_text().strip() != sha:
        raise ValueError('Candidate checksum sidecar mismatch')
    return manifest


if __name__ == '__main__':
    try:
        existing, current = (Path(arg) for arg in sys.argv[1:])
        if identity(verified_manifest(existing)) != identity(verified_manifest(current)):
            raise ValueError('Immutable candidate build inputs/provenance mismatch')
        print(f'Verified immutable candidate reuse: {existing}')
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
