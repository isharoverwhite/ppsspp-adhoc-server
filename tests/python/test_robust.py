import socket
import struct
import time
import sys

def run_robust_test():
    target = ("127.0.0.1", 27312)
    nickname = "RobustTester"
    mac = b'\x11\x22\x33\x44\x55\x66'
    product_code = "ULUS10128" # 50 Cent
    
    print(f"Connecting to {target}...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(target)
    
    # Login packet: Opcode (1) + MAC (6) + Name (128) + Product (9)
    # SIZE_LOGIN_C2S = 1 + 6 + 128 + 9 = 144
    name_bytes = nickname.encode('utf-8').ljust(128, b'\x00')
    game_bytes = product_code.encode('ascii').ljust(9, b'\x00')
    
    login_pkt = struct.pack("<B6s128s9s", 1, mac, name_bytes, game_bytes)
    s.sendall(login_pkt)
    print("Login sent. Waiting for 10 minutes...")
    
    start_time = time.time()
    try:
        while time.time() - start_time < 600:
            # Send PING (1 byte, opcode 0)
            s.sendall(b'\x00')
            # Try to read any incoming data (like chat messages) to keep buffer clear
            s.setblocking(False)
            try:
                data = s.recv(1024)
                if data:
                    print(f"Received {len(data)} bytes from server")
                elif len(data) == 0:
                    print("Server closed connection (EOF)")
                    break
            except BlockingIOError:
                pass # No data, that's fine
            
            time.sleep(5)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("Closing connection.")
        s.close()

if __name__ == '__main__':
    run_robust_test()
