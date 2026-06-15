import socket
import struct
import time
import os
import sys

def run_chatty_test():
    target = ("127.0.0.1", 27312)
    nickname = "ChattyTester"
    mac = b'\x11\x22\x33\x44\x55\x66'
    product_code = "ULUS10128" # 50 Cent
    
    print(f"Connecting to {target}...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(target)
    
    name_bytes = nickname.encode('utf-8').ljust(128, b'\x00')
    game_bytes = product_code.encode('ascii').ljust(9, b'\x00')
    login_pkt = struct.pack("<B6s128s9s", 1, mac, name_bytes, game_bytes)
    
    s.sendall(login_pkt)
    print("Login sent.")
    
    count = 0
    while True:
        try:
            s.sendall(b'\x00') # Ping
            count += 1
            print(f"Ping #{count} sent", flush=True)
            
            s.setblocking(False)
            try:
                data = s.recv(1024)
                if data:
                    print(f"Got {len(data)} bytes from server", flush=True)
                elif len(data) == 0:
                    print("EOF from server", flush=True)
                    break
            except BlockingIOError:
                pass
            
            time.sleep(5)
        except Exception as e:
            print(f"Error: {e}", flush=True)
            break
    s.close()

if __name__ == '__main__':
    run_chatty_test()
