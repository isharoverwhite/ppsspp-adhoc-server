import socket
import struct
import time
import sys

def run_long_connection():
    target = ("127.0.0.1", 27312)
    print(f"Connecting to {target}...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(target)
    
    mac = b'\x11\x22\x33\x44\x55\x66'
    name = b'TrendTester\x00' + b'\x00' * 116
    game = b'ULUS10511\x00' # Ace Combat
    
    print("Logging in...")
    login_pkt = struct.pack("<B6s128s9s", 1, mac, name, game)
    s.send(login_pkt)
    
    # Stay connected and send pings every 5s to avoid timeout
    print("Staying connected. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(5)
            s.send(b'\x00') # Opcode Ping
            print(".", end="", flush=True)
    except KeyboardInterrupt:
        print("\nDisconnecting...")
        s.close()

if __name__ == '__main__':
    run_long_connection()
