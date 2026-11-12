#!/usr/bin/env python3
"""Set the image name/tag of qit-backend and qit-frontend in a kustomization.yaml.

Usage:
  set_image_tag.py <kustomization.yaml> <tag> [registry_user]   # write a tag
  set_image_tag.py <kustomization.yaml> --get                   # print the current backend tag
"""
import re
import sys

IMAGES = ("qit-backend", "qit-frontend")


def block_pattern(name: str) -> re.Pattern:
    return re.compile(
        r"(- name: " + re.escape(name) + r"\n\s+newName: )(\S+)(\n\s+newTag: )(\S+)"
    )


def main() -> int:
    path = sys.argv[1]
    text = open(path, encoding="utf-8").read()

    if sys.argv[2] == "--get":
        match = block_pattern("qit-backend").search(text)
        if not match:
            print("ERROR: qit-backend image not found in " + path, file=sys.stderr)
            return 1
        print(match.group(4))
        return 0

    tag = sys.argv[2]
    user = sys.argv[3] if len(sys.argv) > 3 else None
    for name in IMAGES:
        pattern = block_pattern(name)
        if not pattern.search(text):
            print(f"ERROR: {name} image not found in {path}", file=sys.stderr)
            return 1

        def repl(m, name=name):
            new_name = f"{user}/{name}" if user else m.group(2)
            return f"{m.group(1)}{new_name}{m.group(3)}{tag}"

        text = pattern.sub(repl, text)

    open(path, "w", encoding="utf-8").write(text)
    print(f"{path}: images set to {tag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
