import os
ROOT = r'C:\Users\carpe\source\repos\site_survey-app\mobile'
def rw(rel, c): open(os.path.join(ROOT,rel),'w',encoding='utf-8').write(c); print('wrote',rel,len(c))
def rd(rel): return open(os.path.join(ROOT,rel),encoding='utf-8').read()

# -- LoginScreen styles --
login = rd('src/screens/LoginScreen.tsx')
login = login.replace(
  "  card: {\n    width: '100%',\n    maxWidth: 420,\n    backgroundColor: colors.card,\n    borderRadius: 14,\n    padding: 20,\n    borderWidth: 1,\n    borderColor: colors.border,\n  },\n  logo: { width: 170, height: 72, alignSelf: 'center', marginBottom: 8 },\n  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },\n  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6, marginBottom: 18 },\n  input: {\n    borderWidth: 1,\n    borderColor: colors.inputBorder,\n    borderRadius: 10,\n    height: 46,\n    paddingHorizontal: 12,\n    color: colors.textPrimary,\n    marginBottom: 12,\n    backgroundColor: colors.inputBg,\n  },\n  button: {\n    height: 46,\n    borderRadius: 10,\n    backgroundColor: BRAND_PRIMARY,\n    alignItems: 'center',\n    justifyContent: 'center',\n    marginTop: 2,\n  },\n  buttonDisabled: { opacity: 0.6 },\n  buttonText: { color: '#0B1220', fontSize: 15, fontWeight: '700' },\n  linksRow: {\n    marginTop: 12,\n    flexDirection: 'row',\n    justifyContent: 'space-between',\n  },\n  linkText: { color: BRAND_PRIMARY, fontSize: 13, fontWeight: '600' },\n  apiHint: { marginTop: 10, fontSize: 11, color: colors.textMuted },",
  "  card: {\n    width: '100%',\n    maxWidth: 420,\n    backgroundColor: colors.card,\n    borderRadius: 20,\n    overflow: 'hidden',\n    borderWidth: 1,\n    borderColor: colors.border,\n    shadowColor: '#000',\n    shadowOffset: { width: 0, height: 10 },\n    shadowOpacity: 0.45,\n    shadowRadius: 24,\n    elevation: 12,\n  },\n  accentBar: { height: 4, backgroundColor: BRAND_PRIMARY },\n  cardInner: { padding: 28 },\n  logoWrap: { alignItems: 'center', marginBottom: 20 },\n  logo: { width: 150, height: 64, borderRadius: 8 },\n  title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.5 },\n  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6, marginBottom: 24, textAlign: 'center' },\n  inputLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },\n  input: {\n    borderWidth: 1.5,\n    borderColor: colors.inputBorder,\n    borderRadius: 12,\n    height: 50,\n    paddingHorizontal: 14,\n    color: colors.textPrimary,\n    marginBottom: 16,\n    backgroundColor: colors.inputBg,\n    fontSize: 15,\n  },\n  button: {\n    height: 52,\n    borderRadius: 14,\n    backgroundColor: BRAND_PRIMARY,\n    alignItems: 'center',\n    justifyContent: 'center',\n    marginTop: 4,\n    shadowColor: BRAND_PRIMARY,\n    shadowOffset: { width: 0, height: 6 },\n    shadowOpacity: 0.5,\n    shadowRadius: 14,\n    elevation: 8,\n  },\n  buttonDisabled: { opacity: 0.45, shadowOpacity: 0 },\n  buttonText: { color: '#0B1220', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },\n  linksRow: {\n    marginTop: 20,\n    flexDirection: 'row',\n    justifyContent: 'space-between',\n  },\n  linkText: { color: BRAND_PRIMARY, fontSize: 13, fontWeight: '600' },\n  apiHint: { marginTop: 16, fontSize: 11, color: colors.textMuted, textAlign: 'center' },"
)
rw('src/screens/LoginScreen.tsx', login)

# -- SurveyCard --
card = rd('src/components/SurveyCard.tsx')
card = card.replace("    borderRadius:    12,\n    padding:         16,\n    marginBottom:    12,\n    shadowColor:     '#000',\n    shadowOffset:    { width: 0, height: 1 },\n    shadowOpacity:   0.08,\n    shadowRadius:    4,\n    elevation:       2,", "    borderRadius:    16,\n    padding:         16,\n    marginBottom:    14,\n    shadowColor:     '#000',\n    shadowOffset:    { width: 0, height: 4 },\n    shadowOpacity:   0.28,\n    shadowRadius:    10,\n    elevation:       6,\n    borderLeftWidth: 4,\n    borderLeftColor: colors.primary,")
card = card.replace("    fontSize:    17,\n    fontWeight:  '700',", "    fontSize:    19,\n    fontWeight:  '800',\n    letterSpacing: -0.3,")
card = card.replace("    fontSize:    15,\n    color:       colors.textSecondary,\n    fontWeight:  '600',\n    marginBottom: 2,", "    fontSize:    14,\n    color:       colors.primary,\n    fontWeight:  '600',\n    marginBottom: 4,")
card = card.replace("    backgroundColor: colors.inputBg,\n    borderColor: colors.inputBorder,\n    borderWidth: 1,\n    paddingHorizontal: 8,\n    paddingVertical:   2,\n    borderRadius:      8,", "    backgroundColor: 'rgba(255,176,32,0.12)',\n    borderColor: 'rgba(255,176,32,0.3)',\n    borderWidth: 1,\n    paddingHorizontal: 10,\n    paddingVertical:   3,\n    borderRadius:      20,")
rw('src/components/SurveyCard.tsx', card)

# -- HomeScreen --
home = rd('src/screens/HomeScreen.tsx')
home = home.replace("  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },", "  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },")
home = home.replace("  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textMuted },", "  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textSecondary },")
home = home.replace("  fabText: { color: colors.white, fontSize: 30, lineHeight: 34, fontWeight: '300' },", "  fabText: { color: '#0B1220', fontSize: 32, lineHeight: 36, fontWeight: '700' },")
home = home.replace("    shadowColor: '#0f172a',\n    shadowOffset: { width: 0, height: 2 },\n    shadowOpacity: 0.06,\n    shadowRadius: 6,\n    elevation: 2,", "    shadowColor: '#000',\n    shadowOffset: { width: 0, height: 4 },\n    shadowOpacity: 0.3,\n    shadowRadius: 10,\n    elevation: 6,")
rw('src/screens/HomeScreen.tsx', home)

# -- AuthFormHelpers --
h = rd('src/components/AuthFormHelpers.tsx')
h = h.replace("    borderWidth: 1,\n    borderColor: colors.inputBorder,\n    borderRadius: 10,\n    backgroundColor: colors.inputBg,\n    marginBottom: 12,\n    height: 46,\n    paddingHorizontal: 12,", "    borderWidth: 1.5,\n    borderColor: colors.inputBorder,\n    borderRadius: 12,\n    backgroundColor: colors.inputBg,\n    marginBottom: 16,\n    height: 50,\n    paddingHorizontal: 14,")
h = h.replace("    borderRadius: 8,\n    paddingHorizontal: 12,\n    paddingVertical: 10,\n    marginBottom: 14,", "    borderRadius: 10,\n    paddingHorizontal: 14,\n    paddingVertical: 12,\n    marginBottom: 16,")
rw('src/components/AuthFormHelpers.tsx', h)

print('ALL DONE')
