#!/usr/bin/env bash
set -euo pipefail

: "${ANDROID_KEYSTORE_BASE64:?Missing GitHub secret ANDROID_KEYSTORE_BASE64}"
: "${ANDROID_KEYSTORE_PASSWORD:?Missing GitHub secret ANDROID_KEYSTORE_PASSWORD}"

APP_DIR="android/app"
KEYSTORE_PATH="$APP_DIR/mohsen-scout-release.jks"
SIGNING_GRADLE="$APP_DIR/release-signing.gradle"
APP_GRADLE="$APP_DIR/build.gradle"

mkdir -p "$APP_DIR"
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$KEYSTORE_PATH"
test -s "$KEYSTORE_PATH"
chmod 600 "$KEYSTORE_PATH"

# Check the keystore, alias, and credentials before invoking Gradle.
keytool -list -keystore "$KEYSTORE_PATH" \
  -storepass "$ANDROID_KEYSTORE_PASSWORD" \
  -alias mohsenscout >/dev/null

cat > "$SIGNING_GRADLE" <<'GRADLE'
android {
    signingConfigs {
        create("mohsenRelease") {
            storeFile file("$projectDir/mohsen-scout-release.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias "mohsenscout"
            keyPassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.mohsenRelease
        }
    }
}
GRADLE

# Apply the signing configuration from the app module's own directory.
APPLY_LINE='apply from: "$projectDir/release-signing.gradle"'
if ! grep -Fq 'release-signing.gradle' "$APP_GRADLE"; then
  printf '\n%s\n' "$APPLY_LINE" >> "$APP_GRADLE"
fi

echo "Persistent Android release signing is configured and keystore validation passed."
