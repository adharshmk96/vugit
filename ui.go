package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os/exec"
	"runtime"
)

//go:embed ui
var uiFiles embed.FS

// Serve starts the UI server on addr and blocks. When open is set the default
// browser is pointed at the server once it is listening.
func Serve(addr string, open bool) error {
	assets, err := fs.Sub(uiFiles, "ui")
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(assets)))

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}

	url := "http://" + listener.Addr().String()
	fmt.Println("vugit ui running at", url)
	if open {
		openBrowser(url)
	}

	return http.Serve(listener, mux)
}

func openBrowser(url string) {
	var cmd string
	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
	case "windows":
		cmd = "explorer"
	default:
		cmd = "xdg-open"
	}
	_ = exec.Command(cmd, url).Start()
}
