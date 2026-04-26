import os
f = r'C:\Users\carpe\source\repos\site_survey-app\mobile\src\components\SurveyCard.tsx'
src = open(f, encoding='utf-8').read()

# Remove category JSX block
src = src.replace(
    "        {survey.category_name && (\n"
    "          <View style={styles.category}>\n"
    "            <Text style={styles.categoryText}>{survey.category_name}</Text>\n"
    "          </View>\n"
    "        )}\n",
    ""
)

# Remove category styles
src = src.replace(
    "  category: {\n"
    "    backgroundColor: 'rgba(255,176,32,0.12)',\n"
    "    borderColor: 'rgba(255,176,32,0.3)',\n"
    "    borderWidth: 1,\n"
    "    paddingHorizontal: 10,\n"
    "    paddingVertical:   3,\n"
    "    borderRadius:      20,\n"
    "  },\n"
    "  categoryText: {\n"
    "    fontSize:  12,\n"
    "    color:     colors.primary,\n"
    "    fontWeight:'600',\n"
    "  },\n",
    ""
)

open(f, 'w', encoding='utf-8').write(src)
print('done', len(src))
