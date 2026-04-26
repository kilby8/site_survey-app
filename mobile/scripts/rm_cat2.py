import re
f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\screens\NewSurveyScreen.tsx'
src = open(f, encoding='utf-8').read()

# Remove review row for Category
src = src.replace(
    '              <View style={styles.reviewRow}>\n'
    '                <Text style={styles.reviewKey}>Category</Text>\n'
    "                <Text style={styles.reviewVal}>{selectedCategoryName || '\u2014'}</Text>\n"
    '              </View>\n',
    ''
)

# Remove remaining category styles (different quote style from original file)
src = re.sub(r'  categoryRow: \{[^}]*\},\n', '', src)
src = re.sub(r'  categoryBtn: \{[^}]*\},\n', '', src)
src = re.sub(r'  categoryBtnText: \{[^}]*\},\n', '', src)
src = re.sub(r'  categoryBtnTextActive: \{[^}]*\},\n', '', src)

open(f, 'w', encoding='utf-8').write(src)
remaining = [l for l in src.split('\n') if 'categoryRow' in l or 'categoryBtn' in l or 'reviewKey">Category' in l]
print('Remaining refs:', remaining)
print('Done', len(src))
