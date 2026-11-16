"""Generate original geometric flower PNGs with stdlib only (no downloaded art)."""
from pathlib import Path
import math, struct, zlib
out = Path(__file__).parent / 'icons'
out.mkdir(exist_ok=True)
for filename, size in [('icon-192.png',192),('icon-512.png',512),('maskable-512.png',512),('apple-touch-icon-180.png',180),('badge-96.png',96)]:
    rows=[]
    for y in range(size):
        row=bytearray()
        for x in range(size):
            u,v=(x+0.5)/size-0.5,(y+0.5)/size-0.5
            petal=any((u-0.16*math.cos(i*math.pi/3))**2+(v-0.16*math.sin(i*math.pi/3))**2 < 0.105**2 for i in range(6))
            center=u*u+v*v<0.075**2
            color=(238,194,104,255) if center else (245,235,215,255) if petal else (23,33,30,255)
            if filename.startswith('badge'):color=(255,255,255,255) if petal or center else (0,0,0,0)
            row.extend(color)
        rows.append(b'\0'+row)
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
    (out/filename).write_bytes(png)
    print(filename,size,len(png))
