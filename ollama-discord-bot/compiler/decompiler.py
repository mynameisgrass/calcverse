#!/usr/bin/env python3
import sys
import os
import tempfile

# Ensure local modules are importable
SCRIPT_DIR = os.path.dirname(__file__)
sys.path.append(SCRIPT_DIR)

import libdecompiler  # type: ignore


def main():
    disas_path = os.path.join(SCRIPT_DIR, "disas.txt")
    gadgets_path = os.path.join(SCRIPT_DIR, "gadgets.txt")
    labels_path = os.path.join(SCRIPT_DIR, "labels.txt")

    disas = libdecompiler.get_disas(disas_path)
    gadgets = libdecompiler.get_commands(gadgets_path)
    labels = libdecompiler.get_commands(labels_path)

    # Read stdin hex payload
    data = sys.stdin.read()
    if not data.strip():
        print("No input provided", file=sys.stderr)
        sys.exit(1)

    with tempfile.NamedTemporaryFile(delete=False, mode="w", encoding="utf-8") as tmp_in:
        tmp_in.write(data)
        tmp_in_path = tmp_in.name

    out_lines = []
    try:
        libdecompiler.decompile(
            tmp_in_path,
            os.devnull,
            disas,
            gadgets,
            labels,
            start_ram=0x0000,
            end_ram=0xFFFF,
            output_lines=out_lines,
        )
    finally:
        try:
            os.unlink(tmp_in_path)
        except OSError:
            pass

    sys.stdout.write("".join(out_lines))


if __name__ == "__main__":
    main()
