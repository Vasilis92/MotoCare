#!/usr/bin/env python3
"""Portable discovery and repository launcher; copied unchanged by install-agent."""
import argparse
import json
import os
from pathlib import Path
import runpy
import sys
import subprocess


class KnowledgeError(ValueError):
    pass


def local_config_path(home=None):
    base = home or Path.home()
    existing = base / '.config/shared-agent-memory/locations.json'
    # Reuse the original Linux-style configuration when present. Windows sandbox
    # accounts may not be allowed to create ~/.config; use native local app data.
    if home is None and sys.platform == 'win32' and not existing.is_file():
        return base / 'AppData/Local/SharedAgentMemory/locations.json'
    return existing


def read_config(path):
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise KnowledgeError('Local configuration must be a JSON object')
    return data


def is_vault(path):
    return all((path / name).exists() for name in
               ('INDEX.md', 'SHARED-MEMORY.md', 'AGENTS.md', 'tools', '.obsidian'))


def discover(cwd=None, config=None, home=None, environ=None, explicit=None):
    """Each priority tier must be unambiguous. Never create a vault."""
    supplied_home = home
    cwd = (cwd or Path.cwd()).resolve()
    home = home or Path.home()
    env = os.environ if environ is None else environ

    def choose(paths):
        candidates = sorted({p.expanduser().resolve() for p in paths if is_vault(p.expanduser())})
        if len(candidates) > 1:
            raise KnowledgeError('Ambiguous vaults; choose with --vault: ' +
                                 ', '.join(map(str, candidates)))
        return candidates[0] if candidates else None

    if explicit is not None:
        selected = choose([Path(explicit)])
        if not selected:
            raise KnowledgeError('Explicit vault is missing or lacks the existing vault markers')
        return selected
    for parent in (cwd, *cwd.parents):
        if is_vault(parent):
            return parent
    settings = read_config(config or local_config_path(supplied_home))
    for value in (settings.get('vault'), env.get('OBSIDIAN_VAULT')):
        if value:
            return discover(explicit=value, cwd=cwd, home=home, environ=env)
    # Obsidian's registry is local state, never an executable instruction source.
    refs = [home / '.config/obsidian/obsidian.json',
            home / 'AppData/Roaming/obsidian/obsidian.json']
    if env.get('APPDATA'):
        refs.append(Path(env['APPDATA']) / 'obsidian/obsidian.json')
    paths = []
    for ref in dict.fromkeys(refs):
        if ref.is_file():
            for value in read_config(ref).get('vaults', {}).values():
                p = Path(value.get('path', ''))
                # An accidentally opened subfolder must not become a second vault.
                paths.extend([p, *list(p.parents)[:3]])
    selected = choose(paths)
    if selected:
        return selected
    plausible = [home / 'ObsidianVault', home / 'Documents/ObsidianVault']
    for directory in (home / 'Documents', home / 'AI-Projects', home / 'projects'):
        try:
            plausible.extend(p for p in directory.iterdir() if p.is_dir())
        except (FileNotFoundError, PermissionError):
            pass
    selected = choose(plausible)
    if selected:
        return selected
    raise KnowledgeError('Vault not found. Set OBSIDIAN_VAULT or select the existing clone with --vault.')


def launch():
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument('--vault', type=Path)
    p.add_argument('--config', type=Path)
    args, _ = p.parse_known_args()
    try:
        vault = discover(explicit=args.vault, config=args.config)
        engine = vault / 'tools/knowledge.py'
        if not engine.is_file():
            raise KnowledgeError('Selected vault does not have the knowledge engine')
        sys.path.insert(0, str(engine.parent))
        # The selected vault is an explicitly trusted local tool checkout, not a retrieved note.
        sys.argv[1:1] = ['--vault', str(vault)]
        runpy.run_path(str(engine), run_name='__main__')
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        if 'hook' in sys.argv:
            print('{}')  # Documentation failure never blocks normal completion.
            print('Knowledge unavailable: ' + str(exc), file=sys.stderr)
        else:
            print('Knowledge unavailable: ' + str(exc), file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    launch()
