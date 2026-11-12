"""Build the `--update-secrets` value from scripts/secret_manager_map.json.

Only names are handled here (env var name -> Secret Manager secret name), never
values, so the output is safe to print.

Optional env keys (scripts/optional_secret_manager_keys.json) are never added to
the flag. A missing secret, or a Cloud Run runtime SA without accessor
permission, would fail the whole deploy with Permission denied. Required keys
are always included.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Iterable, Mapping


def _script_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def load_json(name: str):
    with open(os.path.join(_script_dir(), name), "r", encoding="utf-8") as f:
        return json.load(f)


def selected_map(
    secret_map: Mapping[str, str],
    optional_keys: Iterable[str],
) -> dict[str, str]:
    optional = set(optional_keys)
    return {key: name for key, name in secret_map.items() if key not in optional}


def format_flag(secret_map: Mapping[str, str]) -> str:
    return ",".join(f"{key}={secret_name}:latest" for key, secret_name in secret_map.items())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--print-optional",
        action="store_true",
        help="Print optional env var names that are omitted from --update-secrets.",
    )
    args = parser.parse_args()
    secret_map = load_json("secret_manager_map.json")
    optional_keys = load_json("optional_secret_manager_keys.json")
    if args.print_optional:
        print(",".join(key for key in optional_keys if key in secret_map))
        return
    print(format_flag(selected_map(secret_map, optional_keys)))


if __name__ == "__main__":
    main()
