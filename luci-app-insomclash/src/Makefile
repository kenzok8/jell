.PHONY: build dev docs clean help deps install-air setup-dev

help:
	@echo "FusionTunX - Backend API untuk aplikasi tunneling menggunakan mihomo"
	@echo ""
	@echo "Available commands:"
	@echo "  build        - Build aplikasi dengan embedded dashboard (1 binary)"
	@echo "  dev          - Jalankan development server dengan hot reload (air)"
	@echo "  docs         - Generate swagger documentation"
	@echo "  clean        - Hapus build artifacts, docs, dan frontend build"
	@echo "  deps         - Install Go dependencies"
	@echo "  install-air  - Install air untuk hot reload development"
	@echo "  setup-dev    - Setup lengkap development environment"
	@echo "  help         - Tampilkan pesan bantuan ini"
	@echo ""
	@echo "Usage examples:"
	@echo "  make build              # Build 1 binary dengan dashboard embedded"
	@echo "  make dev                # Development dengan hot reload (default config)"
	@echo "  ./bin/fusiontunx -c /path/to/config.yaml  # Production dengan custom config"
	@echo "  ./bin/fusiontunx -config /etc/fusiontunx/app.yaml  # Production dengan config"
	@echo "  make docs               # Generate API documentation"
	@echo "  make clean && make build # Clean build"

build:
	@echo "=== Building FusionTunX (Development) ==="
	@echo "[1/4] Building frontend..."
	@cd dash && npm install && npm run build
	@echo "[2/4] Generating Swagger docs..."
	@swag init -g cmd/server/main.go -o docs
	@echo "[3/4] Preparing static files..."
	@rm -rf internal/ui/dist
	@cp -r dash/dist internal/ui/dist
	@chmod -R 755 internal/ui/dist
	@echo "[4/4] Building Go binary with embedded dashboard..."
	@mkdir -p bin
	@mkdir -p $(HOME)/.tmp
	@env GIN_MODE=release CGO_ENABLED=0 GOCACHE=$(HOME)/.cache/go-build GOTMPDIR=$(HOME)/.tmp \
		go build -ldflags="-s -w" -o bin/fusiontunx ./cmd/server
	@echo ""
	@echo "✓ Build complete! Binary: bin/fusiontunx"

dev:
	@echo "Starting development server with hot reload..."
	air

docs:
	@echo "Generating swagger documentation..."
	~/go/bin/swag init -g cmd/server/main.go

clean:
	@echo "Cleaning..."
	rm -rf bin/
	rm -rf docs/
	rm -rf internal/ui/dist
	rm -rf dash/dist
	rm -rf dash/node_modules

deps:
	@echo "Installing dependencies..."
	go mod tidy
	go mod download

install-air:
	@echo "Installing air for hot reload..."
	go install github.com/cosmtrek/air@latest

setup-dev: install-air deps
	@echo "Development environment setup complete!"