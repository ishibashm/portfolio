"""Build the `--update-secrets` value from scripts/secret_manager_map.json.

Only names are handled here (env var name -> Secret Manager secret name), never
values, so the output is safe to print.

Optional env keys (scripts/optional_secret_manager_keys.json) are omitted when
`--existing` is given and their Secret Manager secret is not in that list.
Required keys are always included, even if missing from `--existing`.
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


def parse_existing(text: str) -> set[str]:
    """Accept names or resource paths from `gcloud secrets list`, never values."""
    names: set[str] = set()
    for raw in text.replace(",", " ").split():
        token = raw.strip()
        if not token:
            continue
        if "/secrets/" in token:
            token = token.rsplit("/secrets/", 1)[-1]
        token = token.split("/", 1)[0]
        if token:
            names.add(token)
    return names


def selected_map(
    secret_map: Mapping[str, str],
    optional_keys: Iterable[str],
    existing: set[str] | None,
) -> dict[str, str]:
    optional = set(optional_keys)
    out: dict[str, str] = {}
    for key, secret_name in secret_map.items():
        if existing is not None and key in optional and secret_name not in existing:
            continue
        out[key] = secret_name
    return out


def missing_optional(
    secret_map: Mapping[str, str],
    optional_keys: Iterable[str],
    existing: set[str],
) -> list[str]:
    missing: list[str] = []
    for key in optional_keys:
        secret_name = secret_map.get(key)
        if secret_name and secret_name not in existing:
            missing.append(key)
    return missing


def format_flag(secret_map: Mapping[str, str]) -> str:
    return ",".join(f"{key}={secret_name}:latest" for key, secret_name in secret_map.items())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--existing",
        default=None,
        help="Whitespace/comma-separated Secret Manager secret names that exist.",
    )
    parser.add_argument(
        "--print-missing-optional",
        action="store_true",
        help="Print optional env var names whose secrets are not in --existing.",
    )
    args = parser.parse_args()
    secret_map = load_json("secret_manager_map.json")
    optional_keys = load_json("optional_secret_manager_keys.json")
    existing = parse_existing(args.existing) if args.existing is not None else None
    if args.print_missing_optional:
        print(",".join(missing_optional(secret_map, optional_keys, existing or set())))
        return
    print(format_flag(selected_map(secret_map, optional_keys, existing)))


if __name__ == "__main__":
    main()
