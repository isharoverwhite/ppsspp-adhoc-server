package main

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"os"
	"time"

	"github.com/souler/ppsspp-adhoc-go/db"
	"github.com/souler/ppsspp-adhoc-go/protocol"
	"github.com/souler/ppsspp-adhoc-go/state"
)

const (
	DefaultPort    = "27312"
	DefaultUDPPort = "27313"
)

func main() {
	port := os.Getenv("ADHOC_PORT")
	if port == "" {
		port = DefaultPort
	}

	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "database.db"
	}
	database, err := db.InitDB(dbPath)
	if err != nil {
		fmt.Printf("Failed to initialize database: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		fmt.Printf("Failed to listen on port %s: %v\n", port, err)
		os.Exit(1)
	}
	defer listener.Close()

	// Initialize Thread-Safe State Manager
	serverState := state.NewServerState(database)

	// Background Timeout Checker
	go func() {
		for {
			time.Sleep(5 * time.Second)
			now := time.Now()
			
			serverState.Mu.Lock()
			for _, u := range serverState.Users {
				if now.Sub(u.LastRecv) > 15*time.Second {
					fmt.Printf("Timeout: Closing connection for %s (%s)\n", u.Name, u.MACString())
					u.Conn.Close() // handleClient will handle cleanup
				}
			}
			serverState.Mu.Unlock()
		}
	}()

	// Start JSON HTTP API
	startHTTPAPI(serverState)

	// Start UDP Admin listener
	go startAdminUDP(serverState)

	fmt.Printf("PPSSPP Adhoc Server (Go Edition) listening on TCP Port %s\n", port)

	for {
		conn, err := listener.Accept()
		if err != nil {
			fmt.Printf("Failed to accept connection: %v\n", err)
			continue
		}

		go handleClient(conn, serverState)
	}
}

func startAdminUDP(s *state.ServerState) {
	addr, err := net.ResolveUDPAddr("udp", "127.0.0.1:"+DefaultUDPPort)
	if err != nil {
		fmt.Println("Admin UDP resolve error:", err)
		return
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		fmt.Println("Admin UDP listen error:", err)
		return
	}
	defer conn.Close()
	fmt.Printf("Listening for Admin Commands on UDP Port %s\n", DefaultUDPPort)

	buf := make([]byte, 1024)
	for {
		n, _, err := conn.ReadFromUDP(buf)
		if err != nil {
			fmt.Printf("UDP Read Error: %v\n", err)
			continue
		}

		cmdType := buf[0]
		switch cmdType {
		case 1: // Global Broadcast [1][Msg(64)]
			if n >= 2 {
				msg := string(bytes.TrimRight(buf[1:min(n, 65)], "\x00"))
				fmt.Printf("Admin Global Broadcast: %s\n", msg)
				SpreadGlobalMessage(s, msg, false)
			}
		case 2: // Game Broadcast [2][GameID(9)][Msg(64)]
			if n >= 10 {
				gameID := string(bytes.TrimRight(buf[1:10], "\x00"))
				msg := string(bytes.TrimRight(buf[10:min(n, 74)], "\x00"))
				fmt.Printf("Admin Game Broadcast (%s): %s\n", gameID, msg)
				SpreadGameMessage(s, gameID, msg)
			}
		case 3: // Group Broadcast [3][GameID(9)][Group(8)][Msg(64)]
			if n >= 18 {
				gameID := string(bytes.TrimRight(buf[1:10], "\x00"))
				groupName := string(bytes.TrimRight(buf[10:18], "\x00"))
				msg := string(bytes.TrimRight(buf[18:min(n, 82)], "\x00"))
				fmt.Printf("Admin Group Broadcast (%s/%s): %s\n", gameID, groupName, msg)
				SpreadGroupMessage(s, gameID, groupName, msg)
			}
		case 4: // Kick Player [4][MAC(6)]
			if n >= 7 {
				var kickMac protocol.MAC
				copy(kickMac[:], buf[1:7])
				macStr := fmt.Sprintf("%02X:%02X:%02X:%02X:%02X:%02X", kickMac[0], kickMac[1], kickMac[2], kickMac[3], kickMac[4], kickMac[5])
				fmt.Printf("Admin Kick Request: %s\n", macStr)
				s.Mu.RLock()
				user, exists := s.Users[macStr]
				s.Mu.RUnlock()
				if exists {
					user.Conn.Close()
				}
			}
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func handleClient(conn net.Conn, s *state.ServerState) {
	remoteAddr := conn.RemoteAddr().String()

	// Panic Recovery: Đảm bảo server không bao giờ bị crash vì 1 client lỗi
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("[CRITICAL] Recovered from panic in handleClient (%s): %v\n", remoteAddr, r)
		}
		// Clean up user state on disconnect
		s.RemoveUserByConn(conn)
		conn.Close()
	}()

	fmt.Printf("New Connection from %s (Total Users: %d)\n", remoteAddr, s.GetUserCount())

	// Create a new User object (State will be updated on Login)
	user := &state.User{
		Conn:     conn,
		State:    state.UserStateWaiting,
		LastRecv: time.Now(),
	}
	s.AddUser(user)

	buf := make([]byte, 1)

	for {
		// Read Opcode
		n, err := io.ReadFull(conn, buf)
		if err != nil {
			if err != io.EOF {
				fmt.Printf("Connection error from %s: %v (read %d bytes)\n", remoteAddr, err, n)
			} else {
				fmt.Printf("Connection closed by remote (EOF) from %s\n", remoteAddr)
			}
			break
		}

		opcode := buf[0]
		// fmt.Printf("[%s] Received Opcode 0x%02X\n", remoteAddr, opcode)

		// Update LastRecv
		user.UpdateActivity()

		// Route based on Opcode and State
		err = handlePacket(user, opcode, s)
		if err != nil {
			fmt.Printf("Error handling packet 0x%02X from %s: %v\n", opcode, remoteAddr, err)
			break // Disconnect on protocol error
		}
	}

	fmt.Printf("Exiting handleClient loop for %s (User: %s). MAC: %s\n", remoteAddr, user.Name, user.MACString())
	s.RemoveUser(user)
}
