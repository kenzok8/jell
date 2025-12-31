#!/bin/bash
set -e

echo "=== Building InsomClash ==="

cd "$(dirname "$0")"

echo "[1/4] Building frontend..."
cd dash
npm install
npm run build
cd ..

echo "[2/4] Generating Swagger docs..."
swag init -g cmd/server/main.go -o docs

echo "[3/4] Preparing static files..."
rm -rf internal/ui/dist
cp -r dash/dist internal/ui/dist
chmod -R 755 internal/ui/dist

echo "[4/4] Building Go binary (Multi-Arch)..."

# Define target architectures
platforms=(
    "linux/amd64"
    "linux/arm64"
    "linux/386"
    "linux/arm"
    "linux/mips"
    "linux/mipsle"
    "linux/mips64"
    "linux/mips64le"
    "linux/riscv64"
    "linux/ppc64"
    "linux/ppc64le"
    "linux/s390x"
    "android/arm64"
)

mkdir -p bin

for platform in "${platforms[@]}"; do
    platform_split=(${platform//\// })
    GOOS=${platform_split[0]}
    GOARCH=${platform_split[1]}
    output_name="bin/insomclash-$GOOS-$GOARCH"
    
    if [ "$GOARCH" == "arm" ]; then
        # ARMv5
        echo " -> Building for $GOOS/$GOARCH (ARMv5)..."
        env GIN_MODE=release CGO_ENABLED=0 GOOS=$GOOS GOARCH=$GOARCH GOARM=5 \
            go build -ldflags="-s -w" -o "${output_name}v5" ./cmd/server

        # ARMv6
        echo " -> Building for $GOOS/$GOARCH (ARMv6)..."
        env GIN_MODE=release CGO_ENABLED=0 GOOS=$GOOS GOARCH=$GOARCH GOARM=6 \
            go build -ldflags="-s -w" -o "${output_name}v6" ./cmd/server

        # ARMv7
        echo " -> Building for $GOOS/$GOARCH (ARMv7)..."
        env GIN_MODE=release CGO_ENABLED=0 GOOS=$GOOS GOARCH=$GOARCH GOARM=7 \
            go build -ldflags="-s -w" -o "${output_name}v7" ./cmd/server

    else
        echo " -> Building for $GOOS/$GOARCH..."

        EXTRA_ENV=""

        if [ "$GOARCH" = "mips" ] || [ "$GOARCH" = "mipsle" ]; then
            EXTRA_ENV="GOMIPS=softfloat"
        fi

        env GIN_MODE=release CGO_ENABLED=0 GOOS=$GOOS GOARCH=$GOARCH $EXTRA_ENV \
            go build -ldflags="-s -w" -o "$output_name" ./cmd/server
    fi

    if [ $? -ne 0 ]; then
        echo 'An error has occurred! Aborting the script execution...'
        exit 1
    fi
done

echo "[5/5] Build complete!"
echo ""
echo "Binaries available in bin/:"
ls -1 bin/
