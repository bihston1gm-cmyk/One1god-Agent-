#!/bin/bash
# ╔══════════════════════════════════════════════════╗
# ║  ONE1GOD — Auto-setup Android SDK               ║
# ║  S'exécute automatiquement à l'ouverture        ║
# ║  du Codespace. Plus jamais d'installation       ║
# ║  manuelle !                                     ║
# ╚══════════════════════════════════════════════════╝

ANDROID_HOME=/home/vscode/android-sdk
export ANDROID_HOME

# Vérifier si le SDK est déjà installé (volume persistant)
if [ -d "$ANDROID_HOME/cmdline-tools/latest" ]; then
  echo "✅ Android SDK déjà installé — skip"
  exit 0
fi

echo "📦 Installation Android SDK..."
mkdir -p $ANDROID_HOME/cmdline-tools

cd /tmp
wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O cmdtools.zip
unzip -q cmdtools.zip
mv cmdline-tools $ANDROID_HOME/cmdline-tools/latest
cd -

export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

echo "📦 Installation des composants Android..."
yes | sdkmanager --licenses > /dev/null 2>&1 || true
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" --silent

echo "✅ Android SDK installé avec succès !"
echo "ANDROID_HOME=$ANDROID_HOME"
