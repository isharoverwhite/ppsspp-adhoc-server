"""
PPSSPP Ad-Hoc Server Protocol Implementation (Python)

Provides constants, struct pack/unpack, and a ProtocolClient class
that exactly mirrors the C packet structures in src/packets.h.

All multi-byte fields use native byte order (no network conversion),
matching the server's behavior.
"""

import struct
import socket
import time
import random
import string

# ── Opcodes ────────────────────────────────────────────────────────
OPCODE_PING           = 0x00
OPCODE_LOGIN          = 0x01
OPCODE_CONNECT        = 0x02
OPCODE_DISCONNECT     = 0x03
OPCODE_SCAN           = 0x04
OPCODE_SCAN_COMPLETE  = 0x05
OPCODE_CONNECT_BSSID  = 0x06
OPCODE_CHAT           = 0x07

OPCODE_NAMES = {
    0x00: "PING",
    0x01: "LOGIN",
    0x02: "CONNECT",
    0x03: "DISCONNECT",
    0x04: "SCAN",
    0x05: "SCAN_COMPLETE",
    0x06: "CONNECT_BSSID",
    0x07: "CHAT",
}

# ── Packet Size Constants ──────────────────────────────────────────
PRODUCT_CODE_LENGTH    = 9
ETHER_ADDR_LEN         = 6
ADHOCCTL_GROUPNAME_LEN = 8
ADHOCCTL_NICKNAME_LEN  = 128
CHAT_MESSAGE_LEN       = 64

# Packet sizes computed from __attribute__((packed)) structs
SIZE_LOGIN_C2S      = 1 + ETHER_ADDR_LEN + ADHOCCTL_NICKNAME_LEN + PRODUCT_CODE_LENGTH  # 144
SIZE_CONNECT_C2S    = 1 + ADHOCCTL_GROUPNAME_LEN                                        # 9
SIZE_CHAT_C2S       = 1 + CHAT_MESSAGE_LEN                                              # 65
SIZE_CONNECT_S2C    = 1 + ADHOCCTL_NICKNAME_LEN + ETHER_ADDR_LEN + 4                    # 139
SIZE_DISCONNECT_S2C = 1 + 4                                                             # 5
SIZE_SCAN_S2C       = 1 + ADHOCCTL_GROUPNAME_LEN + ETHER_ADDR_LEN                       # 15
SIZE_CONNECT_BSSID  = 1 + ETHER_ADDR_LEN                                                # 7
SIZE_CHAT_S2C       = 1 + CHAT_MESSAGE_LEN + ADHOCCTL_NICKNAME_LEN                      # 193


# ── Packet Builders (C → S) ───────────────────────────────────────

def build_ping():
    """Build OPCODE_PING packet (1 byte)."""
    return struct.pack("B", OPCODE_PING)


def build_login(mac, nickname, product_code):
    """
    Build OPCODE_LOGIN packet (144 bytes).
    
    Args:
        mac:         6 bytes (e.g., b'\x01\x02\x03\x04\x05\x06')
        nickname:    str, max 128 chars (null-padded)
        product_code: str, exactly 9 chars (e.g., 'ULUS10511')
    
    Returns:
        bytes: 144-byte login packet
    """
    mac_bytes = mac[:ETHER_ADDR_LEN].ljust(ETHER_ADDR_LEN, b'\x00')
    name_bytes = nickname.encode('utf-8', errors='replace')[:ADHOCCTL_NICKNAME_LEN-1]
    name_bytes = name_bytes.ljust(ADHOCCTL_NICKNAME_LEN, b'\x00')
    game_bytes = product_code.encode('ascii', errors='replace')[:PRODUCT_CODE_LENGTH]
    game_bytes = game_bytes.ljust(PRODUCT_CODE_LENGTH, b'\x00')
    
    fmt = f"B{ETHER_ADDR_LEN}s{ADHOCCTL_NICKNAME_LEN}s{PRODUCT_CODE_LENGTH}s"
    return struct.pack(fmt, OPCODE_LOGIN, mac_bytes, name_bytes, game_bytes)


def build_connect(group_name):
    """
    Build OPCODE_CONNECT packet (9 bytes).
    
    Args:
        group_name: str, max 8 chars (e.g., 'ABC123')
    
    Returns:
        bytes: 9-byte connect packet
    """
    group_bytes = group_name.encode('ascii', errors='replace')[:ADHOCCTL_GROUPNAME_LEN]
    group_bytes = group_bytes.ljust(ADHOCCTL_GROUPNAME_LEN, b'\x00')
    fmt = f"B{ADHOCCTL_GROUPNAME_LEN}s"
    return struct.pack(fmt, OPCODE_CONNECT, group_bytes)


def build_disconnect():
    """Build OPCODE_DISCONNECT packet (1 byte)."""
    return struct.pack("B", OPCODE_DISCONNECT)


def build_scan():
    """Build OPCODE_SCAN packet (1 byte)."""
    return struct.pack("B", OPCODE_SCAN)


def build_chat(message):
    """
    Build OPCODE_CHAT packet (65 bytes).
    
    Args:
        message: str, max 64 chars
    
    Returns:
        bytes: 65-byte chat packet
    """
    msg_bytes = message.encode('utf-8', errors='replace')[:CHAT_MESSAGE_LEN-1]
    msg_bytes = msg_bytes.ljust(CHAT_MESSAGE_LEN, b'\x00')
    fmt = f"B{CHAT_MESSAGE_LEN}s"
    return struct.pack(fmt, OPCODE_CHAT, msg_bytes)


# ── Packet Parsers (S → C) ────────────────────────────────────────

def parse_connect_s2c(data):
    """Parse OPCODE_CONNECT server→client packet."""
    fmt = f"B{ADHOCCTL_NICKNAME_LEN}s{ETHER_ADDR_LEN}sI"
    opcode, name, mac, ip = struct.unpack(fmt, data)
    return {
        'opcode': opcode,
        'nickname': name.rstrip(b'\x00').decode('utf-8', errors='replace'),
        'mac': ':'.join(f'{b:02X}' for b in mac),
        'ip': '.'.join(str((ip >> (8*i)) & 0xFF) for i in range(4)),
    }


def parse_disconnect_s2c(data):
    """Parse OPCODE_DISCONNECT server→client packet."""
    opcode, ip = struct.unpack("BI", data)
    return {
        'opcode': opcode,
        'ip': '.'.join(str((ip >> (8*i)) & 0xFF) for i in range(4)),
    }


def parse_scan_s2c(data):
    """Parse OPCODE_SCAN server→client packet."""
    fmt = f"B{ADHOCCTL_GROUPNAME_LEN}s{ETHER_ADDR_LEN}s"
    opcode, group, mac = struct.unpack(fmt, data)
    return {
        'opcode': opcode,
        'group': group.rstrip(b'\x00').decode('ascii', errors='replace'),
        'host_mac': ':'.join(f'{b:02X}' for b in mac),
    }


def parse_connect_bssid(data):
    """Parse OPCODE_CONNECT_BSSID packet."""
    fmt = f"B{ETHER_ADDR_LEN}s"
    opcode, mac = struct.unpack(fmt, data)
    return {
        'opcode': opcode,
        'bssid': ':'.join(f'{b:02X}' for b in mac),
    }


def parse_chat_s2c(data):
    """Parse OPCODE_CHAT server→client packet."""
    fmt = f"B{CHAT_MESSAGE_LEN}s{ADHOCCTL_NICKNAME_LEN}s"
    opcode, message, name = struct.unpack(fmt, data)
    return {
        'opcode': opcode,
        'message': message.rstrip(b'\x00').decode('utf-8', errors='replace'),
        'sender': name.rstrip(b'\x00').decode('utf-8', errors='replace'),
    }


# ── Packet Dispatcher ─────────────────────────────────────────────

PARSERS = {
    OPCODE_CONNECT:       (SIZE_CONNECT_S2C,    parse_connect_s2c),
    OPCODE_DISCONNECT:    (SIZE_DISCONNECT_S2C, parse_disconnect_s2c),
    OPCODE_SCAN:          (SIZE_SCAN_S2C,       parse_scan_s2c),
    OPCODE_SCAN_COMPLETE: (1,                   None),
    OPCODE_CONNECT_BSSID: (SIZE_CONNECT_BSSID,  parse_connect_bssid),
    OPCODE_CHAT:          (SIZE_CHAT_S2C,       parse_chat_s2c),
}


def parse_packet(data):
    """
    Parse a single S→C packet from raw bytes.
    
    Returns:
        dict with 'opcode', 'opcode_name', and
        opcode-specific parsed fields, or None if unknown.
    """
    if len(data) < 1:
        return {'opcode': None, 'opcode_name': 'EMPTY', 'error': 'Empty packet'}
    
    opcode = data[0]
    name = OPCODE_NAMES.get(opcode, f"UNKNOWN(0x{opcode:02X})")
    
    if opcode not in PARSERS:
        return {'opcode': opcode, 'opcode_name': name, 'error': 'Unknown opcode'}
    
    expected_size, parser = PARSERS[opcode]
    if len(data) < expected_size:
        return {'opcode': opcode, 'opcode_name': name,
                'error': f'Truncated: got {len(data)} bytes, expected {expected_size}'}
    
    if parser is None:
        return {'opcode': opcode, 'opcode_name': name}
    
    return parser(data[:expected_size])


# ── Protocol Client ───────────────────────────────────────────────

def random_mac():
    """Generate a random unicast MAC address."""
    mac = bytearray(6)
    mac[0] = random.randint(0x00, 0x7F)  # Unicast, locally administered
    for i in range(1, 6):
        mac[i] = random.randint(0x00, 0xFF)
    return bytes(mac)


def random_nickname(prefix="Player"):
    """Generate a random PSP-style nickname."""
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}{suffix}"


class AdhocClient:
    """
    TCP client for the PPSSPP Ad-Hoc Server.
    
    Usage:
        client = AdhocClient("127.0.0.1", 27312)
        client.connect()
        client.login("ULUS10511")
        responses = client.receive_all()  # get any queued S→C packets
        client.disconnect()
    """
    
    def __init__(self, host="127.0.0.1", port=27312):
        self.host = host
        self.port = port
        self.sock = None
        self.mac = random_mac()
        self.nickname = random_nickname()
        self.product_code = None
        self.buffer = b""
        self._recv_timeout = 2.0
        self._connect_timeout = 5.0
    
    def connect(self):
        """Establish TCP connection to the server."""
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(self._connect_timeout)
        try:
            self.sock.connect((self.host, self.port))
        except (ConnectionRefusedError, socket.timeout, OSError) as e:
            self.sock.close()
            self.sock = None
            raise ConnectionError(f"Cannot connect to {self.host}:{self.port}: {e}")
        self.sock.setblocking(False)
        return True
    
    def disconnect(self):
        """Close the TCP connection."""
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None
    
    def send(self, data):
        """Send raw bytes to the server."""
        if not self.sock:
            raise RuntimeError("Not connected")
        self.sock.setblocking(True)
        try:
            self.sock.sendall(data)
        finally:
            self.sock.setblocking(False)
    
    def send_ping(self):
        """Send a keep-alive ping."""
        self.send(build_ping())
    
    def login(self, product_code):
        """
        Send login packet.
        
        Args:
            product_code: 9-char PSP product code (e.g., 'ULUS10511')
        """
        self.product_code = product_code
        self.send(build_login(self.mac, self.nickname, product_code))
    
    def connect_group(self, group_name):
        """Send group connect packet."""
        self.send(build_connect(group_name))
    
    def disconnect_group(self):
        """Send group disconnect packet."""
        self.send(build_disconnect())
    
    def scan(self):
        """Send scan request."""
        self.send(build_scan())
    
    def chat(self, message):
        """Send chat message."""
        self.send(build_chat(message))
    
    def receive(self, timeout=0.5):
        """
        Receive any available data. Non-blocking.
        
        Args:
            timeout: Max seconds to wait for data
        
        Returns:
            bytes: Raw data received, or b"" if none
        """
        if not self.sock:
            raise RuntimeError("Not connected")
        try:
            self.sock.settimeout(timeout)
            data = self.sock.recv(4096)
            self.sock.setblocking(False)
            return data
        except socket.timeout:
            self.sock.setblocking(False)
            return b""
        except BlockingIOError:
            return b""
    
    def receive_packets(self, timeout=0.5):
        """
        Receive and parse all available S→C packets.
        
        Returns:
            list of dict: Parsed packets from the server
        """
        raw = self.receive(timeout)
        self.buffer += raw
        packets = []
        
        while len(self.buffer) > 0:
            opcode = self.buffer[0]
            
            # Known opcode with known size
            if opcode in PARSERS:
                size, _ = PARSERS[opcode]
                if len(self.buffer) >= size:
                    pkt = parse_packet(self.buffer[:size])
                    if pkt:
                        packets.append(pkt)
                    self.buffer = self.buffer[size:]
                    continue
            
            # OPCODE_SCAN_COMPLETE: 1 byte
            if opcode == OPCODE_SCAN_COMPLETE:
                packets.append({'opcode': opcode, 'opcode_name': 'SCAN_COMPLETE'})
                self.buffer = self.buffer[1:]
                continue
            
            # Unknown or incomplete — stop parsing
            break
        
        return packets
    
    def is_connected(self):
        """Check if the TCP connection is still alive.

        Drains all pending data into buffer, then checks for EOF.
        This handles the case where server sends data then closes:
        first recv() gets data, second recv() gets EOF (len=0).
        All data is saved in self.buffer for later receive_packets().
        """
        if not self.sock:
            return False
        try:
            self.sock.settimeout(0)
            # Drain all available data
            while True:
                data = self.sock.recv(4096)
                if len(data) == 0:
                    self.sock.setblocking(False)
                    return False  # EOF reached
                self.buffer += data
        except BlockingIOError:
            self.sock.setblocking(False)
            return True   # No more data but socket still open
        except (ConnectionResetError, BrokenPipeError, OSError):
            self.sock.setblocking(False)
            return False  # Connection broken
    
    def __enter__(self):
        self.connect()
        return self
    
    def __exit__(self, *args):
        self.disconnect()


# ── Helpers ──────────────────────────────────────────────────────

def ip_to_uint(ip_str):
    """Convert 'x.x.x.x' string to uint32 (host byte order)."""
    parts = [int(x) for x in ip_str.split('.')]
    return (parts[0]) | (parts[1] << 8) | (parts[2] << 16) | (parts[3] << 24)
