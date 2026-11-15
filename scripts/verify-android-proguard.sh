#!/usr/bin/env bash
set -euo pipefail
RULES="android/app/proguard-rules.pro"
GRADLE="android/app/build.gradle"
test -s "$RULES"
grep -Fq -- '-keep class * extends androidx.room.RoomDatabase { <init>(); }' "$RULES"
grep -Fq -- '-keep class * extends androidx.work.InputMerger { <init>(); }' "$RULES"
grep -Fq 'proguard-rules.pro' "$GRADLE"
echo "Verified both R8 constructor keep rules and their inclusion in the Android release Gradle configuration."
