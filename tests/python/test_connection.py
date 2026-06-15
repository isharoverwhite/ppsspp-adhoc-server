import unittest
import os
import sys
import time

# Add parent to path for protocol import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from protocol import AdhocClient

HOST = os.environ.get("ADHOC_HOST", "127.0.0.1")
PORT = int(os.environ.get("ADHOC_PORT", "27312"))

class TestBasicConnectivity(unittest.TestCase):
    def test_connect_login_ping_disconnect(self):
        """Minimal connection test: Connect -> Login -> Ping -> Disconnect."""
        client = AdhocClient(HOST, PORT)
        try:
            print(f"Connecting to {HOST}:{PORT}...")
            client.connect()
            self.assertIsNotNone(client.sock, "Socket should be created")
            
            print("Logging in...")
            client.login("ULUS10511")
            time.sleep(0.5)
            self.assertTrue(client.is_connected(), "Should remain connected after login")
            
            print("Sending ping...")
            client.send_ping()
            time.sleep(0.2)
            self.assertTrue(client.is_connected(), "Should remain connected after ping")
            
            print("Disconnecting...")
        finally:
            client.disconnect()
            print("Disconnected.")

if __name__ == "__main__":
    unittest.main(verbosity=2)
