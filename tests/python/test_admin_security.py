import socket
import struct
import unittest

class TestAdminSecurity(unittest.TestCase):
    def test_admin_name_rejected(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", 27312))
        
        mac = b'\x01\x02\x03\x04\x05\x06'
        name = b'SuPerAdMiN\x00' + b'\x00' * 117
        game = b'ULUS12345\x00'
        packet = struct.pack("<BB6s128s9s", 1, 0, mac, name, game)
        s.send(packet)
        
        # Server should disconnect us
        data = s.recv(1024)
        self.assertEqual(len(data), 0, "Server did not disconnect user with 'admin' in name")
        s.close()

if __name__ == '__main__':
    unittest.main()
