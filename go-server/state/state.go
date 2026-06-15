package state

import (
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/souler/ppsspp-adhoc-go/db"
	"github.com/souler/ppsspp-adhoc-go/protocol"
)

const (
	UserStateWaiting  = 0
	UserStateLoggedIn = 1
)

// User represents a connected client
type User struct {
	Conn     net.Conn
	State    int
	MAC      protocol.MAC
	Name     string
	IP       uint32
	Game     *Game
	Group    *Group
	LastRecv time.Time
}

// MACString returns the string representation of the MAC address
func (u *User) MACString() string {
	return fmt.Sprintf("%02X:%02X:%02X:%02X:%02X:%02X", u.MAC[0], u.MAC[1], u.MAC[2], u.MAC[3], u.MAC[4], u.MAC[5])
}

// Game represents an active game session
type Game struct {
	ProductCode string
	Name        string
	PlayerCount uint32
	Groups      map[string]*Group
}

// Group represents a room within a game
type Group struct {
	Name        string
	Game        *Game
	PlayerCount uint32
	Players     map[string]*User // key is MAC string
}

// ServerState manages all connected users, games, and groups
type ServerState struct {
	Mu    sync.RWMutex
	Users map[string]*User // key: MAC string
	Games map[string]*Game // key: ProductCode
	DB    *db.Database
	Dirty bool             // Flag for status.xml update
}

// NewServerState creates a new thread-safe state manager
func NewServerState(database *db.Database) *ServerState {
	return &ServerState{
		Users: make(map[string]*User),
		Games: make(map[string]*Game),
		DB:    database,
		Dirty: true,
	}
}

// UpdateActivity updates the last received time
func (u *User) UpdateActivity() {
	u.LastRecv = time.Now()
}

// AddUser adds a new user connection to the state
func (s *ServerState) AddUser(u *User) {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	
	// Initially, MAC might be empty, use remote address as temporary key
	key := u.MACString()
	if key == "00:00:00:00:00:00" {
		key = u.Conn.RemoteAddr().String()
	}
	s.Users[key] = u
	s.Dirty = true
}

// RemoveUser cleans up a user, leaving their group and game safely
func (s *ServerState) RemoveUser(u *User) {
	s.Mu.Lock()
	defer s.Mu.Unlock()

	key := u.MACString()
	if key == "00:00:00:00:00:00" {
		key = u.Conn.RemoteAddr().String()
	}

	user, exists := s.Users[key]
	if !exists {
		return
	}

	// Store values before they are cleared for logging
	wasLoggedIn := (user.State == UserStateLoggedIn)
	gameCode := ""
	if user.Game != nil {
		gameCode = user.Game.ProductCode
	}

	// Remove from Group
	if user.Group != nil {
		delete(user.Group.Players, key)
		user.Group.PlayerCount--
		
		// Clean up empty group
		if user.Group.PlayerCount == 0 {
			delete(user.Game.Groups, user.Group.Name)
		}
		user.Group = nil
	}

	// Remove from Game
	if user.Game != nil {
		user.Game.PlayerCount--
		
		// Clean up empty game
		if user.Game.PlayerCount == 0 {
			delete(s.Games, user.Game.ProductCode)
		}
		user.Game = nil
	}

	// Remove from Global Users
	delete(s.Users, key)
	s.Dirty = true
	
	// If they were fully logged in, log their departure
	if wasLoggedIn && gameCode != "" {
		s.DB.LogPlayerLeave(key, user.Name, gameCode)
	}
}

// RemoveUserByConn removes a user by connection object
func (s *ServerState) RemoveUserByConn(conn net.Conn) {
	s.Mu.Lock()
	var foundUser *User
	
	for _, u := range s.Users {
		if u.Conn == conn {
			foundUser = u
			break
		}
	}
	s.Mu.Unlock()
	
	if foundUser != nil {
		s.RemoveUser(foundUser) // Will re-lock inside, which is safe since we unlocked
	}
}

// UpdateUserKey changes the user's key in the map (used after MAC is known during login)
func (s *ServerState) UpdateUserKey(oldKey, newKey string, u *User) {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	
	if _, exists := s.Users[oldKey]; exists {
		delete(s.Users, oldKey)
	}
	s.Users[newKey] = u
}

// GetUserCount returns the total number of connected users safely
func (s *ServerState) GetUserCount() int {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	return len(s.Users)
}

// GetOrCreateGame finds a game or creates a new one thread-safely
func (s *ServerState) GetOrCreateGame(productCode string) *Game {
	s.Mu.Lock()
	defer s.Mu.Unlock()

	game, exists := s.Games[productCode]
	if !exists {
		game = &Game{
			ProductCode: productCode,
			Name:        productCode, // Will be overridden by DB cache in Phase 3
			Groups:      make(map[string]*Group),
		}
		s.Games[productCode] = game
	}
	return game
}
