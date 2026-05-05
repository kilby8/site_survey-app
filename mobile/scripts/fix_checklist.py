# Fix ChecklistEditor and any other files still showing mojibake
# Strategy: read bytes, decode as latin-1, re-encode to utf-8, then fix known bad sequences
import os

files = [
    r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx',
    r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\screens\HomeScreen.tsx',
]

# Direct string replacements for what we know is wrong
str_fixes = [
    # checkmark, cross, dash rendered as garbled latin
    ('Ã¢Å"\u009c', '\u2714'),   # checkmark (utf8 bytes read as latin1)
    ('Ã¢Å"\u2014', '\u2717'),   # cross
    ('Ã¢â\u20ac\u2014', '\u2014'), # em dash
    ('Ã¢â\u20ac\u00a6', '\u2026'), # ellipsis
    ('Ã¢â\u20ac\u00a2', '\u2022'), # bullet
    ('Ã¢\u009c\u0094', '\u2714'),
    ('Ã¢\u009c\u2014', '\u2717'),
    ('Ã¢\u009c\u0095', '\u2715'),
    ('Ã¢\u0080\u0094', '\u2014'),
    ('Ã¢\u0080\u00a6', '\u2026'),
    ('Ã¢\u009a\u00a1', '\u26A1'),
    ('Ã\u00b0', '\u00B0'),
    ('Ã\u00b7', '\u00B7'),
    # camera/library/mic
    ('ðŸ\u009c·', '\U0001F4F7'),
    ('ðŸ\u0096¼', '\U0001F5BC'),
    ('ðŸ–¼', '\U0001F5BC'),
    ('ðŸ"·', '\U0001F4F7'),
    ('ðŸ—\u2019', '\U0001F5D1'),
    ('ðŸž', '\U0001F41E'),
    ('ðŸ"‹', '\U0001F4CB'),
]

for fpath in files:
    if not os.path.exists(fpath):
        print('not found:', fpath)
        continue
    # Read raw bytes
    raw = open(fpath, 'rb').read()
    # Try decoding as latin-1 (reveals utf-8 mojibake)
    latin = raw.decode('latin-1')
    # Check if it looks like mojibake (has Ã sequences)
    if 'Ã' in latin or 'ðŸ' in latin:
        try:
            # Re-encode as latin-1 then decode as utf-8
            fixed = latin.encode('latin-1').decode('utf-8', errors='replace')
            open(fpath, 'w', encoding='utf-8').write(fixed)
            print('re-encoded:', os.path.basename(fpath))
        except Exception as e:
            print('re-encode failed:', e)
            # Fall back to string replacements
            text = raw.decode('utf-8', errors='replace')
            for bad, good in str_fixes:
                text = text.replace(bad, good)
            open(fpath, 'w', encoding='utf-8').write(text)
    else:
        print('ok:', os.path.basename(fpath))
