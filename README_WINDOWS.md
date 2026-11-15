# MOHSEN SCOUT — free local Windows APK handoff

## Delivery status

No APK, AAB, downloadable source ZIP, or verified project GitHub URL was produced in this session. The session has no general command runner, Android build action, ZIP/archive uploader, or GitHub sync action. This is a delivery limitation, not evidence that the source cannot build.

The source remains at `/home/daytona/project`. Source/config/assets were inspected; compilation and Windows installation have not been verified. The previous release checks remain recorded in `TEST_RESULTS.md`. No paid service, real API key, live research request, or application change was used for this handoff.

## Export the current project

Bilt's documented source-export route is GitHub:

1. Open the **Bilt project settings**, not the app's Settings tab: **Settings → GitHub → Accounts**. Connect your account if needed through GitHub's authorization screen. Do not paste tokens into chat.
2. Open **Repository → Sync to GitHub**, or **Resync to GitHub** if already connected.
3. After sync finishes, open the repository URL shown there. Confirm the latest source and this file are present. A repository URL cannot be supplied until this completes.
4. On GitHub, use **Code → Download ZIP**, or clone the repository. For a private repository, sign in as an authorized user. A ZIP is a source snapshot, not an APK.

Documentation: https://bilt.me/docs/guides/connect-github and https://bilt.me/docs/features/code-export

Before treating the download as complete, verify these files and folders are included:

- `package.json`, `package-lock.json`, `app.config.ts`, `eas.json`
- `README_FA.md`, `HANDOFF_FA.md`, `AGENTS.md`, `TEST_RESULTS.md`, `README_WINDOWS.md`
- `app/`, `components/`, `hooks/`, `lib/`, `tests/`
- `assets/`, `public/`, `scripts/`, `patches/`, `eslint-rules/`
- `babel.config.js`, `metro.config.cjs`, `tsconfig.json`, `global.css`, `global.d.ts`, `uniwind-types.d.ts`, `workbox-config.js`
- `.gitignore`, `.oxlintrc.json`, `.oxfmtrc.json`

Required icons include `assets/scout-icon.svg`, `assets/scout-icon.png`, and `public/icons/{apple-touch-icon,icon-192,icon-512,icon-512-maskable}.png`. The Node helper `scripts/scout-icon.cjs` and its declaration `scripts/scout-icon.d.cts` must be included because the app config imports it. `patches/heroui-native+1.0.11.patch` must not be omitted.

Do not export `node_modules/`, `.expo/`, caches, private environment files, keystores, or credentials. Dependencies are restored from the lockfile. Android/iOS generated directories are absent from this source and ignored by Git; generate Android locally below. The app needs no mandatory backend or real API key to compile and open.

## Windows prerequisites

- Windows with PowerShell, Node.js compatible with `package.json` (`>=20.19.4`; use a supported Node LTS), and npm (project records `10.9.0`).
- Android Studio with Android SDK, SDK Platform-Tools, Build-Tools, and the platform version required by the generated Gradle project.
- A JDK compatible with that project's Android Gradle Plugin. Configure Android Studio's Gradle JDK and `JAVA_HOME` consistently.
- Set `ANDROID_HOME` to your Android SDK directory and add its `platform-tools` directory to `PATH`. A usual SDK location is `$env:LOCALAPPDATA\Android\Sdk`; check your installation rather than assuming it.
- Internet access for npm and Gradle dependency downloads. No Expo/EAS cloud build, Google Play account, or API key is required for the local route.

Extract or clone into a short path such as `C:\src\mohsen-scout` to reduce Windows path-length issues. Do not use `eas build --local` as the native Windows route; use Android Studio/Gradle.

## Restore and check source

Run in PowerShell from the extracted project root. Run each command separately and stop if it fails:

```powershell
Set-Location C:\src\mohsen-scout
node --version
npm --version
npm ci
npm test
npm run lint
npm run lint:css
npx tsc --noEmit
npx expo-doctor
npx expo install --check
```

The recorded audit reported 23 Expo dependency-version recommendations. These are unresolved readiness findings, not a verified build failure. Keep the exported lockfile unchanged for the first reproduction; do not blindly force upgrades. If local tooling finds incompatible dependencies, resolve the reported mismatch in a separate local branch/copy and rerun checks. `npm ci` runs patch-package through postinstall, but that script tolerates failure: confirm that the HeroUI patch actually applies.

## Generate and build an APK

From the project root:

```powershell
npx expo prebuild --platform android
Set-Location android
.\gradlew.bat :app:assembleRelease
```

Prebuild creates the missing native Android project. No `--clean` is needed for the initial generation. If Gradle reports a missing SDK platform or Build-Tools version, install exactly the reported version in Android Studio's SDK Manager and rerun the failed build.

A successful Gradle build normally places APKs under:

```text
C:\src\mohsen-scout\android\app\build\outputs\apk\release\
```

The expected filename is `app-release.apk` or, if signing is not configured, `app-release-unsigned.apk`. These are expected local locations only; neither exists as a verified deliverable from this session.

Check what was actually generated:

```powershell
Get-ChildItem .\app\build\outputs\apk\release\*.apk
```

## Signing and installation

An APK must be signed before Android can install it. Inspect the generated `android/app/build.gradle` signing configuration. Do not assume that a release variant is signed, or that a debug certificate is suitable for long-term distribution.

For an unsigned APK, open the generated `android` project in Android Studio, then use **Build → Generate Signed Bundle / APK → APK**, choose **release**, and create/use a local keystore. Keep the keystore and passwords private and backed up; they are needed to update the same installed app. Do not send them to Bilt or put them in the source export. Android Studio reports the actual signed output path.

Use the installed Android SDK Build-Tools `apksigner.bat` with the actual APK path:

```text
apksigner.bat verify --verbose --print-certs <actual-apk-path>
```

With USB debugging enabled and a device connected:

```text
adb devices
adb install -r <actual-signed-apk-path>
```

The release build must open without Metro running. If Android reports an incompatible signing certificate for an existing installation, do not uninstall blindly: that removes local data. Export the app's personal backup first and use the original signing key for updates when available.

After building, record the real APK path, signature verification, SHA-256, and installation outcome. PowerShell can compute the hash with `Get-FileHash <actual-apk-path> -Algorithm SHA256`.

Native SQLite persistence, SecureStore, import/share, notifications, scheduling, keyboard and Android navigation still require device/emulator acceptance. Do not replace those checks with the browser diagnostics.

Expo local compilation reference: https://docs.expo.dev/guides/local-app-development/
