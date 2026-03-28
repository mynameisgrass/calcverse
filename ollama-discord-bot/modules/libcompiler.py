"""Placeholder libcompiler stub.
Replace this file with the real implementation for your target.
"""

rom = b""

class MissingCompilerAssets(Exception):
    pass


def set_font(_font):
    return None

def set_npress_array(_arr):
    return None

def get_disassembly(_path):
    _ensure(False)

def get_commands(_path):
    _ensure(False)

def read_rename_list(_path):
    return None

def set_symbolrepr(_symbols):
    return None

def get_rom(_path):
    _ensure(False)

def optimize_gadget(_data):
    _ensure(False)

def find_equivalent_addresses(_rom, _targets):
    _ensure(False)

def print_addresses(*_args, **_kwargs):
    _ensure(False)

def process_program(*_args, **_kwargs):
    _ensure(False)

def load_extensions(_path):
    _ensure(False)

def expand_extensions_in_program(program, _extensions):
    return program

# helpers

def _ensure(ok: bool):
    if not ok:
        raise MissingCompilerAssets(
            "libcompiler stub in place. Provide real modules/libcompiler.py and compiler assets."
        )
