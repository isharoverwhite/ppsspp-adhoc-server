package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"

	"github.com/souler/ppsspp-adhoc-go/state"
)

func startWelcomeServer(s *state.ServerState) {
	port := os.Getenv("PUBLIC_WEB_PORT")
	if port == "" {
		port = "80" // Default Port 80 for Public Welcome Page
	}

	welcomeDir := os.Getenv("WELCOME_DIR")
	if welcomeDir == "" {
		candidates := []string{
			"welcome",
			"../welcome",
			"/opt/ppsspp-adhoc-server/welcome",
			"/app/welcome",
		}
		for _, c := range candidates {
			if info, err := os.Stat(c); err == nil && info.IsDir() {
				welcomeDir = c
				break
			}
		}
		if welcomeDir == "" {
			welcomeDir = "welcome"
		}
	}

	absDir, _ := filepath.Abs(welcomeDir)

	mux := http.NewServeMux()
	
	// Expose API directly through the Public Welcome Server (Port 80)
	mux.HandleFunc("/api/status", GetStatusHandler(s))

	fileServer := http.FileServer(http.Dir(welcomeDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		ext := filepath.Ext(r.URL.Path)
		if ext == ".png" || ext == ".jpg" || ext == ".ico" || ext == ".svg" || ext == ".woff2" {
			w.Header().Set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
		} else if ext == ".html" || r.URL.Path == "/" {
			w.Header().Set("Cache-Control", "public, max-age=0, must-revalidate")
		}
		fileServer.ServeHTTP(w, r)
	})

	// Try listening on the configured port
	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		fmt.Printf("Notice: Port %s unavailable (%v). Starting Welcome WebUI on fallback Port 8088...\n", port, err)
		fallbackPort := "8088"
		fbListener, fbErr := net.Listen("tcp", ":"+fallbackPort)
		if fbErr != nil {
			fmt.Printf("Warning: Could not start Welcome WebUI on fallback port %s: %v\n", fallbackPort, fbErr)
			return
		}
		fmt.Printf("Public Welcome WebUI (Chiikawa Edition) listening on Port %s (serving from %s)\n", fallbackPort, absDir)
		go http.Serve(fbListener, mux)
		return
	}

	fmt.Printf("Public Welcome WebUI (Chiikawa Edition) listening on Port %s (serving from %s)\n", port, absDir)
	go http.Serve(listener, mux)
}
