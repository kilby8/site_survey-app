import os, re
f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\screens\NewSurveyScreen.tsx'
src = open(f, encoding='utf-8').read()

# Remove the Category section block
OLD = (
"              <View style={styles.section}>\n"
"                <Text style={styles.label}>Category</Text>\n"
"                <View style={styles.categoryRow}>\n"
"                  {SURVEY_CATEGORIES.filter((c) => c.id).map((c) => (\n"
"                    <TouchableOpacity\n"
"                      key={c.id}\n"
"                      style={[\n"
"                        styles.categoryBtn,\n"
"                        categoryId === c.id && styles.categoryBtnActive,\n"
"                      ]}\n"
"                      onPress={() => setCategoryId(c.id)}\n"
"                    >\n"
"                      <Text\n"
"                        style={[\n"
"                          styles.categoryBtnText,\n"
"                          categoryId === c.id && styles.categoryBtnTextActive,\n"
"                        ]}\n"
"                      >\n"
"                        {c.name}\n"
"                      </Text>\n"
"                    </TouchableOpacity>\n"
"                  ))}\n"
"                </View>\n"
"              </View>\n"
"\n"
)
if OLD in src:
    src = src.replace(OLD, "")
    print("Category section removed from JSX")
else:
    print("WARNING: block not found exactly - trying regex")
    src = re.sub(
        r'\s*<View style=\{styles\.section\}>\s*<Text style=\{styles\.label\}>Category</Text>.*?</View>\s*</View>\n',
        '\n',
        src,
        flags=re.DOTALL,
        count=1
    )
    print("Regex replace done")

# Remove category styles
for old_style in [
    "  categoryRow: {\n    flexDirection: 'row',\n    flexWrap: 'wrap',\n    gap: 8,\n  },\n",
    "  categoryBtn: {\n    paddingHorizontal: 14,\n    paddingVertical: 8,\n    borderRadius: 20,\n    borderWidth: 1,\n    borderColor: colors.inputBorder,\n    backgroundColor: colors.inputBg,\n  },\n",
    "  categoryBtnActive: {\n    backgroundColor: colors.primary,\n    borderColor: colors.primary,\n  },\n",
    "  categoryBtnText: {\n    color: colors.textSecondary,\n    fontSize: 13,\n    fontWeight: '600',\n  },\n",
    "  categoryBtnTextActive: {\n    color: '#0B1220',\n  },\n",
]:
    if old_style in src:
        src = src.replace(old_style, "")
        print(f"  removed style block ({old_style[:30].strip()}...)")

open(f, 'w', encoding='utf-8').write(src)
print('Done', len(src))
