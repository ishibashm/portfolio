"""Build the `--update-secrets` value from scripts/secret_manager_map.json.

Only names are handled here (env var name -> Secret Manager secret name), never
values, so the output is safe to print.
"""

import json
import os


def main() -> None:
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secret_manager_map.json")
    with open(path, "r", encoding="utf-8") as f:
        secret_map = json.load(f)
    print(",".join(f"{k}={v}:latest" for k, v in secret_map.items()))


if __name__ == "__main__":
    main()
