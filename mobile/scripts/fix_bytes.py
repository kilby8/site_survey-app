# Fix triple-encoded UTF-8 in ChecklistEditor by working at byte level
f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()

# Each tuple: (bad_bytes_hex, replacement_utf8_bytes_hex)
byte_fixes = [
    # âœ" (triple encoded checkmark U+2714)
    (bytes.fromhex('c3a2c593e2809c'), '\u2714'.encode('utf-8')),
    # âœ— (triple encoded ballot x U+2717)
    (bytes.fromhex('c3a2c593e280%s' % '94'), '\u2717'.encode('utf-8')),
    # âœ• (triple encoded mult x U+2715)
    (bytes.fromhex('c3a2c593e28095'), '\u2715'.encode('utf-8')),
    # â€" (triple encoded em dash U+2014)
    (bytes.fromhex('c3a2e282ace2809c'), '\u2014'.encode('utf-8')),
    # â€¦ (triple encoded ellipsis U+2026)
    (bytes.fromhex('c3a2e282ace280a6'), '\u2026'.encode('utf-8')),
    # â€¢ (triple encoded bullet U+2022)
    (bytes.fromhex('c3a2e282ace28082'), '\u2022'.encode('utf-8')),
    # Â° (double encoded degree U+00B0)
    (bytes.fromhex('c3820c2b0'), '\u00b0'.encode('utf-8')),
]

changed = False
for bad, good in byte_fixes:
    if bad in raw:
        raw = raw.replace(bad, good)
        changed = True
        print(f'fixed {bad.hex()} -> {good}')

if changed:
    open(f, 'wb').write(raw)
    print('saved')
else:
    print('no changes needed')

# verify
lines = open(f, encoding='utf-8', errors='replace').readlines()
for i, line in enumerate(lines):
    if 'Pass' in line or 'Fail' in line or 'N/A' in line:
        print(f'L{i+1}: {line.rstrip()}')
        break
