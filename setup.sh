#!/bin/bash
# ╔══════════════════════════════════════════════════════╗
# ║   ONE1GOD COMMAND CENTER v2 — SETUP APK              ║
# ║   Lance ce script dans GitHub Codespaces             ║
# ╚══════════════════════════════════════════════════════╝

set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   One1god Command Center v2 — APK Setup      ║${NC}"
echo -e "${BLUE}║   Vision · Voix · Builds · Mobile Money      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Node.js ──────────────────────────────────────────
echo -e "${YELLOW}[1/7] Vérification Node.js...${NC}"
node --version && npm --version
echo -e "${GREEN}✓ Node.js OK${NC}"

# ── 2. Java ─────────────────────────────────────────────
echo -e "${YELLOW}[2/7] Vérification Java...${NC}"
if ! command -v java &> /dev/null; then
  echo "Installation Java 17..."
  sudo apt-get update -qq && sudo apt-get install -y openjdk-17-jdk -qq
fi
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
java -version
echo -e "${GREEN}✓ Java OK${NC}"

# ── 3. Android SDK ──────────────────────────────────────
echo -e "${YELLOW}[3/7] Android SDK...${NC}"
export ANDROID_HOME=$HOME/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

if [ ! -d "$ANDROID_HOME/cmdline-tools" ]; then
  mkdir -p $ANDROID_HOME/cmdline-tools
  cd /tmp
  wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O cmdtools.zip
  unzip -q cmdtools.zip
  mv cmdline-tools $ANDROID_HOME/cmdline-tools/latest
  cd -
fi
yes | sdkmanager --licenses > /dev/null 2>&1 || true
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" --silent
echo -e "${GREEN}✓ Android SDK OK${NC}"

# ── 4. Dépendances npm ──────────────────────────────────
echo -e "${YELLOW}[4/7] Installation dépendances npm...${NC}"
npm install
echo -e "${GREEN}✓ npm install OK${NC}"

# ── 5. Build Vite ───────────────────────────────────────
echo -e "${YELLOW}[5/7] Build de l'application...${NC}"
npm run build
echo -e "${GREEN}✓ Build OK${NC}"

# ── 6. Capacitor Android ────────────────────────────────
echo -e "${YELLOW}[6/7] Configuration Capacitor...${NC}"
if [ ! -d "android" ]; then
  npx cap add android
fi
npx cap sync android
echo -e "${GREEN}✓ Capacitor sync OK${NC}"

# ── 7. Permissions Android ──────────────────────────────
echo -e "${YELLOW}[7/7] Injection des permissions Android...${NC}"
MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ -f "$MANIFEST" ]; then
  # Toutes les permissions nécessaires pour le Command Center
  PERMISSIONS='    <!-- RÉSEAU -->\n    <uses-permission android:name="android.permission.INTERNET" />\n    <!-- STOCKAGE -->\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />\n    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />\n    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />\n    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />\n    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />\n    <!-- CONTACTS -->\n    <uses-permission android:name="android.permission.READ_CONTACTS" />\n    <uses-permission android:name="android.permission.WRITE_CONTACTS" />\n    <!-- APPELS -->\n    <uses-permission android:name="android.permission.CALL_PHONE" />\n    <uses-permission android:name="android.permission.READ_CALL_LOG" />\n    <!-- SMS -->\n    <uses-permission android:name="android.permission.SEND_SMS" />\n    <uses-permission android:name="android.permission.READ_SMS" />\n    <!-- MICROPHONE (voix) -->\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <!-- VIBRATION -->\n    <uses-permission android:name="android.permission.VIBRATE" />'

  # Remplacer la permission INTERNET existante par toutes les permissions
  if grep -q "android.permission.INTERNET" "$MANIFEST"; then
    sed -i "s|<uses-permission android:name=\"android.permission.INTERNET\" />|${PERMISSIONS}|" "$MANIFEST"
    echo -e "${GREEN}✓ Toutes les permissions injectées${NC}"
  else
    echo -e "${YELLOW}⚠ Ajouter manuellement les permissions dans AndroidManifest.xml${NC}"
  fi

  # Activer cleartext traffic pour les requêtes API
  sed -i 's|android:usesCleartextTraffic="false"|android:usesCleartextTraffic="true"|g' "$MANIFEST" 2>/dev/null || true
fi

# ── Git push ─────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Push vers GitHub...${NC}"
git add .
git commit -m "feat: One1god Command Center v2 — Vision, Voix, Build Watch, Mobile Money, Contacts" || echo "(Rien à committer)"
git push
echo -e "${GREEN}✓ Push OK${NC}"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   ✅ ONE1GOD COMMAND CENTER v2 PRÊT          ║${NC}"
echo -e "${BLUE}║                                              ║${NC}"
echo -e "${BLUE}║   Fonctionnalités APK :                      ║${NC}"
echo -e "${BLUE}║   ✦ 6 providers IA (Claude, GPT, Gemini...)  ║${NC}"
echo -e "${BLUE}║   🏗️ Build Watch + Auto-Fix automatique      ║${NC}"
echo -e "${BLUE}║   👁️ Vision IA (l'agent voit son travail)    ║${NC}"
echo -e "${BLUE}║   🎤 Commandes vocales                        ║${NC}"
echo -e "${BLUE}║   📞 Contacts + Appels + SMS + Email          ║${NC}"
echo -e "${BLUE}║   💸 MTN MoMo + Orange Money (USSD)           ║${NC}"
echo -e "${BLUE}║   🔮 Scan proactif du code                    ║${NC}"
echo -e "${BLUE}║   🧠 Mémoire Graph                            ║${NC}"
echo -e "${BLUE}║                                              ║${NC}"
echo -e "${BLUE}║   → GitHub Actions → Télécharge l'APK        ║${NC}"
echo -e "${BLUE}║   → Installe sur ton téléphone 📱             ║${NC}"
echo -e "${BLUE}║                                              ║${NC}"
echo -e "${BLUE}║   🙏 Éloïm soit avec toi et tes projets       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
