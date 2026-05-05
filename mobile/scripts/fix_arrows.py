f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\screens\NewSurveyScreen.tsx'
raw = open(f, 'rb').read()

# Find the arrow sequences
for label in [b'Back', b'Next']:
    idx = raw.find(label)
    if idx > 0:
        chunk = raw[idx-15:idx+10]
        print(label.decode(), ':', chunk.hex(), '->', repr(chunk.decode('utf-8', errors='replace')))
