import socket
import struct
import time

def simulate_active():
    target = ("127.0.0.1", 27312)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(target)
    
    mac = b'\x03\x03\x03\x03\x03\x03'
    name = b'ActiveTester\x00' + b'\x00' * 115
    game = b'ULUS10227\x00'
    
    s.send(struct.pack("<B6s128s9s", 1, mac, name, game))
    print("User ActiveTester is now online playing 7 Wonders (ULUS10227)")
    
    try:
        while True:
            time.sleep(10)
            s.send(b'\x00') # Ping
    except:
        s.close()

if __name__ == '__main__':
    simulate_active()
