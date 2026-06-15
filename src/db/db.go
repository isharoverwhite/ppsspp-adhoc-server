package db

import (
	"database/sql"
	"fmt"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Database struct {
	conn *sql.DB

	// RAM Caches
	mu             sync.RWMutex
	productCache   map[string]string
	crosslinkCache map[string]string

	// Maintenance
	lastCleanupDay int
}

func InitDB(dbPath string) (*Database, error) {
	fmt.Printf("DB: Opening database at %s\n", dbPath)
	conn, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %v", err)
	}

	// Enable WAL mode for better concurrency
	if _, err := conn.Exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"); err != nil {
		fmt.Printf("Warning: failed to enable WAL mode: %v\n", err)
	}

	db := &Database{
		conn:           conn,
		productCache:   make(map[string]string),
		crosslinkCache: make(map[string]string),
		lastCleanupDay: -1,
	}

	if err := db.validateTables(); err != nil {
		return nil, err
	}

	if err := db.LoadCache(); err != nil {
		return nil, err
	}

	// Clean up stale sessions from previous runs
	if err := db.CleanupSessions(); err != nil {
		fmt.Printf("Warning: failed to cleanup stale sessions: %v\n", err)
	}

	// Start background daily cleanup ticker
	go db.startMaintenanceTicker()

	return db, nil
}

func (db *Database) startMaintenanceTicker() {
	ticker := time.NewTicker(24 * time.Hour)
	// Run once immediately on start
	db.MonthlyCleanup()
	
	for range ticker.C {
		db.MonthlyCleanup()
	}
}

func (db *Database) CleanupSessions() error {
	_, err := db.conn.Exec("UPDATE PlayerHistory SET leftAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE leftAt IS NULL")
	return err
}

func (db *Database) validateTables() error {
	productidsSchema := `
	CREATE TABLE IF NOT EXISTS productids (
		id TEXT PRIMARY KEY,
		name TEXT
	);`
	if _, err := db.conn.Exec(productidsSchema); err != nil {
		return fmt.Errorf("failed to create productids table: %v", err)
	}

	crosslinksSchema := `
	CREATE TABLE IF NOT EXISTS crosslinks (
		id_from TEXT PRIMARY KEY,
		id_to TEXT
	);`
	if _, err := db.conn.Exec(crosslinksSchema); err != nil {
		return fmt.Errorf("failed to create crosslinks table: %v", err)
	}

	historySchema := `
	CREATE TABLE IF NOT EXISTS PlayerHistory (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		mac TEXT,
		ip TEXT,
		name TEXT,
		game TEXT,
		joinedAt TEXT,
		leftAt TEXT
	);`
	if _, err := db.conn.Exec(historySchema); err != nil {
		return fmt.Errorf("failed to create PlayerHistory table: %v", err)
	}

	chatSchema := `
	CREATE TABLE IF NOT EXISTS ChatMessage (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		mac TEXT,
		name TEXT,
		game TEXT,
		"group" TEXT,
		message TEXT,
		createdAt TEXT
	);`
	if _, err := db.conn.Exec(chatSchema); err != nil {
		return fmt.Errorf("failed to create ChatMessage table: %v", err)
	}

	return nil
}

func (db *Database) LoadCache() error {
	db.mu.Lock()
	defer db.mu.Unlock()

	// Load Product IDs
	pRows, err := db.conn.Query("SELECT id, name FROM productids")
	if err != nil {
		return fmt.Errorf("failed to query productids: %v", err)
	}
	defer pRows.Close()

	for pRows.Next() {
		var id, name string
		if err := pRows.Scan(&id, &name); err == nil {
			db.productCache[id] = name
		}
	}

	// Load Crosslinks
	cRows, err := db.conn.Query("SELECT id_from, id_to FROM crosslinks")
	if err != nil {
		return fmt.Errorf("failed to query crosslinks: %v", err)
	}
	defer cRows.Close()

	for cRows.Next() {
		var idFrom, idTo string
		if err := cRows.Scan(&idFrom, &idTo); err == nil {
			db.crosslinkCache[idFrom] = idTo
		}
	}

	fmt.Printf("Loaded %d game names and %d crosslinks into RAM cache\n", len(db.productCache), len(db.crosslinkCache))
	return nil
}

// GetCrosslink returns the crosslinked ID if it exists in RAM
func (db *Database) GetCrosslink(productID string) (string, bool) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	to, exists := db.crosslinkCache[productID]
	return to, exists
}

// GetGameName returns the game name from RAM cache
func (db *Database) GetGameName(productID string) (string, bool) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	name, exists := db.productCache[productID]
	return name, exists
}

// EnsureProduct checks if a product exists in cache, if not, inserts it into SQLite and Cache
func (db *Database) EnsureProduct(productID string) {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, exists := db.productCache[productID]; exists {
		return
	}

	// Add to RAM Cache immediately
	db.productCache[productID] = productID

	// Fire and forget SQLite insert (non-blocking for the main game loop)
	go func(id string) {
		// Panic recovery for background insert
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("[CRITICAL] Recovered from panic in EnsureProduct bg goroutine: %v\n", r)
			}
		}()

		_, err := db.conn.Exec("INSERT OR IGNORE INTO productids (id, name) VALUES (?, ?)", id, id)
		if err != nil {
			fmt.Printf("Error inserting unknown product ID %s: %v\n", id, err)
		} else {
			fmt.Printf("Added Unknown Product ID %s to Database.\n", id)
		}
	}(productID)
}

// LogPlayerJoin logs a player joining to PlayerHistory and ChatMessage in background
func (db *Database) LogPlayerJoin(mac, ip, name, game string) {
	fmt.Printf("DB: Attempting to log join for %s (%s)\n", name, mac)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("[CRITICAL] Recovered from panic in LogPlayerJoin: %v\n", r)
			}
		}()
		
		_, err := db.conn.Exec("INSERT INTO PlayerHistory (mac, ip, name, game, joinedAt) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))", mac, ip, name, game)
		if err != nil {
			fmt.Printf("DB Error logging PlayerHistory join: %v\n", err)
		} else {
			fmt.Printf("DB: Successfully logged join for %s\n", name)
		}

		gameName, exists := db.GetGameName(game)
		if !exists || gameName == "" {
			gameName = game
		}
		
		chatMsg := fmt.Sprintf("SYSTEM: 🎮 %s vừa tham gia game %s!", name, gameName)
		_, err = db.conn.Exec("INSERT INTO ChatMessage (mac, name, game, \"group\", message, createdAt) VALUES ('SYSTEM', 'SYSTEM', 'GLOBAL', 'GLOBAL', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))", chatMsg)
		if err != nil {
			fmt.Printf("DB Error logging ChatMessage join: %v\n", err)
		}
	}()
}

// LogPlayerLeave logs a player leaving to PlayerHistory and ChatMessage in background
func (db *Database) LogPlayerLeave(mac, name, game string) {
	fmt.Printf("DB: Attempting to log leave for %s (%s)\n", name, mac)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("[CRITICAL] Recovered from panic in LogPlayerLeave: %v\n", r)
			}
		}()

		_, err := db.conn.Exec("UPDATE PlayerHistory SET leftAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE mac = ? AND leftAt IS NULL", mac)
		if err != nil {
			fmt.Printf("DB Error logging PlayerHistory leave: %v\n", err)
		} else {
			fmt.Printf("DB: Successfully logged leave for %s\n", name)
		}

		gameName, exists := db.GetGameName(game)
		if !exists || gameName == "" {
			gameName = game
		}

		chatMsg := fmt.Sprintf("SYSTEM: 👋 %s đã rời game %s.", name, gameName)
		_, err = db.conn.Exec("INSERT INTO ChatMessage (mac, name, game, \"group\", message, createdAt) VALUES ('SYSTEM', 'SYSTEM', 'GLOBAL', 'GLOBAL', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))", chatMsg)
		if err != nil {
			fmt.Printf("DB Error logging ChatMessage leave: %v\n", err)
		}
	}()
}

// LogChat logs a regular chat message to ChatMessage in background
func (db *Database) LogChat(mac, name, game, groupName, message string) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("[CRITICAL] Recovered from panic in LogChat: %v\n", r)
			}
		}()

		_, err := db.conn.Exec("INSERT INTO ChatMessage (mac, name, game, \"group\", message, createdAt) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))", mac, name, game, groupName, message)
		if err != nil {
			fmt.Printf("Error logging ChatMessage: %v\n", err)
		}
	}()
}

// MonthlyCleanup removes chat messages older than 30 days
func (db *Database) MonthlyCleanup() {
	now := time.Now()
	currentDay := now.YearDay()

	db.mu.Lock()
	if db.lastCleanupDay == currentDay {
		db.mu.Unlock()
		return
	}
	db.lastCleanupDay = currentDay
	db.mu.Unlock()

	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("[CRITICAL] Recovered from panic in MonthlyCleanup: %v\n", r)
			}
		}()

		// Delete chats older than 30 days
		res, err := db.conn.Exec("DELETE FROM ChatMessage WHERE createdAt < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')")
		if err != nil {
			fmt.Printf("Error during monthly chat cleanup: %v\n", err)
		} else {
			rows, _ := res.RowsAffected()
			if rows > 0 {
				fmt.Printf("Maintenance: Deleted %d old chat messages (older than 30 days).\n", rows)
			}
		}
	}()
}

func (db *Database) Close() {
	if db.conn != nil {
		// Try to flush WAL to disk before closing
		db.conn.Exec("PRAGMA wal_checkpoint(FULL);")
		db.conn.Close()
	}
}
