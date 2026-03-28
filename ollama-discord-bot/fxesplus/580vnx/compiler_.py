#!/usr/bin/python3
import sys,os,itertools
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
os.chdir(SCRIPT_DIR)
sys.path.append(PROJECT_DIR)
import libcompiler
from libcompiler import (
		set_font, set_npress_array, get_disassembly, get_commands,
		get_commands_from_disassembly, import_legacy_command_aliases,
		read_rename_list, set_symbolrepr, get_rom,
		optimize_gadget, find_equivalent_addresses,
		to_font, print_addresses,
		process_program
		)

FONT=[l.split('\t') for l in '''
															
𝒙	𝒚	𝒛	⋯	▲	▼	▸	 ˍ	$	◁	&	𝑡	ᴛ	ₜ	ₕ	₅
 	!	"	#	×	%	÷	'	(	)	⋅	+	,	—	.	/
0	1	2	3	4	5	6	7	8	9	:	;	<	=	>	?
@	A	B	C	D	E	F	G	H	I	J	K	L	M	N	O
P	Q	R	S	T	U	V	W	X	Y	Z	[	▫	]	^	_
-	a	b	c	d	e	f	g	h	i	j	k	l	m	n	o
p	q	r	s	t	u	v	w	x	y	z	{	|	}	~	⊢
𝐢	𝐞	x	⏨	∞	°	ʳ	ᵍ	∠	x̅	y̅	x̂	ŷ	→	∏	⇒
ₓ	⏨	⏨̄	⌟	≤	≠	≥	⇩	√	∫	ᴀ	ʙ	ᴄ	ₙ	▶	◀	
⁰	¹	²	³	⁴	⁵	⁶	⁷	⁸	⁹	⁻¹	ˣ	¹⁰	₍	₎	±	
₀	₁	₂	₋₁	ꜰ	ɴ	ᴘ	µ	𝐀	𝐁	𝐂	𝐃	𝐄	𝐅	𝐏	▷	
Σ	α	γ	ε	θ	λ	μ	π	σ	ϕ	ℓ	ℏ	█	⎕	₃	▂
𝐟	𝐩	𝐧	𝛍	𝐦	𝐤	𝐌	𝐆	𝐓	𝐏	𝐄	𝑭	ₚ	ₑ	ᴊ	ᴋ
τ	ᵤ	₉	Å	ₘ	ɪ	₄									
															
'''.strip('\n').split('\n')]
assert len(FONT)==16 # TODO wrong
assert all(len(l)>=16 for l in FONT)
FONT=[*itertools.chain.from_iterable(l[:16] for l in FONT)]

set_font(FONT)

npress=( # 99: nul, 49: not typeable, 24: can be extracted from multibyte characters
		# 30: box
	99,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,
	24,24,24,24,24,24,24,24,24,30,24,24,24,24,24,24,
	24,2 ,2 ,2 ,24,24,24,24,24,24,24,24,2 ,1 ,1 ,24,
	1 ,1 ,1 ,1 ,1 ,1 ,1 ,1 ,1 ,1 ,24,24,24,24,24,24,
	2 ,1 ,2 ,2 ,2 ,2 ,2 ,2 ,1 ,2 ,2 ,2 ,24,24,24,24,
	2 ,1 ,2 ,2 ,24,24,24,24,24,24,24,24,24,24,24,49,
	1 ,49,49,49,49,49,49,49,2 ,2 ,49,49,3 ,3 ,3 ,3 ,
	3 ,3 ,2 ,2 ,1 ,1 ,2 ,1 ,1 ,1 ,2 ,2 ,2 ,1 ,2 ,2 ,
	49,49,49,2 ,2 ,49,49,2 ,2 ,2 ,49,49,49,49,49,49,
	49,49,49,49,49,49,49,49,49,49,49,49,49,49,49,49,
	49,49,49,49,49,2 ,1 ,1 ,1 ,1 ,2 ,49,49,2 ,2 ,49,
	49,49,49,49,49,49,49,49,49,49,49,49,49,49,49,49,
	1 ,49,49,49,49,49,49,49,1 ,1 ,2 ,49,49,49,49,49,
	1 ,49,49,49,1 ,1 ,2 ,2 ,2 ,3 ,3 ,3 ,1 ,3 ,3 ,3 ,
	3 ,3 ,3 ,3 ,3 ,3 ,3 ,3 ,49,49,49,49,49,49,49,49,
	49,49,49,49,49,49,49,49,49,49,49,49,49,49,49,49, # TODO fix npress table for multibyte characters
	)
set_npress_array(npress)

def get_binary(filename):
	file = open(filename, 'rb')
	result = file.read()
	file.close()
	return result

from get_char_table import f as get_symbol
symbols = [
		''.join(map(FONT.__getitem__,get_symbol(x)[1]))
			for x in range(0xf0)] + \
	['@']*0x10 # TODO wrong




set_symbolrepr(symbols[:])

import argparse

def resolve_existing_path(path, *, default=None, required=True):
	'''
	Resolve paths robustly for both:
	- running from project root
	- running after this script chdir() into 580vnx
	'''
	if not path:
		path = default
	if not path:
		if required:
			raise FileNotFoundError('Missing required path')
		return None

	candidates = []
	if os.path.isabs(path):
		candidates.append(path)
	else:
		candidates.append(path)
		candidates.append(os.path.join(SCRIPT_DIR, path))
		candidates.append(os.path.join(PROJECT_DIR, path))

	for p in candidates:
		p_abs = os.path.abspath(p)
		if os.path.exists(p_abs):
			return p_abs

	if required:
		raise FileNotFoundError(path)
	return None

parser = argparse.ArgumentParser()
parser.add_argument('--rom-file', default='rom.bin',
		help='ROM binary path')
parser.add_argument('--disas-file', default='disas.txt',
		help='Primary disassembly path (fallback/preview source)')
parser.add_argument('--command-source', default='all',
		choices=('all', 'disas', 'gadgets', 'both'),
		help='where to load command/gadget definitions from')
parser.add_argument('-t', '--target', default='none',
		choices=('none',),
		help='how will the output be used')
parser.add_argument('-f', '--format', default='key',
		choices=('hex', 'key'),
		help='output format')
parser.add_argument('-g', '--gadget-adr', default=None,
		type=lambda x:int(x,0), help='Address of gadget to optimize')
parser.add_argument('-gb', '--gadget-bin', default=None, help='Gadget in binary (big endian)')
parser.add_argument('-gn', '--gadget-nword', default=0,
		type=lambda x:int(x,0), help='Length of gadget to optimize (inf if not provided)')
parser.add_argument('-p', '--preview-count', default=0,
		type=lambda x:int(x,0), help='Number of lines to preview (optimize gadget mode)')
args = parser.parse_args()

rom_file = resolve_existing_path(args.rom_file, default='rom.bin')
# Some repositories only keep _disas.txt checked in; allow graceful fallback.
disas_file = resolve_existing_path(args.disas_file, default='disas.txt', required=False)
get_rom(rom_file)

# Always discover from these two disassembly sources when available.
disas_sources = []
seen_paths = set()
for candidate in (disas_file, 'disas.txt', '_disas.txt'):
	p = resolve_existing_path(candidate, required=False)
	if not p:
		continue
	p_norm = os.path.normcase(os.path.normpath(p))
	if p_norm in seen_paths:
		continue
	seen_paths.add(p_norm)
	disas_sources.append(p)

# Keep a loaded disassembly for rename/preview routines.
if disas_sources:
	get_disassembly(disas_sources[0])

if args.command_source in ('all', 'gadgets', 'both'):
	get_commands('gadgets')
read_rename_list('labels')
read_rename_list('../labels_sfr')
if args.command_source in ('all', 'disas', 'both'):
	for extra_disas_file in disas_sources:
		get_disassembly(extra_disas_file)
		get_commands_from_disassembly()
	# Keep the primary disassembly for preview/debug output consistency.
	if disas_sources:
		get_disassembly(disas_sources[0])
if args.command_source == 'disas':
	# Keep old special aliases/nicknames for backwards compatibility.
	import_legacy_command_aliases('gadgets')

if args.gadget_bin!=None:
	assert args.gadget_bin
	print_addresses(optimize_gadget(bytes.fromhex(args.gadget_bin)), args.preview_count)

elif args.gadget_nword>0:
	print_addresses(
		optimize_gadget(libcompiler.rom[args.gadget_adr:args.gadget_adr+args.gadget_nword*2]),
		args.preview_count)

elif args.gadget_adr!=None:
	print_addresses(
		find_equivalent_addresses(libcompiler.rom,{args.gadget_adr}),
		args.preview_count)

else:
	program = sys.stdin.read().split('\n')
	process_program(args, program, overflow_initial_sp=0xE9E0)
