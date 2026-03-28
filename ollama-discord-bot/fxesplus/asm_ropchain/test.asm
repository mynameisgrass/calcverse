# LC 3030303030303030303030303030303030785c3130dee9600d3230
org 0xe9e0

backup:
    xr0 = 0xd830, adr_of main
    BL memcpy,pop er0
    pr_length

main:
    setlr
	xr0 = 0xD113, 0x01, 0x30
	[er0] = r2
    waitshift
    xr0 = 0x01, 0x01, adr_of text
    line_print
    render.ddd4
    waitshift
    xr0 = 0x01+10, 0x01, adr_of text0
    line_print
    render.ddd4
    waitshift
    xr0 = 0x01+20, 0x01, adr_of text1
    line_print
    render.ddd4
    waitshift
    xr0 = 0x01+30, 0x01, adr_of text2
    line_print
    render.ddd4
    waitshift
    xr0 = 0x01+40, 0x01, adr_of text3
    line_print
    render.ddd4
    waitshift
    xr0 = 0x01+50, 0x01, adr_of text4
    line_print
    render.ddd4
    waitshift
    xr0 = 0x01+60, 0x01, adr_of text5
    line_print
    render.ddd4
    waitshift
	buffer_clear
	call 0x0947E	# render.ddd4

restore:
    setlr
    xr0 = adr_of length, pr_length
    [er0] = er2,rt
    xr0 = adr_of main, 0xd830
    BL memcpy,pop er0
length:
    pr_length
set_sp:
    er14 = adr_of [-2] main
    sp = er14,pop er14
    
text:
    str "H"
    0x00
text0:
    str "e"
    0x00   
text1:
    str "l"
    0x00    
text2:
    str "l"
    0x00
text3:
    str "o"
    0x00    
text4:
    str "!"
    0x00    
text5:
    str "!"
    0x00