"""Minimal NBT (gzip, big-endian) read/write for editing level.dat in tests."""
import gzip, struct, sys, json
def r(f, t):
    if t==1: return ('b', struct.unpack('>b', f.read(1))[0])
    if t==2: return ('s', struct.unpack('>h', f.read(2))[0])
    if t==3: return ('i', struct.unpack('>i', f.read(4))[0])
    if t==4: return ('l', struct.unpack('>q', f.read(8))[0])
    if t==5: return ('f', struct.unpack('>f', f.read(4))[0])
    if t==6: return ('d', struct.unpack('>d', f.read(8))[0])
    if t==7: n=struct.unpack('>i', f.read(4))[0]; return ('B', f.read(n))
    if t==8: n=struct.unpack('>H', f.read(2))[0]; return ('S', f.read(n).decode('utf-8'))
    if t==9:
        et=f.read(1)[0]; n=struct.unpack('>i', f.read(4))[0]; return ('L', (et, [r(f,et) for _ in range(n)]))
    if t==10:
        d={}
        while True:
            tt=f.read(1)[0]
            if tt==0: break
            n=struct.unpack('>H', f.read(2))[0]; k=f.read(n).decode('utf-8'); d[k]=(tt, r(f,tt))
        return ('C', d)
    if t==11: n=struct.unpack('>i', f.read(4))[0]; return ('I', list(struct.unpack('>%di'%n, f.read(4*n))))
    if t==12: n=struct.unpack('>i', f.read(4))[0]; return ('Lg', list(struct.unpack('>%dq'%n, f.read(8*n))))
    raise ValueError(t)
def w(f, t, v):
    k, x = v
    if t==1: f.write(struct.pack('>b', x))
    elif t==2: f.write(struct.pack('>h', x))
    elif t==3: f.write(struct.pack('>i', x))
    elif t==4: f.write(struct.pack('>q', x))
    elif t==5: f.write(struct.pack('>f', x))
    elif t==6: f.write(struct.pack('>d', x))
    elif t==7: f.write(struct.pack('>i', len(x))); f.write(x)
    elif t==8: b=x.encode('utf-8'); f.write(struct.pack('>H', len(b))); f.write(b)
    elif t==9:
        et, items = x; f.write(bytes([et])); f.write(struct.pack('>i', len(items)))
        for it in items: w(f, et, it)
    elif t==10:
        for key,(tt,vv) in x.items():
            f.write(bytes([tt])); b=key.encode('utf-8'); f.write(struct.pack('>H', len(b))); f.write(b); w(f, tt, vv)
        f.write(b'\0')
    elif t==11: f.write(struct.pack('>i', len(x))); f.write(struct.pack('>%di'%len(x), *x))
    elif t==12: f.write(struct.pack('>i', len(x))); f.write(struct.pack('>%dq'%len(x), *x))
def load(path):
    f=gzip.open(path,'rb'); t=f.read(1)[0]; n=struct.unpack('>H', f.read(2))[0]; name=f.read(n).decode(); return name, r(f,t)
def save(path, name, root):
    import io; b=io.BytesIO(); b.write(b'\x0a'); nb=name.encode(); b.write(struct.pack('>H', len(nb))); b.write(nb); w(b,10,root)
    with gzip.open(path,'wb') as f: f.write(b.getvalue())
def show(v, ind=0):
    k,x=v
    if k=='C':
        for key,(t,vv) in x.items():
            if vv[0] in ('C',): print(' '*ind+key+':'); show(vv, ind+2)
            elif vv[0]=='L': print(' '*ind+key+': list[%d]'%len(vv[1][1]))
            else: print(' '*ind+key+' = '+str(vv[1])[:80])
def _data(root):
    """The Data compound of a level.dat root."""
    return root[1]['Data'][1][1]

def set_test_world(path, name=None):
    """Peaceful, creative, commands allowed. Handles the old Difficulty byte and 26.x difficulty_settings."""
    rootname, root = load(path)
    d = _data(root)
    d['GameType'] = (3, ('i', 1))
    d['allowCommands'] = (1, ('b', 1))
    if 'difficulty_settings' in d:
        ds = d['difficulty_settings'][1][1]
        ds['difficulty'] = (8, ('S', 'peaceful'))
    else:
        d['Difficulty'] = (1, ('b', 0))
    if name:
        d['LevelName'] = (8, ('S', name))
    save(path, rootname, root)

if __name__=='__main__':
    usage = "usage: nbt.py show <level.dat> | nbt.py set-test-world <save dir or level.dat> [LevelName]"
    a = sys.argv[1:]
    if not a: sys.exit(usage)
    if a[0] == 'set-test-world' and len(a) >= 2:
        import os
        p = a[1]
        if os.path.isdir(p): p = os.path.join(p, 'level.dat')
        set_test_world(p, a[2] if len(a) > 2 else None)
        print('ok', p)
    elif a[0] == 'show' and len(a) == 2:
        name, root = load(a[1]); show(root)
    elif len(a) == 1:
        name, root = load(a[0]); show(root)
    else:
        sys.exit(usage)
