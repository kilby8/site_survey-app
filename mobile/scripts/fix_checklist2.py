f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx'
raw = open(f, 'rb').read()
text = raw.decode('utf-8', errors='replace')

# Each bad sequence is the UTF-8 bytes of the mojibake string, decoded as UTF-8
# We identify them by their byte patterns and replace
fixes = {
    '\u00e2\u009c\u0094': '\u2714',  # checkmark
    '\u00e2\u009c\u0097': '\u2717',  # ballot x
    '\u00e2\u009c\u0095': '\u2715',  # mult x
    '\u00e2\u0080\u0094': '\u2014',  # em dash
    '\u00e2\u0080\u00a6': '\u2026',  # ellipsis
    '\u00e2\u0080\u00a2': '\u2022',  # bullet
    '\u00c2\u00b0': '\u00b0',        # degree
    '\u00c2\u00b7': '\u00b7',        # middle dot
    '\u00f0\u009f\u0093\u00b7': '\U0001F4F7',  # camera
    '\u00f0\u009f\u0096\u00bc': '\U0001F5BC',  # picture
    '\u00f0\u009f\u0097\u2019': '\U0001F5D1',  # trash
    '\u00f0\u009f\u0094\u008b': '\U0001F4CB',  # clipboard
    '\u00f0\u009f\u008c\u00b1': '\U0001F331',  # plant
    '\u00f0\u009f\u00a0': '\U0001F3E0',        # house
    '\u00f0\u009f\u00a2': '\U0001F3E2',        # building
    '\u00f0\u009f\u009b\u00b0': '\U0001F6F0',  # satellite
    '\u00e2\u009a\u00a1': '\u26A1',            # lightning
    '\u00f0\u009f\u0094\u00b7': '\U0001F4F7',  # camera alt
    '\u00f0\u009f\u008e\u00a4': '\U0001F3A4',  # mic
    '&#x1F3A4;': '\U0001F3A4',
}

for bad, good in fixes.items():
    if bad in text:
        text = text.replace(bad, good)
        print(f'fixed: U+{ord(bad[0]):04X}... -> {repr(good)}')

open(f, 'w', encoding='utf-8').write(text)
lines = open(f, encoding='utf-8').readlines()
for i in [48,49,50,162,163,218,244,245,268]:
    if i < len(lines): print(f'L{i+1}: {lines[i].rstrip()}')
