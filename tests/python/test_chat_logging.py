import sqlite3
import socket
import time

def test_chat():
    print("Sending UDP chat packet to admin port...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    # Type 3 (Group Broadcast) + 9 bytes Game + 8 bytes Group + message
    payload = b'\x03' + b'ULUS10511'.ljust(9, b'\0') + b'ROOM1'.ljust(8, b'\0') + b'Hello from Admin!'
    sock.sendto(payload, ('127.0.0.1', 27313))
    sock.close()
    
    print("Checking SQLite for ChatMessage...")
    time.sleep(1)
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ChatMessage ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    print("Latest chat:", row)
    conn.close()

if __name__ == '__main__':
    test_chat()
