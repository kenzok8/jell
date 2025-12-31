package ui

import (
	"embed"
	"io/fs"
)

//go:embed dist/*
var staticFiles embed.FS

func GetStaticFS() (fs.FS, error) {
	return fs.Sub(staticFiles, "dist")
}
