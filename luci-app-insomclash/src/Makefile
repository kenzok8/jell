.PHONY: build dev docs clean help deps install-air setup-dev

# Help target untuk menampilkan semua perintah yang tersedia
help:
	@echo "InsomClash - Backend API untuk aplikasi tunneling menggunakan mihomo"
	@echo ""
	@echo "Available commands:"
	@echo "  build        - Build aplikasi untuk production"
	@echo "  dev          - Jalankan development server dengan hot reload (air)"
	@echo "  docs         - Generate swagger documentation"
	@echo "  clean        - Hapus build artifacts dan docs"
	@echo "  deps         - Install Go dependencies"
	@echo "  install-air  - Install air untuk hot reload development"
	@echo "  setup-dev    - Setup lengkap development environment"
	@echo "  help         - Tampilkan pesan bantuan ini"
	@echo ""
	@echo "Usage examples:"
	@echo "  make build              # Build aplikasi"
	@echo "  make dev                # Development dengan hot reload (default config)"
	@echo "  ./insomclash -c /path/to/config.yaml  # Production dengan custom config"
	@echo "  ./insomclash -config /etc/insomclash/app.yaml  # Production dengan config"
	@echo "  make docs               # Generate API documentation"
	@echo "  make clean && make build # Clean build"

# Build untuk production
build:
	@echo "Building insomclash..."
	@mkdir -p $(HOME)/.tmp
	GOCACHE=$(HOME)/.cache/go-build GOTMPDIR=$(HOME)/.tmp go build -o insomclash ./cmd/server


# Development dengan hot reload menggunakan air
dev:
	@echo "Starting development server with hot reload..."
	air

# Generate swagger documentation
docs:
	@echo "Generating swagger documentation..."
	~/go/bin/swag init -g cmd/server/main.go

# Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -f insomclash
	rm -rf docs/

# Install dependencies
deps:
	@echo "Installing dependencies..."
	go mod tidy
	go mod download

# Install air jika belum ada
install-air:
	@echo "Installing air for hot reload..."
	go install github.com/cosmtrek/air@latest

# Setup development environment
setup-dev: install-air deps
	@echo "Development environment setup complete!"