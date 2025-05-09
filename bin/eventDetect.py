# -*- coding:utf-8 -*-
# 한글 주석 처리
__author__ = 'bychem'

import logging
import time
import json
import os
import sys
import platform
from logging.handlers import RotatingFileHandler
import signal
import json
import MySQLdb
from configparser import ConfigParser
from glob import glob
import requests
from datetime import datetime, timedelta
import cv2
import numpy as np
import traceback
from pathlib import Path
import subprocess
from ultralytics import YOLO  # YOLOv8 추가
import argparse  # 명령행 인자 처리를 위해 추가
import threading
import queue
import ffmpeg
import pymysql

# 로깅 설정
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
log_file = log_dir / "event_detecter.log"

handler = RotatingFileHandler(
    log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8'
)
handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))

logger = logging.getLogger("EventDetecter")
logger.setLevel(logging.INFO)
logger.addHandler(handler)

# 콘솔 출력을 위한 핸들러 추가
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))
logger.addHandler(console_handler)


### mariadb 연결정보 ####
DBSERVER_IP = "127.0.0.1"  # localhost 대신 IP 주소 사용
DBSERVER_PORT = 3306
DBSERVER_USER = "dbadmin"
DBSERVER_PASSWORD = "p#ssw0rd"
DBSERVER_DB = "nvrdb"
nvrdb = None
########################

def parse_cameras_from_json():
    """
    ../test/camera.ui/database/dababase.json 파일에서 cameras 키값을 파싱하여 반환합니다.
    """
    json_path = '../test/camera.ui/database/database.json'
    try:
        # JSON 파일 경로
        json_path = json_path
        
        # JSON 파일 읽기
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # cameras 키값 추출
        if 'cameras' in data:
            return data['cameras']
        else:
            logger.warning("'cameras' key not found in JSON file")
            return None
            
    except FileNotFoundError:
        logger.error(f"File not found at {json_path}")
        return None
    except json.JSONDecodeError:
        logger.error("Invalid JSON format")
        return None
    except Exception as e:
        logger.error(f"Error parsing JSON: {str(e)}")
        return None

class EventDetecter:
    def __init__(self, debug_mode=False):
        self.debug_mode = debug_mode
        self.cameras = parse_cameras_from_json()
        if not self.cameras:
            logger.error("Failed to load cameras from JSON")
            self.cameras = {}
        self.object_setting = None
        self.last_setting_time = 0
        self.setting_lock = threading.Lock()

    def connect_to_db(self):
        global nvrdb
        try:
            if nvrdb is not None:
                try:
                    # 연결 상태 확인을 위한 간단한 쿼리 실행
                    cursor = nvrdb.cursor()
                    cursor.execute('SELECT 1')
                    cursor.close()
                    return True
                except Exception as e:
                    logger.error(f"Connection check failed: {str(e)}")
                    nvrdb = None
            
            # 새로운 연결 생성
            nvrdb = pymysql.connect(
                host=DBSERVER_IP,
                port=DBSERVER_PORT,
                user=DBSERVER_USER,
                password=DBSERVER_PASSWORD,
                db=DBSERVER_DB,
                charset='utf8',
                autocommit=True,
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=5
            )
            logger.info("Database connected successfully")
            return True
        except Exception as e:
            logger.error(f'Database connection failed: {str(e)}')
            logger.error(f'Connection params: host={DBSERVER_IP}, port={DBSERVER_PORT}, user={DBSERVER_USER}, db={DBSERVER_DB}')
            onixdb = None
            return False

    def disconnect_db(self):
        global nvrdb
        try:
            if nvrdb:
                nvrdb.close()
                nvrdb = None
                logger.info("Database disconnected")
        except Exception as e:
            logger.error(f'Error disconnecting database: {str(e)}')

    def get_db_cursor(self):
        global nvrdb
        if not self.connect_to_db():
            return None
        try:
            return nvrdb.cursor(pymysql.cursors.DictCursor)
        except Exception as e:
            logger.error(f'Error getting cursor: {str(e)}')
            return None
    
        # YOLOv8 모델 초기화
    def get_rtsp_url_from_json(self,camera_name, json_path='../test/camera.ui/database/database.json'):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            cameras = data.get('cameras', [])
            for cam in cameras:
                if cam.get('name') == camera_name:
                    # videoConfig.source 또는 rtsp_url 키에서 추출
                    if 'videoConfig' in cam and 'source' in cam['videoConfig']:
                        src = cam['videoConfig']['source']
                        if 'rtsp://' in src:
                            return src[src.find('rtsp://'):].strip('"')
                    if 'rtsp_url' in cam:
                        return cam['rtsp_url']
            logger.error(f"Camera with name '{camera_name}' not found in JSON.")
            return None
        except Exception as e:
            logger.error(f"Error reading JSON: {e}")
            return None

    def draw_detections(self, image, results):
        annotated = image.copy()
        for box, conf, cls in zip(results.boxes.xyxy.cpu().numpy(), results.boxes.conf.cpu().numpy(), results.boxes.cls.cpu().numpy()):
            x1, y1, x2, y2 = map(int, box)
            label = f"{results.names[int(cls)]} {conf:.2f}"
            color = (0, 255, 0)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            cv2.putText(annotated, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        return annotated

    def drain_stderr(self,stderr):
        while True:
            if stderr.closed:
                break
            stderr.read(1024)

    def insert_event_history(self, camera_name, detected_image_url, event_data_json, event_accur_time=None):
        if event_accur_time is None:
            event_accur_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        create_date = event_accur_time
        try:
            cursor = self.get_db_cursor()
            if cursor:
                sql = ("""
                    INSERT INTO tb_event_history 
                    (fk_camera_id, camera_name, event_accur_time, event_type, event_data_json, fk_detect_zone_id, detected_image_url, create_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """)
                cursor.execute(sql, (
                    4, camera_name, event_accur_time, 'E001', event_data_json, 0, detected_image_url, create_date
                ))
                cursor.close()
                logger.info(f"DB Insert: {camera_name}, {event_data_json}, {detected_image_url}")
                return True
            else:
                logger.error("DB cursor is None. Insert failed.")
                return False
        except Exception as e:
            logger.error(f"DB Insert Error: {str(e)}")
            return False

    def get_latest_event_setting(self):
        try:
            # 서버 API로 조회 (로컬 서버 기준)
            res = requests.get('http://localhost:9091/api/eventSetting', timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get('object_json'):
                    return json.loads(data['object_json'])
            return None
        except Exception as e:
            logger.error(f'eventSetting 조회 실패: {e}')
            return None

    def setting_updater(self):
        while True:
            new_setting = self.get_latest_event_setting()
            with self.setting_lock:
                self.object_setting = new_setting
                self.last_setting_time = time.time()
            time.sleep(10)

    def run(self):
        try:
            camera_name = "댐영상4"
            rtsp_url = None
            for cam in self.cameras:
                if cam.get('name') == camera_name:
                    if 'videoConfig' in cam and 'source' in cam['videoConfig']:
                        src = cam['videoConfig']['source']
                        if 'rtsp://' in src:
                            rtsp_url = src[src.find('rtsp://'):].strip('"')
                            break
                    if 'rtsp_url' in cam:
                        rtsp_url = cam['rtsp_url']
                        break
            if not rtsp_url:
                logger.error(f"Camera with name '{camera_name}' not found in self.cameras.")
                return

            # 설정 갱신 스레드 시작
            threading.Thread(target=self.setting_updater, daemon=True).start()

            yolo_model = YOLO('yolov8n.pt')
            detection_id = 0
            interval = 1.0
            confidence_threshold = 0.5
            detection_labels = None
            enable_tracking = True

            while True:
                # 최신 설정값 읽기
                with self.setting_lock:
                    object_setting = self.object_setting
                if object_setting:
                    enable_tracking = object_setting.get('enableTracking', True)
                    detection_type = object_setting.get('detectionType', '사람')
                    accuracy = object_setting.get('accuracy', '보통')
                    tracking_duration = object_setting.get('trackingDuration', 1)
                    # 라벨 필터
                    if detection_type == '전체':
                        detection_labels = None
                    elif detection_type == '사람':
                        detection_labels = ['person']
                    elif detection_type == '차량':
                        detection_labels = ['car', 'truck']
                    elif detection_type == '동물':
                        detection_labels = ['animal']
                    else:
                        detection_labels = [detection_type]
                    # 정확도 임계값
                    if accuracy == '높음':
                        confidence_threshold = 0.7
                    elif accuracy == '보통':
                        confidence_threshold = 0.5
                    else:
                        confidence_threshold = 0.3
                    # interval
                    try:
                        interval = float(tracking_duration)
                    except:
                        interval = 1.0
                    logger.info(f"[설정] enableTracking={enable_tracking}, detectionType={detection_type}, accuracy={accuracy}, interval={interval}")
                else:
                    enable_tracking = True
                    detection_labels = None
                    confidence_threshold = 0.5
                    interval = 1.0

                if not enable_tracking:
                    logger.info('[설정] enableTracking이 False이므로 검출 중지')
                    time.sleep(1)
                    continue

                # ffmpeg probe 및 스트림 연결
                # logger.info(f"Connecting to RTSP stream: {rtsp_url}")
                try:
                    probe = ffmpeg.probe(rtsp_url, rtsp_transport='tcp')
                    video_stream = next(s for s in probe['streams'] if s['codec_type'] == 'video')
                    w = int(video_stream['width'])
                    h = int(video_stream['height'])
                    pix_fmt = video_stream['pix_fmt']
                    fps = float(eval(video_stream['r_frame_rate']))
                    # logger.info(f"Stream info: {w}x{h}, {fps}fps, pix_fmt={pix_fmt}")
                except Exception as e:
                    logger.error(f"ffmpeg probe 실패: {e}")
                    time.sleep(5)
                    continue

                process = (
                    ffmpeg
                    .input(rtsp_url, rtsp_transport='tcp')
                    .output('pipe:', format='rawvideo', pix_fmt=pix_fmt, s=f'{w}x{h}', r=fps)
                    .run_async(pipe_stdout=True, pipe_stderr=True)
                )
                threading.Thread(target=self.drain_stderr, args=(process.stderr,), daemon=True).start()
                frame_size = w * h * 3 // 2  # YUV420p
                frame_count = 0
                start_time = time.time()
                last_infer_time = 0
                
                while True:
                    try:
                        in_bytes = process.stdout.read(frame_size)
                        if not in_bytes or len(in_bytes) < frame_size:
                            logger.error("스트림이 종료되었거나 데이터가 부족합니다.")
                            break
                        yuv = np.frombuffer(in_bytes, np.uint8).reshape((h * 3 // 2, w))
                        bgr = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)
                        frame_count += 1
                        elapsed = time.time() - start_time
                        if elapsed >= 1.0:
                            # logger.info(f"Current FPS: {frame_count / elapsed:.2f}, Frame shape: {bgr.shape}")
                            frame_count = 0
                            start_time = time.time()
                        # interval마다 YOLO 추론
                        if time.time() - last_infer_time >= interval:
                            results = yolo_model(bgr)
                            filtered_boxes = []
                            for box, conf, cls in zip(results[0].boxes.xyxy.cpu().numpy(), results[0].boxes.conf.cpu().numpy(), results[0].boxes.cls.cpu().numpy()):
                                label = results[0].names[int(cls)]
                                if detection_labels and label not in detection_labels:
                                    logger.info(f"[검출제외] label={label}, conf={conf:.2f} (detectionType={detection_labels}) 대상 아님")
                                    continue
                                if conf < confidence_threshold:
                                    continue
                                filtered_boxes.append((box, conf, cls))
                            if filtered_boxes:
                                annotated = bgr.copy()
                                detected_objects = []
                                for box, conf, cls in filtered_boxes:
                                    x1, y1, x2, y2 = map(int, box)
                                    label = f"{results[0].names[int(cls)]} {conf:.2f}"
                                    color = (0, 255, 0)
                                    cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                                    cv2.putText(annotated, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
                                    detected_objects.append({
                                        'label': results[0].names[int(cls)],
                                        'bbox': [x1, y1, x2, y2],
                                        'confidence': float(conf)
                                    })
                                today = datetime.now().strftime('%Y-%m-%d')
                                output_dir = os.path.join('../test/camera.ui/detected_image', today)
                                os.makedirs(output_dir, exist_ok=True)
                                filename = os.path.join(output_dir, f'{camera_name}_detection_{detection_id}.jpg')
                                cv2.imwrite(filename, annotated)
                                detection_id += 1
                                if self.debug_mode:
                                    cv2.imshow('YOLO Detection', annotated)
                                # DB 기록 추가
                                event_data_json = json.dumps(detected_objects, ensure_ascii=False)
                                event_accur_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                                self.insert_event_history(camera_name, filename, event_data_json, event_accur_time)
                            last_infer_time = time.time()
                        if self.debug_mode and cv2.waitKey(1) & 0xFF == ord('q'):
                            break
                    except Exception as e:
                        logger.error(f"프레임 처리 중 오류 발생: {str(e)}")
                        break
                process.stdout.close()
                process.wait()
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
        finally:
            cv2.destroyAllWindows()

if __name__ == "__main__":
    try:
        # 명령행 인자 파싱
        parser = argparse.ArgumentParser(description='Event Detection with RTSP Stream')
        parser.add_argument('--debug', action='store_true', help='Enable debug mode with UI')
        args = parser.parse_args()
        
        detecter = EventDetecter(debug_mode=args.debug)
        detecter.run()

    except Exception as e:
        logger.error(f"Error in main: {str(e)}")
        logger.error(traceback.format_exc())

