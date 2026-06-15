package main

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"strings"

	"github.com/souler/ppsspp-adhoc-go/protocol"
	"github.com/souler/ppsspp-adhoc-go/state"
)

func handlePacket(user *state.User, opcode uint8, s *state.ServerState) error {
	remoteAddr := user.Conn.RemoteAddr().String()

	switch user.State {
	case state.UserStateWaiting:
		if opcode == protocol.OpcodeLogin {
			return handleLogin(user, s)
		}
		fmt.Printf("Invalid Opcode 0x%02X in Waiting State from %s\n", opcode, remoteAddr)
		return fmt.Errorf("invalid opcode")

	case state.UserStateLoggedIn:
		switch opcode {
		case protocol.OpcodePing:
			// Ping, just keep alive (already updated LastRecv)
			return nil
		case protocol.OpcodeConnect:
			return handleConnect(user, s)
		case protocol.OpcodeDisconnect:
			return handleDisconnect(user, s)
		case protocol.OpcodeScan:
			return handleScan(user, s)
		case protocol.OpcodeChat:
			return handleChat(user, s)
		default:
			fmt.Printf("Invalid Opcode 0x%02X in Logged-In State from %s\n", opcode, remoteAddr)
			return fmt.Errorf("invalid opcode")
		}

	default:
		return fmt.Errorf("unknown user state")
	}
}

func handleLogin(user *state.User, s *state.ServerState) error {
	// Need to read the rest of the Login packet (143 bytes)
	// LoginPacketC2S is 144 bytes total (1 opcode + 6 mac + 128 name + 9 game)
	buf := make([]byte, 143)
	_, err := io.ReadFull(user.Conn, buf)
	if err != nil {
		return err
	}

	// Reconstruct the full packet for parsing
	fullBuf := make([]byte, 144)
	fullBuf[0] = protocol.OpcodeLogin
	copy(fullBuf[1:], buf)

	var packet protocol.LoginPacketC2S
	if err := packet.Decode(bytes.NewReader(fullBuf)); err != nil {
		return err
	}

	macStr := fmt.Sprintf("%02X:%02X:%02X:%02X:%02X:%02X", packet.MAC[0], packet.MAC[1], packet.MAC[2], packet.MAC[3], packet.MAC[4], packet.MAC[5])
	nameStr := protocol.CString(packet.Name[:])
	gameStr := protocol.CString(packet.Game[:])

	// Product Code Validation (basic alphanumeric)
	for i := 0; i < len(gameStr); i++ {
		c := gameStr[i]
		if !((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
			return fmt.Errorf("invalid product code")
		}
	}

	// Empty MAC/Name checks
	if nameStr == "" || macStr == "FF:FF:FF:FF:FF:FF" || macStr == "00:00:00:00:00:00" {
		return fmt.Errorf("invalid mac or name")
	}

	// Admin Name Check (Case insensitive)
	if strings.Contains(strings.ToLower(nameStr), "admin") {
		return fmt.Errorf("admin impersonation attempt")
	}

	// Evict existing user with same MAC
	s.Mu.RLock()
	existingUser, exists := s.Users[macStr]
	s.Mu.RUnlock()
	if exists && existingUser.Conn != user.Conn {
		existingUser.Conn.Close()
	}

	// Override Game (Crosslinks)
	if override, dbExists := s.DB.GetCrosslink(gameStr); dbExists {
		fmt.Printf("Crosslinked %s to %s (from RAM)\n", gameStr, override)
		gameStr = override
		copy(packet.Game[:], override)
	}

	// Ensure Product is in DB
	s.DB.EnsureProduct(gameStr)

	// Update User
	oldKey := user.MACString()
	if oldKey == "00:00:00:00:00:00" {
		oldKey = user.Conn.RemoteAddr().String()
	}
	user.MAC = packet.MAC
	user.Name = nameStr
	user.State = state.UserStateLoggedIn
	
	// Set IP (IPv4)
	ipStr := ""
	if tcpAddr, ok := user.Conn.RemoteAddr().(*net.TCPAddr); ok {
		ip4 := tcpAddr.IP.To4()
		if ip4 != nil {
			user.IP = uint32(ip4[0]) | uint32(ip4[1])<<8 | uint32(ip4[2])<<16 | uint32(ip4[3])<<24
			ipStr = fmt.Sprintf("%d.%d.%d.%d", ip4[0], ip4[1], ip4[2], ip4[3])
		}
	}

	// Get or Create Game
	user.Game = s.GetOrCreateGame(gameStr)
	user.Game.PlayerCount++

	s.UpdateUserKey(oldKey, user.MACString(), user)

	// Log to database
	s.DB.LogPlayerJoin(user.MACString(), ipStr, user.Name, gameStr)

	// Global broadcast the join message
	gameName, _ := s.DB.GetGameName(gameStr)
	if gameName == "" {
		gameName = gameStr
	}
	sysMsg := fmt.Sprintf("🎮 %s vừa tham gia game %s!", user.Name, gameName)
	SpreadGlobalMessage(s, sysMsg, true)

	fmt.Printf("%s (MAC: %s - IP: %v) started playing %s.\n", user.Name, macStr, user.Conn.RemoteAddr(), gameStr)
	return nil
}

func handleConnect(user *state.User, s *state.ServerState) error {
	// ConnectPacketC2S is 9 bytes total (1 opcode + 8 group)
	buf := make([]byte, 8)
	if _, err := io.ReadFull(user.Conn, buf); err != nil {
		return err
	}

	fullBuf := make([]byte, 9)
	fullBuf[0] = protocol.OpcodeConnect
	copy(fullBuf[1:], buf)

	var packet protocol.ConnectPacketC2S
	if err := packet.Decode(bytes.NewReader(fullBuf)); err != nil {
		return err
	}

	groupName := protocol.CString(packet.Group[:])

	// Validate group name (alphanumeric)
	for i := 0; i < len(groupName); i++ {
		c := groupName[i]
		if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			return fmt.Errorf("invalid group name characters")
		}
	}
	
	// Joining while in group is illegal
	if user.Group != nil {
		return fmt.Errorf("cannot join group while already in a group")
	}

	// Join new group
	s.Mu.Lock()
	if user.Game.Groups[groupName] == nil {
		user.Game.Groups[groupName] = &state.Group{
			Name:    groupName,
			Game:    user.Game,
			Players: make(map[string]*state.User),
		}
	}
	group := user.Game.Groups[groupName]
	group.Players[user.MACString()] = user
	group.PlayerCount++
	user.Group = group
	s.Dirty = true
	s.Mu.Unlock()

	// Determine BSSID (the MAC of the first player, or ourselves if we are first)
	bssidMac := user.MAC
	s.Mu.RLock()
	for _, peer := range group.Players {
		bssidMac = peer.MAC // Just pick one, the C server picked the host
		break
	}
	s.Mu.RUnlock()

	// Send BSSID
	bssidResp := protocol.ConnectBSSIDPacketS2C{
		Opcode: protocol.OpcodeConnectBSSID,
		MAC:    bssidMac,
	}
	user.Conn.Write(bssidResp.Encode())

	// Notify others in group (Send ConnectPacketS2C)
	resp := protocol.ConnectPacketS2C{
		Opcode: protocol.OpcodeConnect,
		IP:     user.IP,
	}
	copy(resp.Name[:], user.Name)
	resp.MAC = user.MAC

	respBytes := resp.Encode()
	
	s.Mu.RLock()
	for _, peer := range group.Players {
		if peer != user {
			peer.Conn.Write(respBytes) // Tell others about me
			
			// Tell me about others
			peerResp := protocol.ConnectPacketS2C{
				Opcode: protocol.OpcodeConnect,
				IP:     peer.IP,
			}
			copy(peerResp.Name[:], peer.Name)
			peerResp.MAC = peer.MAC
			user.Conn.Write(peerResp.Encode())
		}
	}
	s.Mu.RUnlock()

	fmt.Printf("%s joined group %s\n", user.Name, groupName)
	return nil
}

func handleDisconnect(user *state.User, s *state.ServerState) error {
	// No payload to read for disconnect
	if user.Group != nil {
		fmt.Printf("%s left group %s\n", user.Name, user.Group.Name)
		
		resp := protocol.DisconnectPacketS2C{
			Opcode: protocol.OpcodeDisconnect,
			IP:     user.IP,
		}
		respBytes := resp.Encode()

		s.Mu.RLock()
		for _, peer := range user.Group.Players {
			if peer != user {
				peer.Conn.Write(respBytes)
			}
		}
		s.Mu.RUnlock()

		s.Mu.Lock()
		delete(user.Group.Players, user.MACString())
		user.Group.PlayerCount--
		if user.Group.PlayerCount == 0 {
			delete(user.Game.Groups, user.Group.Name)
		}
		user.Group = nil
		s.Dirty = true
		s.Mu.Unlock()
	}
	return nil
}

func handleScan(user *state.User, s *state.ServerState) error {
	if user.Group != nil {
		fmt.Printf("%s attempted to scan while in a group\n", user.Name)
		return fmt.Errorf("cannot scan while in group")
	}

	s.Mu.RLock()
	for _, group := range user.Game.Groups {
		for _, peer := range group.Players {
			if peer.Group != nil {
				resp := protocol.ScanPacketS2C{
					Opcode: protocol.OpcodeScan,
					MAC:    peer.MAC,
				}
				copy(resp.Group[:], group.Name)
				user.Conn.Write(resp.Encode())
				break // Only send one packet per group (the host)
			}
		}
	}
	s.Mu.RUnlock()

	// Send complete
	user.Conn.Write([]byte{protocol.OpcodeScanComplete})
	fmt.Printf("%s scanned groups.\n", user.Name)
	return nil
}

func handleChat(user *state.User, s *state.ServerState) error {
	// ChatPacketC2S is 65 bytes (1 opcode + 64 message)
	buf := make([]byte, 64)
	if _, err := io.ReadFull(user.Conn, buf); err != nil {
		return err
	}

	fullBuf := make([]byte, 65)
	fullBuf[0] = protocol.OpcodeChat
	copy(fullBuf[1:], buf)

	var packet protocol.ChatPacketC2S
	if err := packet.Decode(bytes.NewReader(fullBuf)); err != nil {
		return err
	}

	if user.Group == nil {
		return fmt.Errorf("cannot chat when not in a group")
	}

	resp := protocol.ChatPacketS2C{
		Opcode:  protocol.OpcodeChat,
		Message: packet.Message,
	}
	copy(resp.Name[:], user.Name)
	respBytes := resp.Encode()

	s.Mu.RLock()
	for _, peer := range user.Group.Players {
		if peer != user {
			peer.Conn.Write(respBytes)
		}
	}
	s.Mu.RUnlock()

	// Log to Database
	msgStr := protocol.CString(packet.Message[:])
	s.DB.LogChat(user.MACString(), user.Name, user.Game.ProductCode, user.Group.Name, msgStr)
	
	return nil
}

func SpreadGlobalMessage(s *state.ServerState, message string, isSystem bool) {
	resp := protocol.ChatPacketS2C{
		Opcode: protocol.OpcodeChat,
	}
	
	prefix := "ADMIN: "
	sender := "ADMIN"
	if isSystem {
		prefix = "SYSTEM: "
		sender = "SYSTEM"
	}
	copy(resp.Name[:], sender)
	
	// Add prefix and handle 64-byte limit
	fullMsg := prefix + message
	if len(fullMsg) > 64 {
		fullMsg = fullMsg[:64]
	}
	copy(resp.Message[:], fullMsg)
	
	respBytes := resp.Encode()

	s.Mu.RLock()
	defer s.Mu.RUnlock()
	for _, user := range s.Users {
		if user.State == state.UserStateLoggedIn {
			user.Conn.Write(respBytes)
		}
	}
}

func SpreadGameMessage(s *state.ServerState, gameCode string, message string) {
	resp := protocol.ChatPacketS2C{
		Opcode: protocol.OpcodeChat,
	}
	copy(resp.Name[:], "ADMIN")
	
	fullMsg := "ADMIN: " + message
	if len(fullMsg) > 64 {
		fullMsg = fullMsg[:64]
	}
	copy(resp.Message[:], fullMsg)
	
	respBytes := resp.Encode()

	s.Mu.RLock()
	defer s.Mu.RUnlock()
	for _, user := range s.Users {
		if user.State == state.UserStateLoggedIn && user.Game != nil {
			if user.Game.ProductCode == gameCode {
				user.Conn.Write(respBytes)
			}
		}
	}
}

func SpreadGroupMessage(s *state.ServerState, gameCode string, groupName string, message string) {
	resp := protocol.ChatPacketS2C{
		Opcode: protocol.OpcodeChat,
	}
	copy(resp.Name[:], "ADMIN")
	
	fullMsg := "ADMIN: " + message
	if len(fullMsg) > 64 {
		fullMsg = fullMsg[:64]
	}
	copy(resp.Message[:], fullMsg)
	
	respBytes := resp.Encode()

	s.Mu.RLock()
	defer s.Mu.RUnlock()
	for _, user := range s.Users {
		if user.State == state.UserStateLoggedIn && user.Group != nil && user.Game != nil {
			if user.Game.ProductCode == gameCode && user.Group.Name == groupName {
				user.Conn.Write(respBytes)
			}
		}
	}
}
