import socket
import struct
import unittest
import sqlite3
import time
import os
import sys

# Add parent to path for protocol import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from protocol import AdhocClient

class TestLoggingFeatures(unittest.TestCase):
    def setUp(self):
        # Use absolute path relative to this script to find the shared database.db in data/ folder
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.db_path = os.path.join(base_dir, "data", "database.db")
        
        # Ensure tables exist and use WAL mode
        print(f"DEBUG: Using database at {self.db_path} (size: {os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 'N/A'})")
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE IF NOT EXISTS PlayerHistory (id INTEGER PRIMARY KEY AUTOINCREMENT, mac TEXT, ip TEXT, name TEXT, game TEXT, joinedAt TEXT, leftAt TEXT)")
        conn.execute("CREATE TABLE IF NOT EXISTS ChatMessage (id INTEGER PRIMARY KEY AUTOINCREMENT, mac TEXT, name TEXT, game TEXT, \"group\" TEXT, message TEXT, createdAt TEXT)")
        
        # Unique name for this test run
        self.test_user = f"LTest_{int(time.time())}"
        self.test_mac = b'\xAA\xBB\xCC\xDD\xEE\xFF'
        self.test_game = "ULUS12345"
        
        # Clear specific test data just in case of collision
        conn.execute("DELETE FROM PlayerHistory WHERE name = ?", (self.test_user,))
        conn.execute("DELETE FROM ChatMessage WHERE name = ? OR message LIKE ?", (self.test_user, f'%{self.test_user}%'))
        conn.commit()
        conn.close()

    def test_login_chat_disconnect_logging(self):
        client = AdhocClient("127.0.0.1", 27312)
        client.nickname = self.test_user
        client.mac = self.test_mac
        
        # 1. Login
        print(f"Logging in as {self.test_user}...")
        client.connect()
        client.login(self.test_game)
        
        # Wait and poll for PlayerHistory join
        row = None
        print("Polling for join record...")
        for i in range(20):
            time.sleep(0.5)
            conn = sqlite3.connect(self.db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            cur = conn.cursor()
            
            cur.execute("SELECT count(*) FROM PlayerHistory")
            total = cur.fetchone()[0]
            
            cur.execute("SELECT joinedAt, leftAt FROM PlayerHistory WHERE name = ? ORDER BY id DESC LIMIT 1", (self.test_user,))
            row = cur.fetchone()
            conn.close()
            if row: 
                print(f"Found record: {row}")
                break
            else:
                print(f"Not found yet (Total records in PH: {total})")
            
        self.assertIsNotNone(row, f"PlayerHistory should have a record for {self.test_user}")
        
        # 2. Join group to chat
        print("Joining group...")
        client.connect_group("LogGrp") # Correct method name from AdhocClient
        time.sleep(0.5)
        
        # 3. Chat
        print("Sending chat...")
        client.chat("Hello logging!") # Correct method name
        
        # Poll for User ChatMessage
        user_msg = None
        print("Polling for user chat message...")
        for i in range(20):
            time.sleep(0.5)
            conn = sqlite3.connect(self.db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            cur = conn.cursor()
            cur.execute("SELECT message FROM ChatMessage WHERE name = ? ORDER BY id DESC LIMIT 1", (self.test_user,))
            user_msg = cur.fetchone()
            conn.close()
            if user_msg: break
            
        self.assertIsNotNone(user_msg, "Should log the user's chat message")
        self.assertEqual(user_msg[0], "Hello logging!", "Chat message content should match")
        
        # 4. Disconnect
        print("Disconnecting...")
        client.disconnect()
        
        # Poll for PlayerHistory leftAt
        row2 = None
        print("Polling for leave record...")
        for i in range(20):
            time.sleep(0.5)
            conn = sqlite3.connect(self.db_path)
            conn.execute("PRAGMA journal_mode=WAL")
            cur = conn.cursor()
            cur.execute("SELECT leftAt FROM PlayerHistory WHERE name = ? ORDER BY id DESC LIMIT 1", (self.test_user,))
            row2 = cur.fetchone()
            conn.close()
            if row2 and row2[0]: break
            
        self.assertIsNotNone(row2[0], "leftAt should be set after disconnect")

if __name__ == '__main__':
    unittest.main()
