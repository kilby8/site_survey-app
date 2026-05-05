f = open(r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\ChecklistEditor.tsx', 'rb')
content = f.read()
f.close()
# Find 'Pass' string context
idx = content.find(b'Pass')
if idx > 0:
    chunk = content[idx-30:idx+10]
    print('hex:', chunk.hex())
    print('utf8:', chunk.decode('utf-8', errors='replace'))
