#!/bin/bash
# Setup script for Piper TTS — Spanish model
# Run from the project root: bash scripts/setup-piper.sh

set -e

PIPER_VERSION="2023.11.14-2"
MODEL_DIR="models/piper"
VOICE="es_ES-mls_9972-low"

echo "=== Piper TTS Setup ==="

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    if [ "$ARCH" = "arm64" ]; then
      PIPER_PLATFORM="macos-aarch64"
    else
      PIPER_PLATFORM="macos-x64"
    fi
    ;;
  Linux)
    PIPER_PLATFORM="linux-x64"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

# Download piper binary
if ! command -v piper &> /dev/null; then
  echo "Downloading Piper TTS binary ($PIPER_PLATFORM)..."
  PIPER_URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_${PIPER_PLATFORM}.tar.gz"
  curl -L "$PIPER_URL" -o /tmp/piper.tar.gz
  tar -xzf /tmp/piper.tar.gz -C /usr/local/bin/ piper/piper 2>/dev/null || tar -xzf /tmp/piper.tar.gz -C /tmp/
  if [ -f /tmp/piper/piper ]; then
    sudo mv /tmp/piper/piper /usr/local/bin/piper
    sudo chmod +x /usr/local/bin/piper
  fi
  rm -f /tmp/piper.tar.gz
  echo "Piper binary installed."
else
  echo "Piper binary already installed."
fi

# Download Spanish voice model
mkdir -p "$MODEL_DIR"
if [ ! -f "$MODEL_DIR/${VOICE}.onnx" ]; then
  echo "Downloading Spanish voice model ($VOICE)..."
  MODEL_URL="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx"
  CONFIG_URL="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx.json"
  curl -L "$MODEL_URL" -o "$MODEL_DIR/${VOICE}.onnx"
  curl -L "$CONFIG_URL" -o "$MODEL_DIR/${VOICE}.onnx.json"
  echo "Spanish voice model downloaded."
else
  echo "Spanish voice model already exists."
fi

echo ""
echo "=== Setup complete ==="
echo "Piper binary: $(which piper 2>/dev/null || echo 'not in PATH')"
echo "Model: $MODEL_DIR/${VOICE}.onnx"
echo ""
echo "Test with: echo 'Hola, soy Mabel' | piper --model $MODEL_DIR/${VOICE}.onnx --output-raw | aplay -r 22050 -f S16_LE -c 1"
