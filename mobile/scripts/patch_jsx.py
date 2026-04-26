import os
ROOT = r'C:\Users\carpe\source\repos\site_survey-app\mobile'
f = os.path.join(ROOT,'src','screens','LoginScreen.tsx')
src = open(f,encoding='utf-8').read()

OLD = (
'          <View style={styles.card}>\n'
'            <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />\n'
'            <Text style={styles.title}>Site Survey</Text>\n'
'            <Text style={styles.subtitle}>Sign in to continue</Text>\n'
'\n'
'            {status && <StatusBanner type={status.type} message={status.message} />}\n'
'\n'
'            <TextInput\n'
'              value={identifier}\n'
'              onChangeText={setIdentifier}\n'
'              placeholder="Email or username"\n'
'              placeholderTextColor={colors.textMuted}\n'
'              autoCapitalize="none"\n'
'              autoCorrect={false}\n'
'              style={styles.input}\n'
'            />\n'
'\n'
'            <PasswordInput\n'
'              value={password}\n'
'              onChangeText={setPassword}\n'
'              placeholder="Password"\n'
'              placeholderTextColor={colors.textMuted}\n'
'            />\n'
'\n'
'            <TouchableOpacity\n'
'              style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}\n'
'              onPress={handleSignIn}\n'
'              disabled={!canSubmit || submitting}\n'
'            >\n'
'              {submitting ? (\n'
'                <ActivityIndicator color={colors.white} />\n'
'              ) : (\n'
'                <Text style={styles.buttonText}>Sign In</Text>\n'
'              )}\n'
'            </TouchableOpacity>\n'
'\n'
"            <View style={styles.linksRow}>\n"
"              <TouchableOpacity onPress={() => router.push('/register')}>\n"
'                <Text style={styles.linkText}>Create account</Text>\n'
'              </TouchableOpacity>\n'
"              <TouchableOpacity onPress={() => router.push('/forgot-password')}>\n"
'                <Text style={styles.linkText}>Forgot password</Text>\n'
'              </TouchableOpacity>\n'
'            </View>\n'
'\n'
'            <Text style={styles.apiHint}>API: {API_URL}</Text>\n'
'          </View>'
)

NEW = (
'          <View style={styles.card}>\n'
'            <View style={styles.accentBar} />\n'
'            <View style={styles.cardInner}>\n'
'              <View style={styles.logoWrap}>\n'
'                <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />\n'
'              </View>\n'
'              <Text style={styles.title}>Site Survey</Text>\n'
'              <Text style={styles.subtitle}>Sign in to your account</Text>\n'
'\n'
'              {status && <StatusBanner type={status.type} message={status.message} />}\n'
'\n'
'              <Text style={styles.inputLabel}>Email or Username</Text>\n'
'              <TextInput\n'
'                value={identifier}\n'
'                onChangeText={setIdentifier}\n'
'                placeholder="you@example.com"\n'
'                placeholderTextColor={colors.textMuted}\n'
'                autoCapitalize="none"\n'
'                autoCorrect={false}\n'
'                style={styles.input}\n'
'              />\n'
'\n'
'              <Text style={styles.inputLabel}>Password</Text>\n'
'              <PasswordInput\n'
'                value={password}\n'
'                onChangeText={setPassword}\n'
'                placeholder="Your password"\n'
'                placeholderTextColor={colors.textMuted}\n'
'              />\n'
'\n'
'              <TouchableOpacity\n'
'                style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}\n'
'                onPress={handleSignIn}\n'
'                disabled={!canSubmit || submitting}\n'
'              >\n'
'                {submitting ? (\n'
'                  <ActivityIndicator color={colors.white} />\n'
'                ) : (\n'
'                  <Text style={styles.buttonText}>Sign In</Text>\n'
'                )}\n'
'              </TouchableOpacity>\n'
'\n'
"              <View style={styles.linksRow}>\n"
"                <TouchableOpacity onPress={() => router.push('/register')}>\n"
'                  <Text style={styles.linkText}>Create account</Text>\n'
'                </TouchableOpacity>\n'
"                <TouchableOpacity onPress={() => router.push('/forgot-password')}>\n"
'                  <Text style={styles.linkText}>Forgot password?</Text>\n'
'                </TouchableOpacity>\n'
'              </View>\n'
'\n'
'              <Text style={styles.apiHint}>{API_URL}</Text>\n'
'            </View>\n'
'          </View>'
)

if OLD in src:
    src = src.replace(OLD,NEW)
    open(f,'w',encoding='utf-8').write(src)
    print('LoginScreen JSX updated OK', len(src))
else:
    print('OLD not found - dumping first 3000 chars:')
    print(repr(src[:3000]))
