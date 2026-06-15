import sys
import os
import time

# Add tests/python to path to import protocol
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../tests/python')))
from protocol import AdhocClient

def run_realtime_test(duration_seconds=600):
    client = AdhocClient("127.0.0.1", 27312)
    client.nickname = "TenMinTester"
    client.mac = b'\xAA\xBB\xCC\xDD\xEE\xFF'
    
    print(f"Connecting as {client.nickname} for {duration_seconds/60} minutes...")
    try:
        client.connect()
        client.login("ULUS10128") # 50 Cent: Bulletproof
        print(f"Logged in. Tracking for {duration_seconds} seconds.")
        
        start_time = time.time()
        while time.time() - start_time < duration_seconds:
            time.sleep(5)
            if not client.is_connected():
                print("\nServer disconnected.")
                break
            client.send_ping()
            
        print("\nTest completed. Disconnecting.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.disconnect()

if __name__ == '__main__':
    run_realtime_test()
