# pnt_test_client.py
# Test client for PNT Server
# Tests all PNT protocol commands

import socket
import time
import threading

# PNT Protocol Constants (same as server)
RMID = 0xB8  # 184
TMID = 0xAC  # 172
PNT_ID = 0x01

PID_PRESET_SAVE = 24    # 0x18
PID_PRESET_RECALL = 25  # 0x19
PID_TOUR = 46           # 0x2E
PID_SET_EACH_TOUR_DATA = 222  # 0xDE

def calculate_checksum(data):
    """Calculate two's complement checksum"""
    total = sum(data) & 0xFF
    return ((~total) + 1) & 0xFF

def build_pnt_packet(pid, data_bytes=None):
    """Build PNT packet"""
    data = list(data_bytes or [])
    base = [RMID, TMID, PNT_ID, pid, len(data)] + data
    chk = calculate_checksum(base)
    return bytes(base + [chk])

def parse_response(data):
    """Parse PNT response packet"""
    if len(data) < 6:
        return None, "Invalid packet length"
    
    rmid = data[0]
    tmid = data[1]
    pnt_id = data[2]
    pid = data[3]
    data_len = data[4]
    payload = data[5:5+data_len] if data_len > 0 else b''
    checksum = data[5+data_len] if len(data) > 5+data_len else 0
    
    return {
        'rmid': rmid,
        'tmid': tmid,
        'pnt_id': pnt_id,
        'pid': pid,
        'data_len': data_len,
        'payload': payload,
        'checksum': checksum
    }, None

class PNTTestClient:
    def __init__(self, host='localhost', port=32000):
        self.host = host
        self.port = port
        self.sock = None
        
    def connect(self):
        """Connect to PNT server"""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(5.0)
            self.sock.connect((self.host, self.port))
            print(f"✅ Connected to {self.host}:{self.port}")
            return True
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
            
    def disconnect(self):
        """Disconnect from server"""
        if self.sock:
            self.sock.close()
            self.sock = None
            print("🔌 Disconnected")
            
    def send_command(self, pid, data_bytes=None):
        """Send PNT command and receive response"""
        if not self.sock:
            print("❌ Not connected")
            return None
            
        try:
            # Send command
            packet = build_pnt_packet(pid, data_bytes)
            hex_packet = ' '.join(f'{b:02X}' for b in packet)
            print(f"📤 Sending: {hex_packet}")
            
            self.sock.sendall(packet)
            
            # Receive response
            response = self.sock.recv(1024)
            hex_response = ' '.join(f'{b:02X}' for b in response)
            print(f"📥 Received: {hex_response}")
            
            # Parse response
            parsed, error = parse_response(response)
            if error:
                print(f"❌ Parse error: {error}")
                return None
                
            return parsed
            
        except Exception as e:
            print(f"❌ Command failed: {e}")
            return None
            
    def test_preset_save(self, preset_num):
        """Test preset save command"""
        print(f"\n🧪 Testing Preset Save {preset_num}")
        response = self.send_command(PID_PRESET_SAVE, [preset_num])
        if response and response['payload'] and response['payload'][0] == 0x00:
            print(f"✅ Preset {preset_num} saved successfully")
        else:
            print(f"❌ Preset {preset_num} save failed")
            
    def test_preset_recall(self, preset_num):
        """Test preset recall command"""
        print(f"\n🧪 Testing Preset Recall {preset_num}")
        response = self.send_command(PID_PRESET_RECALL, [preset_num])
        if response and response['payload'] and response['payload'][0] == 0x00:
            print(f"✅ Preset {preset_num} recalled successfully")
        else:
            print(f"❌ Preset {preset_num} recall failed")
            
    def test_tour_start(self):
        """Test tour start command"""
        print(f"\n🧪 Testing Tour Start")
        response = self.send_command(PID_TOUR, [1])
        if response and response['payload'] and response['payload'][0] == 0x00:
            print(f"✅ Tour started successfully")
        else:
            print(f"❌ Tour start failed")
            
    def test_tour_stop(self):
        """Test tour stop command"""
        print(f"\n🧪 Testing Tour Stop")
        response = self.send_command(PID_TOUR, [0])
        if response and response['payload'] and response['payload'][0] == 0x00:
            print(f"✅ Tour stopped successfully")
        else:
            print(f"❌ Tour stop failed")
            
    def test_tour_data_set(self, preset_num, speed, delay):
        """Test tour data set command"""
        print(f"\n🧪 Testing Tour Data Set: Preset {preset_num}, Speed {speed}, Delay {delay}")
        speed_lsb = speed & 0xFF
        speed_msb = (speed >> 8) & 0xFF
        response = self.send_command(PID_SET_EACH_TOUR_DATA, [preset_num, speed_lsb, speed_msb, delay])
        if response and response['payload'] and response['payload'][0] == 0x00:
            print(f"✅ Tour data set successfully")
        else:
            print(f"❌ Tour data set failed")
            
    def run_all_tests(self):
        """Run all PNT protocol tests"""
        print("🧪 PNT Protocol Test Suite")
        print("=" * 50)
        
        if not self.connect():
            return
            
        try:
            # Test preset operations
            self.test_preset_save(1)
            self.test_preset_save(2)
            self.test_preset_save(3)
            
            self.test_preset_recall(1)
            self.test_preset_recall(2)
            self.test_preset_recall(3)
            
            # Test tour data setting
            self.test_tour_data_set(1, 600, 60)  # Preset 1, 600 RPM, 60s delay
            self.test_tour_data_set(2, 800, 45)  # Preset 2, 800 RPM, 45s delay
            self.test_tour_data_set(3, 400, 90)  # Preset 3, 400 RPM, 90s delay
            
            # Test tour control
            self.test_tour_start()
            time.sleep(2)
            self.test_tour_stop()
            
            print("\n✅ All tests completed!")
            
        finally:
            self.disconnect()

def main():
    """Main function"""
    print("🧪 PNT Test Client")
    print("=" * 30)
    
    client = PNTTestClient('localhost', 32000)
    client.run_all_tests()

if __name__ == "__main__":
    main()

