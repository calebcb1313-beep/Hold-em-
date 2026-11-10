#!/usr/bin/env bash
set -euo pipefail
T="$HOME/tools"; mkdir -p "$T"; cd "$T"
if [ ! -x "$T/jdk17/bin/java" ]; then
  echo "[setup] downloading JDK 17"
  curl -fsSL -o jdk.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  rm -rf jdk17 && mkdir -p jdk17 && tar -xzf jdk.tar.gz -C jdk17 --strip-components=1
fi
export JAVA_HOME="$T/jdk17"; export PATH="$JAVA_HOME/bin:$PATH"
echo "[setup] java: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
export ANDROID_SDK_ROOT="$T/sdk"; mkdir -p "$ANDROID_SDK_ROOT"
if [ ! -x "$T/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "[setup] downloading cmdline-tools"
  curl -fsSL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  rm -rf tmpcmd cmdline-tools && mkdir -p tmpcmd && unzip -q cmdtools.zip -d tmpcmd && mkdir -p cmdline-tools && mv tmpcmd/cmdline-tools cmdline-tools/latest
fi
export PATH="$T/cmdline-tools/latest/bin:$PATH"
yes | sdkmanager --sdk_root="$ANDROID_SDK_ROOT" --licenses >/dev/null 2>&1 || true
sdkmanager --sdk_root="$ANDROID_SDK_ROOT" "platforms;android-34" "build-tools;34.0.0"
echo "[setup] SDK READY"; ls "$ANDROID_SDK_ROOT/build-tools/34.0.0" | head -20
