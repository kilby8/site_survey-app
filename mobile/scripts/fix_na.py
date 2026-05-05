f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()

idx = raw.find(b'N/A')
chunk = raw[idx-15:idx+5]
print('hex around N/A:', chunk.hex())
print('decoded:', chunk.decode('utf-8', errors='replace'))

# Fix remaining em dash mojibake variants
more_fixes = [
    (b'\xc3\xa2\xe2\x82\xac\xe2\x80\x94', '\u2014'.encode()),  # â€" variant 1
    (b'\xc3\xa2\xe2\x82\xac\x22', b'\xe2\x80\x9d'),             # closing quote
    (b'\xe2\x80\x94', '\u2014'.encode()),                       # correct em dash (keep)
]

# The N/A uses an en dash (–) or em dash
# Let's find exact bytes
for i in range(max(0,idx-10), idx):
    b = raw[i:i+4]
    print(f'  offset {i-idx}: {b.hex()} = {b.decode(\"utf-8\", errors=\"replace\")}')
