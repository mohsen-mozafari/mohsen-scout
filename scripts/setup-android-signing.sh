#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_KEYSTORE_BASE64:?Missing GitHub secret ANDROID_KEYSTORE_BASE64}"
: "${ANDROID_KEYSTORE_PASSWORD:?Missing GitHub secret ANDROID_KEYSTORE_PASSWORD}"

KEYSTORE_PATH="android/app/mohsen-scout-release.jks"
SIGNING_GRADLE="android/app/release-signing.gradle"

mkdir -p android/app
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$KEYSTORE_PATH"
test -s "$KEYSTORE_PATH"
chmod 600 "$KEYSTORE_PATH"

# Validate the supplied keystore before Gradle starts.
keytool -list -keystore "$KEYSTORE_PATH" \
  -storepass "$ANDROID_KEYSTORE_PASSWORD" \
  -alias mohsenscout >/dev/null

cat > "$SIGNING_GRADLE" <<'GRADLE'
android {
    signingConfigs {
        release {
            storeFile file("mohsen-scout-release.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias "mohsenscout"
            keyPassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
GRADLE

if ! grep -q 'release-signing.gradle' android/app/build.gradle; then
  printf '\napply from: "./release-signing.gradle"\n' >> android/app/build.gradle
fi

echo "Persistent Android release signing is configured and keystore validation passed."
