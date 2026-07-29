"""Turn env.json into the value for `gcloud run deploy --update-env-vars`.

gcloud splits that flag on `,` by default, which breaks on values containing
commas. The documented escape is a leading `^DELIM^` that redefines the
separator, so a delimiter that appears in none of the values is picked here.

Printed to stdout and captured into a shell variable by the deploy workflow, so
the values stay out of the (public) Actions log.
"""

import json
import sys

# Anything gcloud accepts as a single-character delimiter. `,` is first so the
# common case keeps producing the same flag the previous deploy action built.
CANDIDATES = ",|~;:!#%&+?"


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else "env.json"
    with open(path, "r", encoding="utf-8") as f:
        env_vars = json.load(f)

    pairs = [f"{k}={v}" for k, v in env_vars.items()]
    blob = "".join(pairs)

    for delim in CANDIDATES:
        if delim not in blob:
            print(f"^{delim}^" + delim.join(pairs))
            return

    raise SystemExit(
        "no usable delimiter: every candidate appears inside an env var value"
    )


if __name__ == "__main__":
    main()
