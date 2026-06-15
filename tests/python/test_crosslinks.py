import socket
import struct
import unittest
import sqlite3
import time
import os

class TestCrosslinkFeature(unittest.TestCase):
    def setUp(self):
        # Use absolute path relative to this script to find the shared database.db in data/ folder
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.db_path = os.path.join(base_dir, "data", "database.db")
        print(f"DEBUG: Using database at {self.db_path}")
        
        # Ensure crosslinks table exists and add a test link
        conn = sqlite3.connect(self.db_path)
        conn.execute("CREATE TABLE IF NOT EXISTS crosslinks (id_from TEXT PRIMARY KEY, id_to TEXT)")
        conn.execute("INSERT OR REPLACE INTO crosslinks (id_from, id_to) VALUES ('ULUS99999', 'ULJS99999')")
        conn.commit()
        conn.close()

    def test_crosslink_group_visibility(self):
        # Client A logs in with game ULES01408 (which is crosslinked to ULUS10511)
        client_a = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client_a.connect(("127.0.0.1", 27312))
        
        mac_a = b'\x01\x02\x03\x04\x05\x06'
        name_a = b'UserA\x00' + b'\x00' * 122
        game_a = b'ULES01408\x00'
        client_a.send(struct.pack("<B6s128s9s", 1, mac_a, name_a, game_a))
        time.sleep(0.1)
        
        # Client A joins room "Cross"
        client_a.send(struct.pack("<B8s", 2, b'Cross\x00\x00\x00'))
        time.sleep(0.1)
        
        # Client B logs in with game ULUS10511
        client_b = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client_b.connect(("127.0.0.1", 27312))
        
        mac_b = b'\x07\x08\x09\x0A\x0B\x0C'
        name_b = b'UserB\x00' + b'\x00' * 122
        game_b = b'ULUS10511\x00'
        client_b.send(struct.pack("<B6s128s9s", 1, mac_b, name_b, game_b))
        time.sleep(0.1)
        
        # Client B scans for groups. They should see "Cross" because client_a was mapped to ULUS10511.
        client_b.send(b'\x04')
        
        # Poll for SCAN results, skipping any broadcast CHAT messages
        data = b""
        for _ in range(10):
            try:
                client_b.setblocking(False)
                new_data = client_b.recv(1024)
                if new_data:
                    if new_data[0] == 0x07: # CHAT packet (broadcast join msg)
                        continue
                    data = new_data
                    break
            except BlockingIOError:
                pass
            time.sleep(0.1)

        # Scan result: opcode(1) + group(8) + mac(6) = 15 bytes
        self.assertIsNotNone(data, "Should receive data from server")
        self.assertGreaterEqual(len(data), 15, "Client B should see the room from Client A due to crosslink")
        self.assertEqual(data[0], 0x04, f"Opcode should be SCAN, got {data[0]}")
        group_name = data[1:9].split(b'\x00')[0].decode('ascii')
        self.assertEqual(group_name, "Cross", "Group name should match")
        
        client_a.close()
        client_b.close()

if __name__ == '__main__':
    unittest.main()
