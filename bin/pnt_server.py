# pnt_server.py
# PNT Protocol Server for PTZ Camera Control
# Listens on port 32000 and handles PNT client requests

import socket
import threading
import time
import logging
import signal
import sys
from datetime import datetime
import json
import os
import configparser

# =========================
# PNT Protocol Constants
# =========================
RMID = 0xB8  # 184 - Request Message ID
TMID = 0xAC  # 172 - Response Message ID
PNT_ID = 0x01  # Device Address (fixed)

# Protocol IDs (PNT 프로토콜 매뉴얼 준수)
PID_PRESET_SAVE = 24    # 0x18 - 프리셋 저장
PID_PRESET_RECALL = 25  # 0x19 - 프리셋 호출
PID_ALARM_RESET = 26    # 0x1A - 알람 리셋 (매뉴얼 표준)
PID_AUTO_SCAN_CMD = 27  # 0x1B - 자동 스캔 명령 (매뉴얼 표준)
PID_PRESET_ACK = 32     # 0x20 - 프리셋 호출 응답 (매뉴얼 표준)
PID_TOUR = 46           # 0x2E - 투어 제어 (1 = start, 0 = stop)
PID_SET_EACH_TOUR_DATA = 222  # 0xDE: [D0=preset(1~8), D1~D2= speed(rpm LSB/MSB), D3=delay(1~255s)]

# 매뉴얼 표준 PID (추가)
PID_PRESET_DATA = 200       # 0xC8 - 프리셋 데이터 (Pan, Tilt, Zoom, Focus)
PID_LIMIT_POSI_DATA = 202   # 0xCA - PAN/TILT 제한 위치 데이터

# 커스텀 PID는 현재 사용하지 않음 (매뉴얼 표준 PID 사용)

# Response codes (PNT 프로토콜 표준)
RESPONSE_SUCCESS = 0x00
RESPONSE_ERROR = 0xFF
RESPONSE_INVALID_COMMAND = 0x01
RESPONSE_INVALID_PARAMETER = 0x02
RESPONSE_DEVICE_BUSY = 0x03
RESPONSE_NOT_IMPLEMENTED = 0x04

class PNTServer:
    def __init__(self, host='0.0.0.0', port=32000):
        self.host = host
        self.port = port
        self.server_socket = None
        self.running = False
        self.clients = []
        
        # PTZ State Storage
        self.presets = {}  # Store preset data
        self.tour_data = {}  # Store tour configuration
        self.tour_running = False
        
        # INI file path for preset storage
        self.ptz_info_file = os.path.join(os.path.dirname(__file__), 'ptz_info.ini')
        
        # Setup logging
        self.setup_logging()
        
        # Setup signal handlers for graceful shutdown
        self.setup_signal_handlers()
        
    def setup_logging(self):
        """Setup logging configuration"""
        log_dir = os.path.join(os.path.dirname(__file__), 'logs')
        os.makedirs(log_dir, exist_ok=True)
        
        log_file = os.path.join(log_dir, 'pnt_server.log')
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file, encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
    def setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown"""
        def signal_handler(signum, frame):
            print(f"\n🛑 Received signal {signum}, shutting down server...")
            self.stop()
            sys.exit(0)
        
        # Register signal handlers
        signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
        signal.signal(signal.SIGTERM, signal_handler)  # Termination signal
        
    def start(self):
        """Start the PNT server"""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(5)
            
            self.running = True
            self.logger.info(f"PNT Server started on {self.host}:{self.port}")
            print(f"🎥 PNT Server started on {self.host}:{self.port}")
            print("Waiting for client connections...")
            
            while self.running:
                try:
                    client_socket, client_address = self.server_socket.accept()
                    self.logger.info(f"Client connected: {client_address}")
                    print(f"📱 Client connected: {client_address}")
                    
                    # Handle client in separate thread
                    client_thread = threading.Thread(
                        target=self.handle_client,
                        args=(client_socket, client_address),
                        daemon=True
                    )
                    client_thread.start()
                    
                except socket.error as e:
                    if self.running:
                        self.logger.error(f"Socket error: {e}")
                    break
                    
        except Exception as e:
            self.logger.error(f"Server error: {e}")
            print(f"❌ Server error: {e}")
        finally:
            self.stop()
            
    def stop(self):
        """Stop the PNT server"""
        self.running = False
        if self.server_socket:
            try:
                self.server_socket.close()
            except:
                pass
        self.logger.info("PNT Server stopped")
        print("🛑 PNT Server stopped")
        
    def handle_client(self, client_socket, client_address):
        """Handle individual client connection"""
        try:
            while self.running:
                # Receive data from client
                data = client_socket.recv(1024)
                if not data:
                    break
                    
                # Parse and process PNT packet
                response = self.process_pnt_packet(data, client_address)
                
                # Send response back to client
                if response:
                    client_socket.send(response)
                    self.logger.info(f"Response sent to {client_address}: {response.hex()}")
                    print(f"📤 Response sent: {response.hex()}")
                    
                    # 응답 전송 후 잠시 대기 (클라이언트가 응답을 받을 시간 제공)
                    import time
                    time.sleep(0.1)
                    
                # 단일 요청 처리 후 연결 종료 (PNT 프로토콜 특성)
                break
                    
        except socket.error as e:
            self.logger.error(f"Client {client_address} error: {e}")
        except Exception as e:
            self.logger.error(f"Unexpected error with client {client_address}: {e}")
        finally:
            client_socket.close()
            self.logger.info(f"Client {client_address} disconnected")
            print(f"📱 Client {client_address} disconnected")
            
    def process_pnt_packet(self, data, client_address):
        """Process incoming PNT packet and generate response"""
        try:
            # Log received packet
            hex_data = ' '.join(f'{b:02X}' for b in data)
            self.logger.info(f"Received from {client_address}: {hex_data}")
            print(f"📥 Received: {hex_data}")
            
            # Parse packet structure
            if len(data) < 6:
                self.logger.warning(f"Invalid packet length: {len(data)}")
                return self.create_error_response()
                
            # Extract packet components (올바른 PNT 프로토콜 구조)
            rmid = data[0]      # 0xB8 - Request Message ID
            tmid = data[1]      # 0xAC - Response Message ID  
            pnt_id = data[2]    # 0x01 - Device Address
            pid = data[3]       # Protocol ID
            data_len = data[4]  # Data length
            payload = data[5:5+data_len] if data_len > 0 else b''
            checksum = data[5+data_len] if len(data) > 5+data_len else 0
            
            # Validate packet structure
            if rmid != RMID:
                self.logger.warning(f"Invalid RMID: {rmid:02X}, expected: {RMID:02X}")
                return self.create_error_response()
                
            if tmid != TMID:
                self.logger.warning(f"Invalid TMID: {tmid:02X}, expected: {TMID:02X}")
                return self.create_error_response()
                
            if pnt_id != PNT_ID:
                self.logger.warning(f"Invalid PNT_ID: {pnt_id:02X}, expected: {PNT_ID:02X}")
                return self.create_error_response()
            
            # 체크섬 검증
            if not self.verify_checksum(data):
                self.logger.warning("Invalid checksum")
                return self.create_error_response()
                
            # Process based on PID
            response_data = self.handle_command(pid, payload, client_address)
            
            # Create response packet
            response = self.create_response_packet(pid, response_data)
            
            # Log response
            hex_response = ' '.join(f'{b:02X}' for b in response)
            self.logger.info(f"Sent to {client_address}: {hex_response}")
            print(f"📤 Sent: {hex_response}")
            
            return response
            
        except Exception as e:
            self.logger.error(f"Error processing packet: {e}")
            return self.create_error_response()
            
    def handle_command(self, pid, payload, client_address):
        """Handle specific PNT commands"""
        try:
            if pid == PID_PRESET_SAVE:
                return self.handle_preset_save(payload, client_address)
            elif pid == PID_PRESET_RECALL:
                return self.handle_preset_recall(payload, client_address)
            elif pid == PID_TOUR:
                return self.handle_tour_control(payload, client_address)
            elif pid == PID_SET_EACH_TOUR_DATA:
                return self.handle_tour_data_set(payload, client_address)
            elif pid == PID_ALARM_RESET:
                return self.handle_alarm_reset(payload, client_address)
            elif pid == PID_AUTO_SCAN_CMD:
                return self.handle_auto_scan_cmd(payload, client_address)
            elif pid == PID_PRESET_ACK:
                return self.handle_preset_ack(payload, client_address)
            elif pid == PID_PRESET_DATA:
                return self.handle_preset_data(payload, client_address)
            elif pid == PID_LIMIT_POSI_DATA:
                return self.handle_limit_posi_data(payload, client_address)
            else:
                self.logger.warning(f"Unknown PID: {pid:02X}")
                return [RESPONSE_INVALID_COMMAND]
                
        except Exception as e:
            self.logger.error(f"Error handling command {pid:02X}: {e}")
            return [RESPONSE_ERROR]
            
    def handle_preset_save(self, payload, client_address):
        """Handle preset save command"""
        if len(payload) < 1:
            self.logger.warning("Preset save: Invalid payload length")
            return [RESPONSE_INVALID_PARAMETER]
            
        preset_num = payload[0]
        if not (1 <= preset_num <= 8):
            self.logger.warning(f"Preset save: Invalid preset number {preset_num}")
            return [RESPONSE_INVALID_PARAMETER]
            
        try:
            # 실제 카메라에서 현재 PTZ 위치 읽기
            current_ptz = self.get_current_ptz_position()
            
            # 프리셋 데이터 저장 (실제 Pan/Tilt/Zoom 값 포함)
            self.presets[preset_num] = {
                'pan': current_ptz['pan'],
                'tilt': current_ptz['tilt'], 
                'zoom': current_ptz['zoom'],
                'timestamp': datetime.now().isoformat(),
                'client': str(client_address)
            }
            
            self.logger.info(f"Preset {preset_num} saved: Pan={current_ptz['pan']}, Tilt={current_ptz['tilt']}, Zoom={current_ptz['zoom']} by {client_address}")
            print(f"💾 Preset {preset_num} saved: Pan={current_ptz['pan']}, Tilt={current_ptz['tilt']}, Zoom={current_ptz['zoom']}")
            
            # Save presets to INI file
            self.save_presets_to_ini()
            
            return [RESPONSE_SUCCESS]
            
        except Exception as e:
            self.logger.error(f"Failed to get current PTZ position: {e}")
            return [RESPONSE_ERROR]
        
    def handle_preset_recall(self, payload, client_address):
        """Handle preset recall command"""
        if len(payload) < 1:
            self.logger.warning("Preset recall: Invalid payload length")
            return [RESPONSE_INVALID_PARAMETER]
            
        preset_num = payload[0]
        if not (1 <= preset_num <= 8):
            self.logger.warning(f"Preset recall: Invalid preset number {preset_num}")
            return [RESPONSE_INVALID_PARAMETER]
            
        try:
            if preset_num in self.presets:
                preset_data = self.presets[preset_num]
                
                # 저장된 PTZ 위치로 카메라 이동
                success = self.move_to_ptz_position(
                    pan=preset_data['pan'],
                    tilt=preset_data['tilt'],
                    zoom=preset_data['zoom']
                )
                
                if success:
                    self.logger.info(f"Preset {preset_num} recalled: Pan={preset_data['pan']}, Tilt={preset_data['tilt']}, Zoom={preset_data['zoom']} by {client_address}")
                    print(f"🎯 Preset {preset_num} recalled: Pan={preset_data['pan']}, Tilt={preset_data['tilt']}, Zoom={preset_data['zoom']}")
                    print(f"📋 INI Preset {preset_num} values (decimal): Pan={preset_data['pan']}, Tilt={preset_data['tilt']}, Zoom={preset_data['zoom']}")
                    return [RESPONSE_SUCCESS]
                else:
                    self.logger.error(f"Failed to move to preset {preset_num} position")
                    return [RESPONSE_ERROR]
            else:
                self.logger.warning(f"Preset {preset_num} not found")
                return [RESPONSE_ERROR]
                
        except Exception as e:
            self.logger.error(f"Error recalling preset {preset_num}: {e}")
            return [RESPONSE_ERROR]
            
    def handle_tour_control(self, payload, client_address):
        """Handle tour start/stop command"""
        if len(payload) < 1:
            self.logger.warning("Tour control: Invalid payload length")
            return [RESPONSE_INVALID_PARAMETER]
            
        action = payload[0]
        
        if action == 1:  # Start tour
            self.tour_running = True
            self.logger.info(f"Tour started by {client_address}")
            print(f"🚀 Tour started")
            return [RESPONSE_SUCCESS]
        elif action == 0:  # Stop tour
            self.tour_running = False
            self.logger.info(f"Tour stopped by {client_address}")
            print(f"⏹️ Tour stopped")
            return [RESPONSE_SUCCESS]
        else:
            self.logger.warning(f"Invalid tour action: {action}")
            return [RESPONSE_INVALID_PARAMETER]
            
    def handle_tour_data_set(self, payload, client_address):
        """Handle tour data setting command"""
        if len(payload) < 4:
            self.logger.warning("Tour data set: Invalid payload length")
            return [RESPONSE_INVALID_PARAMETER]
            
        preset_num = payload[0]
        speed_lsb = payload[1]
        speed_msb = payload[2]
        delay = payload[3]
        
        if not (1 <= preset_num <= 8):
            self.logger.warning(f"Tour data set: Invalid preset number {preset_num}")
            return [RESPONSE_INVALID_PARAMETER]
            
        # Validate delay range (1-255 seconds)
        if not (1 <= delay <= 255):
            self.logger.warning(f"Tour data set: Invalid delay {delay}")
            return [RESPONSE_INVALID_PARAMETER]
            
        # Calculate speed from LSB/MSB
        speed = speed_lsb | (speed_msb << 8)
        
        # Store tour data
        self.tour_data[preset_num] = {
            'speed': speed,
            'delay': delay,
            'timestamp': datetime.now().isoformat(),
            'client': str(client_address)
        }
        
        self.logger.info(f"Tour data set for preset {preset_num}: speed={speed} rpm, delay={delay}s by {client_address}")
        print(f"⚙️ Tour data set: Preset {preset_num}, Speed {speed} rpm, Delay {delay}s")
        
        return [RESPONSE_SUCCESS]
        
    def handle_alarm_reset(self, payload, client_address):
        """Handle alarm reset command (PID 26 - 0x1A)"""
        try:
            self.logger.info(f"Alarm reset requested by {client_address}")
            print(f"🔔 Alarm reset by {client_address}")
            return [RESPONSE_SUCCESS]
        except Exception as e:
            self.logger.error(f"Error handling alarm reset: {e}")
            return [RESPONSE_ERROR]
            
    def handle_auto_scan_cmd(self, payload, client_address):
        """Handle auto scan command (PID 27 - 0x1B)"""
        if len(payload) < 1:
            self.logger.warning("Auto scan: Invalid payload length")
            return [RESPONSE_INVALID_PARAMETER]
            
        cmd = payload[0]
        
        try:
            if cmd == 0:  # Stop auto scan
                self.logger.info(f"Auto scan stopped by {client_address}")
                print(f"⏹️ Auto scan stopped")
                return [RESPONSE_SUCCESS]
            elif cmd == 1:  # Start auto scan
                self.logger.info(f"Auto scan started by {client_address}")
                print(f"🔄 Auto scan started")
                return [RESPONSE_SUCCESS]
            else:
                self.logger.warning(f"Invalid auto scan command: {cmd}")
                return [RESPONSE_INVALID_PARAMETER]
        except Exception as e:
            self.logger.error(f"Error handling auto scan: {e}")
            return [RESPONSE_ERROR]
            
    def handle_preset_ack(self, payload, client_address):
        """Handle preset acknowledgment (PID 32 - 0x20) - 매뉴얼 표준"""
        if len(payload) < 1:
            self.logger.warning("Preset ACK: Invalid payload length")
            return [RESPONSE_INVALID_PARAMETER]
            
        preset_num = payload[0]
        if not (1 <= preset_num <= 8):
            self.logger.warning(f"Preset ACK: Invalid preset number {preset_num}")
            return [RESPONSE_INVALID_PARAMETER]
            
        try:
            # 매뉴얼에 따르면 프리셋 번호만 반환
            self.logger.info(f"Preset {preset_num} acknowledgment requested by {client_address}")
            print(f"✅ Preset {preset_num} ACK requested")
            
            # 매뉴얼 표준: 프리셋 번호만 반환
            return [RESPONSE_SUCCESS, preset_num]
        except Exception as e:
            self.logger.error(f"Error handling preset ACK: {e}")
            return [RESPONSE_ERROR]
            
    def handle_preset_data(self, payload, client_address):
        """Handle preset data command (PID 200 - 0xC8) - 매뉴얼 표준"""
        if len(payload) < 1:
            self.logger.warning("Preset data: Invalid payload length")
            return [RESPONSE_INVALID_PARAMETER]
            
        preset_num = payload[0]
        if not (1 <= preset_num <= 79):  # 매뉴얼: 1~79
            self.logger.warning(f"Preset data: Invalid preset number {preset_num}")
            return [RESPONSE_INVALID_PARAMETER]
            
        try:
            if preset_num in self.presets:
                preset_data = self.presets[preset_num]
                
                # 매뉴얼에 따른 9바이트 데이터 구조
                # D0: 프리셋 번호, D1,2: Pan, D3,4: Tilt, D5,6: Zoom, D7,8: Focus
                pan_bytes = self.int_to_bytes(preset_data['pan'], 2)
                tilt_bytes = self.int_to_bytes(preset_data['tilt'], 2)
                zoom_bytes = self.int_to_bytes(preset_data['zoom'], 2)
                focus_bytes = self.int_to_bytes(preset_data.get('focus', 0), 2)  # Focus 기본값 0
                
                response_data = [RESPONSE_SUCCESS, preset_num] + pan_bytes + tilt_bytes + zoom_bytes + focus_bytes
                
                self.logger.info(f"Preset {preset_num} data requested by {client_address}: Pan={preset_data['pan']}, Tilt={preset_data['tilt']}, Zoom={preset_data['zoom']}")
                print(f"📋 Preset {preset_num} data: Pan={preset_data['pan']}, Tilt={preset_data['tilt']}, Zoom={preset_data['zoom']}")
                
                return response_data
            else:
                self.logger.warning(f"Preset {preset_num} not found")
                return [RESPONSE_ERROR]
                
        except Exception as e:
            self.logger.error(f"Error getting preset data: {e}")
            return [RESPONSE_ERROR]
            
    def handle_limit_posi_data(self, payload, client_address):
        """Handle limit position data command (PID 202 - 0xCA) - 매뉴얼 표준"""
        try:
            # 매뉴얼에 따른 8바이트 데이터 구조
            # D0,1: Pan min limit, D2,3: Pan max limit, D4,5: Tilt min limit, D6,7: Tilt max limit
            # 기본값 설정 (0~36000, 1deg->100)
            pan_min = 0
            pan_max = 36000
            tilt_min = 0
            tilt_max = 36000
            
            pan_min_bytes = self.int_to_bytes(pan_min, 2)
            pan_max_bytes = self.int_to_bytes(pan_max, 2)
            tilt_min_bytes = self.int_to_bytes(tilt_min, 2)
            tilt_max_bytes = self.int_to_bytes(tilt_max, 2)
            
            response_data = [RESPONSE_SUCCESS] + pan_min_bytes + pan_max_bytes + tilt_min_bytes + tilt_max_bytes
            
            self.logger.info(f"Limit position data requested by {client_address}")
            print(f"📏 Limit position data: Pan({pan_min}-{pan_max}), Tilt({tilt_min}-{tilt_max})")
            
            return response_data
            
        except Exception as e:
            self.logger.error(f"Error getting limit position data: {e}")
            return [RESPONSE_ERROR]
            
    def int_to_bytes(self, value, num_bytes):
        """Convert integer to byte array (little endian)"""
        result = []
        for i in range(num_bytes):
            result.append((value >> (i * 8)) & 0xFF)
        return result
        
    def verify_checksum(self, packet_data):
        """Verify packet checksum"""
        try:
            if len(packet_data) < 6:
                return False
                
            # Extract data without checksum
            data_without_checksum = packet_data[:-1]
            received_checksum = packet_data[-1]
            
            # Calculate expected checksum
            expected_checksum = self.calculate_checksum(data_without_checksum)
            
            return received_checksum == expected_checksum
        except Exception as e:
            self.logger.error(f"Checksum verification error: {e}")
            return False

    def create_response_packet(self, pid, response_data):
        """Create PNT response packet (올바른 PNT 응답 구조)"""
        data = list(response_data or [])
        # PNT 프로토콜 응답 패킷 구조: [RMID, TMID, PNT_ID, PID, LEN, DATA..., CHECKSUM]
        base = [RMID, TMID, PNT_ID, pid, len(data)] + data
        checksum = self.calculate_checksum(base)
        packet = bytes(base + [checksum])
        
        # 디버깅을 위한 로그
        self.logger.info(f"Response packet created: {packet.hex()}")
        print(f"📤 Response packet: {packet.hex()}")
        
        return packet
        
    def create_error_response(self):
        """Create error response packet"""
        return self.create_response_packet(0, [RESPONSE_ERROR])
        
    def calculate_checksum(self, data):
        """Calculate two's complement checksum (PNT 프로토콜 표준)"""
        total = sum(data) & 0xFF
        return ((~total) + 1) & 0xFF
        
    def get_current_ptz_position(self):
        """Get current PTZ position from camera"""
        try:
            # TODO: 실제 카메라에서 현재 PTZ 위치를 읽어오는 구현
            # 현재는 시뮬레이션 데이터 반환
            
            # 실제 구현 예시:
            # - ONVIF GetStatus 명령 사용
            # - VISCA Position Inquiry 명령 사용  
            # - Pelco-D Position Inquiry 명령 사용
            # - 카메라 제조사 API 사용
            
            # 시뮬레이션 데이터 (실제 구현 시 제거)
            import random
            return {
                'pan': random.randint(-180, 180),    # -180도 ~ +180도
                'tilt': random.randint(-90, 90),     # -90도 ~ +90도  
                'zoom': random.randint(0, 100)       # 0% ~ 100%
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get current PTZ position: {e}")
            raise
            
    def move_to_ptz_position(self, pan, tilt, zoom):
        """Move camera to specified PTZ position"""
        try:
            # TODO: 실제 카메라를 지정된 PTZ 위치로 이동시키는 구현
            # 현재는 시뮬레이션
            
            # 실제 구현 예시:
            # - ONVIF AbsoluteMove 명령 사용
            # - VISCA Pan/Tilt/Zoom 명령 사용
            # - Pelco-D Pan/Tilt/Zoom 명령 사용
            # - 카메라 제조사 API 사용
            
            self.logger.info(f"Moving camera to: Pan={pan}, Tilt={tilt}, Zoom={zoom}")
            
            # 시뮬레이션: 이동 시간 대기 (실제 구현 시 제거)
            import time
            time.sleep(0.1)  # 100ms 대기
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to move camera to PTZ position: {e}")
            return False
        
    def get_status(self):
        """Get server status information"""
        return {
            'running': self.running,
            'host': self.host,
            'port': self.port,
            'clients_connected': len(self.clients),
            'presets_saved': len(self.presets),
            'tour_running': self.tour_running,
            'tour_data_entries': len(self.tour_data)
        }
        
    def get_preset_info(self, preset_num):
        """Get preset information including PTZ values"""
        if preset_num in self.presets:
            preset_data = self.presets[preset_num]
            return {
                'preset_num': preset_num,
                'pan': preset_data.get('pan', 'N/A'),
                'tilt': preset_data.get('tilt', 'N/A'),
                'zoom': preset_data.get('zoom', 'N/A'),
                'timestamp': preset_data.get('timestamp', 'N/A'),
                'client': preset_data.get('client', 'N/A')
            }
        else:
            return None
            
    def list_all_presets(self):
        """List all saved presets with PTZ values"""
        preset_list = []
        for preset_num in sorted(self.presets.keys()):
            preset_info = self.get_preset_info(preset_num)
            if preset_info:
                preset_list.append(preset_info)
        return preset_list
        
    def save_presets_to_ini(self):
        """Save presets to ptz_info.ini file"""
        try:
            config = configparser.ConfigParser()
            
            # Add presets section
            config.add_section('PRESETS')
            
            for preset_num, preset_data in self.presets.items():
                section_name = f'PRESET_{preset_num}'
                config.add_section(section_name)
                config.set(section_name, 'pan', str(preset_data.get('pan', 0)))
                config.set(section_name, 'tilt', str(preset_data.get('tilt', 0)))
                config.set(section_name, 'zoom', str(preset_data.get('zoom', 0)))
                config.set(section_name, 'timestamp', preset_data.get('timestamp', ''))
                config.set(section_name, 'client', preset_data.get('client', ''))
            
            # Write to file
            with open(self.ptz_info_file, 'w', encoding='utf-8') as f:
                config.write(f)
                
            self.logger.info(f"Presets saved to {self.ptz_info_file}")
            print(f"💾 Presets saved to {self.ptz_info_file}")
            
        except Exception as e:
            self.logger.error(f"Failed to save presets to INI file: {e}")
            print(f"❌ Failed to save presets to INI file: {e}")
            
    def load_presets_from_ini(self):
        """Load presets from ptz_info.ini file"""
        try:
            if not os.path.exists(self.ptz_info_file):
                self.logger.info(f"PTZ info file not found: {self.ptz_info_file}")
                return
                
            config = configparser.ConfigParser()
            config.read(self.ptz_info_file, encoding='utf-8')
            
            # Clear existing presets
            self.presets = {}
            
            # Load presets from INI file
            if config.has_section('PRESETS'):
                # Find all preset sections
                for section_name in config.sections():
                    if section_name.startswith('PRESET_'):
                        try:
                            preset_num = int(section_name.split('_')[1])
                            
                            preset_data = {
                                'pan': int(config.get(section_name, 'pan', fallback='0')),
                                'tilt': int(config.get(section_name, 'tilt', fallback='0')),
                                'zoom': int(config.get(section_name, 'zoom', fallback='0')),
                                'timestamp': config.get(section_name, 'timestamp', fallback=''),
                                'client': config.get(section_name, 'client', fallback='')
                            }
                            
                            self.presets[preset_num] = preset_data
                            self.logger.info(f"Loaded preset {preset_num}: Pan={preset_data['pan']}, Tilt={preset_data['tilt']}, Zoom={preset_data['zoom']}")
                            
                        except (ValueError, configparser.NoOptionError) as e:
                            self.logger.warning(f"Failed to load preset from section {section_name}: {e}")
                            continue
                            
            self.logger.info(f"Loaded {len(self.presets)} presets from {self.ptz_info_file}")
            print(f"📋 Loaded {len(self.presets)} presets from {self.ptz_info_file}")
            
        except Exception as e:
            self.logger.error(f"Failed to load presets from INI file: {e}")
            print(f"❌ Failed to load presets from INI file: {e}")
            
    def delete_preset(self, preset_num):
        """Delete a preset and save to INI file"""
        try:
            if preset_num in self.presets:
                del self.presets[preset_num]
                self.save_presets_to_ini()
                self.logger.info(f"Preset {preset_num} deleted")
                print(f"🗑️ Preset {preset_num} deleted")
                return True
            else:
                self.logger.warning(f"Preset {preset_num} not found for deletion")
                return False
        except Exception as e:
            self.logger.error(f"Failed to delete preset {preset_num}: {e}")
            return False
        
    def save_state(self, filename='pnt_server_state.json'):
        """Save server state to file"""
        state = {
            'presets': self.presets,
            'tour_data': self.tour_data,
            'tour_running': self.tour_running,
            'timestamp': datetime.now().isoformat()
        }
        
        state_file = os.path.join(os.path.dirname(__file__), filename)
        try:
            with open(state_file, 'w', encoding='utf-8') as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
            self.logger.info(f"State saved to {state_file}")
        except Exception as e:
            self.logger.error(f"Failed to save state: {e}")
            
    def load_state(self, filename='pnt_server_state.json'):
        """Load server state from file"""
        state_file = os.path.join(os.path.dirname(__file__), filename)
        try:
            if os.path.exists(state_file):
                with open(state_file, 'r', encoding='utf-8') as f:
                    state = json.load(f)
                self.presets = state.get('presets', {})
                self.tour_data = state.get('tour_data', {})
                self.tour_running = state.get('tour_running', False)
                self.logger.info(f"State loaded from {state_file}")
        except Exception as e:
            self.logger.error(f"Failed to load state: {e}")

def main():
    """Main function to start the PNT server"""
    print("🎥 PNT Protocol Server")
    print("=" * 50)
    
    # Create server instance
    server = PNTServer(host='0.0.0.0', port=32000)
    
    # Load presets from INI file
    server.load_presets_from_ini()
    
    # Show loaded presets
    presets = server.list_all_presets()
    if presets:
        print(f"\n📋 Loaded {len(presets)} presets:")
        for preset in presets:
            print(f"  Preset {preset['preset_num']}: Pan={preset['pan']}, Tilt={preset['tilt']}, Zoom={preset['zoom']}")
    else:
        print("\n📋 No presets loaded")
    
    try:
        # Start server
        server.start()
    except Exception as e:
        print(f"❌ Server error: {e}")
        server.save_presets_to_ini()
        server.stop()

if __name__ == "__main__":
    main()
