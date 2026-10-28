#!/usr/bin/env bash
# Bouwt de F-licentie trainer als Android-app (android/dist/F-licentie-trainer.apk). Geen Gradle of Android Studio nodig.
# Gebruik: VERSIE=0.1 bash android/build.sh
# Nodig: JDK 17+ (JAVA_HOME) en Android SDK (ANDROID_HOME) met platforms;android-37.0 en build-tools;37.0.0.
# Ondertekenen: sleutel in ~/.android/f-licentie-release.jks (wordt de eerste keer gemaakt). BEWAAR die sleutel:
# zonder dezelfde sleutel kan een nieuwe versie niet over de oude heen geïnstalleerd worden.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
: "${JAVA_HOME:=$HOME/sdk/jdk21}" "${ANDROID_HOME:=$HOME/sdk/android}"
BT="$ANDROID_HOME/build-tools/37.0.0" JAR="$ANDROID_HOME/platforms/android-37.0/android.jar"
VERSIE="${VERSIE:-0.1}" CODE="$(git -C "$ROOT" rev-list --count HEAD)"
KS="$HOME/.android/f-licentie-release.jks" PW="$HOME/.android/f-licentie-release.pass"
export PATH="$JAVA_HOME/bin:$PATH"

rm -rf build dist && mkdir -p build/assets/app/img build/classes dist
# Alleen wat de app gebruikt (img/theorievragen, bronbestanden en de PWA-service-worker niet).
cp "$ROOT/index.html" build/assets/app/
cp -r "$ROOT/css" "$ROOT/js" "$ROOT/data" build/assets/app/
for d in examenvragen theorie veron logo; do cp -r "$ROOT/img/$d" build/assets/app/img/; done
sed -i "/serviceWorker/d" build/assets/app/index.html
# Geen accountserver in de app: voortgang blijft op de telefoon (meenemen kan met de overdraag-code onder Meer).
sed -i "s/BACKEND = 'pocketbase'/BACKEND = 'geen'/" build/assets/app/js/config.js

"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/app.apk -I "$JAR" --manifest AndroidManifest.xml -A build/assets --java build/gen \
  --min-sdk-version 24 --target-sdk-version 37 --version-code "$CODE" --version-name "$VERSIE" build/res.zip
javac -nowarn -source 8 -target 8 -classpath "$JAR" -d build/classes $(find src build/gen -name '*.java') 2>&1 | grep -v '^warning' || true
"$BT/d8" --release --lib "$JAR" --min-api 24 --output build $(find build/classes -name '*.class')
(cd build && zip -q app.apk classes.dex)
"$BT/zipalign" -f -p 4 build/app.apk build/aligned.apk

if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$PW" && chmod 600 "$PW"
  keytool -genkeypair -keystore "$KS" -alias flicentie -keyalg RSA -keysize 4096 -validity 36500 \
    -storepass "$(cat "$PW")" -dname "CN=F-licentie trainer" >/dev/null
  echo "Nieuwe sleutel: $KS (wachtwoord in $PW). Maak hier een back-up van!"
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass "file:$PW" --out dist/F-licentie-trainer.apk build/aligned.apk
rm -rf build dist/*.idsig
ls -lh dist
