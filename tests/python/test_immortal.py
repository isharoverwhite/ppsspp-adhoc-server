import socket
import struct
import time
import os

def run_immortal_test():
    target = ("127.0.0.1", 27312)
    nickname = "ImmortalTester"
    mac = b'\x11\x22\x33\x44\x55\x66'
    product_code = "ULUS10128" # 50 Cent
    
    print(f"Connecting to {target}...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(target)
    
    name_bytes = nickname.encode('utf-8').ljust(128, b'\x00')
    game_bytes = product_code.encode('ascii').ljust(9, b'\x00')
    login_pkt = struct.pack("<B6s128s9s", 1, mac, name_bytes, game_bytes)
    
    s.sendall(login_pkt)
    print("Logged in. Entering ping loop.")
    
    # Send a ping immediately
    s.sendall(b'\x00')
    
    while True:
        try:
            time.sleep(2) # Ping every 2 seconds to be safe
            s.sendall(b'\x00')
            # print(".", end="", flush=True)
            
            # Non-blocking read to keep buffer clear
            s.setblocking(False)
            while True:
                try:
                    data = s.recv(1024)
                    if not data: 
                        print("\nEOF from server.")
                        return
                    # print(f"Got {len(data)} bytes")
                except BlockingIOError:
                    break
            s.setblocking(True)
            
        except Exception as e:
            print(f"\nError in loop: {e}")
            break

if __name__ == '__main__':
    run_immortal_test()
