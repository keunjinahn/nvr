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
import traceback
from pathlib import Path
import argparse
import pymysql
import socket
import atexit
import cv2
import base64
import numpy as np
import subprocess
import tempfile
import os

def load_config():
    config = ConfigParser()
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.ini')
    
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config file not found: {config_path}")
    
    config.read(config_path, encoding='utf-8')
    return config

# 설정 로드
config = load_config()

# API 설정
API_BASE_URL = config.get('API', 'base_url', fallback='http://localhost:9001')

### mariadb 연결정보 ####
DBSERVER_IP = config.get('DATABASE', 'host')
DBSERVER_PORT = config.getint('DATABASE', 'port')
DBSERVER_USER = config.get('DATABASE', 'user')
DBSERVER_PASSWORD = config.get('DATABASE', 'password')
DBSERVER_DB = config.get('DATABASE', 'database')
DBSERVER_CHARSET = config.get('DATABASE', 'charset')
nvrdb = None
########################

# 로깅 설정
log_dir = Path(config.get('LOGGING', 'log_dir'))
log_dir.mkdir(exist_ok=True)
log_file = log_dir / config.get('LOGGING', 'log_file')

handler = RotatingFileHandler(
    log_file,
    maxBytes=config.getint('LOGGING', 'max_bytes'),
    backupCount=config.getint('LOGGING', 'backup_count'),
    encoding='utf-8'
)
handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))

logger = logging.getLogger("VideoAlertChecker")
logger.setLevel(logging.INFO)
logger.addHandler(handler)

# 콘솔 출력을 위한 핸들러 추가
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))
logger.addHandler(console_handler)


class VideoAlertChecker:
    def __init__(self, debug_mode=False):
        self.debug_mode = debug_mode
        self.config = config
        self.alert_settings = None
        self.zone_list = None
        self.last_settings_check = 0
        self.last_data_check = 0
        self.settings_check_interval = 30  # 30 seconds
        self.data_check_interval = 10  # 10 secon6ds
        self.running = True
        self.force_exit = False  # 강제 종료 플래그
        
        # 시그널 핸들러 등록
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # 종료 시 정리 작업 등록
        atexit.register(self.cleanup)

    def signal_handler(self, signum, frame):
        """시그널 핸들러"""
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        self.running = False
        # 강제 종료를 위한 추가 플래그
        self.force_exit = True

    def cleanup(self):
        """프로그램 종료 시 정리 작업"""
        try:
            logger.info("Performing cleanup...")
            self.disconnect_db()
            logger.info("Cleanup completed successfully")
        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")

    def connect_to_db(self):
        global nvrdb
        try:
            if nvrdb is not None:
                try:
                    cursor = nvrdb.cursor()
                    cursor.execute('SELECT 1')
                    cursor.close()
                    return True
                except Exception as e:
                    logger.error(f"Connection check failed: {str(e)}")
                    nvrdb = None
            
            nvrdb = pymysql.connect(
                host=DBSERVER_IP,
                port=DBSERVER_PORT,
                user=DBSERVER_USER,
                password=DBSERVER_PASSWORD,
                db=DBSERVER_DB,
                charset=DBSERVER_CHARSET,
                autocommit=True,
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=5
            )
            logger.info("Database connected successfully")
            return True
        except Exception as e:
            logger.error(f'Database connection failed: {str(e)}')
            logger.error(f'Connection params: host={DBSERVER_IP}, port={DBSERVER_PORT}, user={DBSERVER_USER}, db={DBSERVER_DB}')
            nvrdb = None
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

    def get_alert_settings(self):
        try:
            print("get_alert_settings start...")
            cursor = self.get_db_cursor()
            if not cursor:
                return False

            query = """
                SELECT alert_setting_json 
                FROM tb_alert_setting 
                limit 1
            """
            cursor.execute(query)
            result = cursor.fetchone()
            print("get_alert_settings result : ", result['alert_setting_json'])
            if result and result['alert_setting_json']:
                self.alert_settings = json.loads(result['alert_setting_json'])
                logger.info("Successfully retrieved alert settings from database")
                return True
            else:
                logger.error("No alert settings found in database")
                return False

        except Exception as e:
            logger.error(f"Error getting alert settings from database: {str(e)}")
            return False
        finally:
            if cursor:
                cursor.close()

    def check_video_data(self):
        try:
            cursor = self.get_db_cursor()
            if not cursor:
                return

            query = """
                SELECT * FROM tb_video_receive_data 
                ORDER BY create_date DESC limit 1
            """            
            cursor.execute(query)
            video_data = cursor.fetchall()

            if not video_data:
                logger.info("No video data found in the last 10 seconds")
                return

            for data in video_data:
                try:
                    data_value = json.loads(data['data_value'])
                    roi_values = []  # Array to store ROI values with their keys
                    
                    # Check ROI values (data_22 to data_40)
                    for i in range(22, 41, 2):
                        roi_key = f'data_{i}'
                        if roi_key in data_value:
                            roi_value = float(data_value[roi_key])
                            roi_values.append({
                                'key': roi_key,
                                'value': roi_value
                            })

                    if not roi_values:
                        continue
                    # print("roi_values : ", roi_values)
                    # print("alert_settings : ", self.alert_settings)
                    # Compare with alert thresholds
                    for level, levelItem in enumerate(reversed(self.alert_settings['alarmLevels'])):
                        # print("level : ", level, "levelItem : ", levelItem)
                        for idx, min_roi in enumerate(roi_values):
                            #print("min_roi : ", min_roi, "levelItem : ", levelItem['threshold'])
                            if min_roi['value'] < float(levelItem['threshold']):
                                self.create_alert(data['id'],data_value,idx, min_roi, int(levelItem['id']) -1, None)
                                break

                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON in data_value: {data['data_value']}")
                except Exception as e:
                    logger.error(f"Error processing video data: {str(e)}")

        except Exception as e:
            logger.error(f"Error checking video data: {str(e)}")
        finally:
            if cursor:
                cursor.close()

    def create_alert(self, fk_video_receive_data_id, data_value, idx, min_roi, alert_level, temperature_diff=None, base_temperature=None, roi_temperature_diff=None, roi_min_temp=None, roi_max_temp=None):
        try:
            cursor = self.get_db_cursor()
            if not cursor:
                return
            roi_num = int(min_roi['key'].split('_')[1])
            max_roi_key = f"data_{roi_num + 1}"

            # 1. 중복 체크
            check_query = """
                SELECT 1 FROM tb_alert_history
                WHERE fk_video_receive_data_id = %s AND fk_detect_zone_id = %s
                LIMIT 1
            """
            cursor.execute(check_query, (fk_video_receive_data_id, idx + 1))
            if cursor.fetchone():
                logger.info(f"Duplicate alert exists for fk_video_receive_data_id={fk_video_receive_data_id}, fk_detect_zone_id={idx + 1}. Skipping insert.")
                return

            # 2. 비디오 스냅샷 캡처
            snapshot_images = self.capture_video_snapshots()
            print(f"Captured {len(snapshot_images)} snapshots")
            if snapshot_images:
                print(f"First snapshot data length: {len(snapshot_images[0]['image_data'])}")
            else:
                print("No snapshots captured")

            # 시나리오 3의 경우 다른 설명 포맷 사용
            if min_roi['key'] == 'data_21':
                temp_desc = f"현재 평균온도({min_roi['value']:.1f}℃)가 기준온도({base_temperature:.1f}℃)와 {temperature_diff:.1f}℃ 차이 (95% 신뢰구간: {roi_min_temp:.1f}℃ ~ {roi_max_temp:.1f}℃)"
            else:
                temp_desc = f"ROI 구간 온도차: {temperature_diff:.1f}℃ (최대-최소)" if base_temperature is None else f"base 온도차({base_temperature:.1f}℃) 대비 ROI 온도차({roi_temperature_diff:.1f}℃) 차이: {temperature_diff:.1f}%"

            alert_info = {
                'min_roi_key': min_roi['key'],
                'min_roi_value': min_roi['value'],
                'max_roi_key': max_roi_key,
                'max_roi_value': data_value.get(max_roi_key),
                'alert_level': alert_level,
                'check_time': datetime.now().isoformat(),
                'temperature_diff': temperature_diff,
                'temperature_diff_desc': temp_desc
            }
            print("alert_info : ", alert_info)
            query = """
                INSERT INTO tb_alert_history 
                (fk_camera_id, alert_accur_time, alert_type, alert_level, 
                alert_status, alert_info_json, fk_detect_zone_id, 
                fk_process_user_id, create_date, update_date, fk_video_receive_data_id, snapshotImages)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            now = datetime.now()
            values = (
                1,  # fk_camera_id
                now,  # alert_accur_time
                'A001',  # alert_type
                alert_level + 1,  # alert_level
                'P001',  # alert_status
                json.dumps(alert_info),  # alert_info_json
                idx + 1,  # fk_detect_zone_id
                0,  # fk_process_user_id
                now,  # create_date
                now,   # update_date
                fk_video_receive_data_id,   # fk_video_receive_data_id
                json.dumps(snapshot_images)  # snapshotImages
            )

            cursor.execute(query, values)
            logger.info(f"Created alert for camera with level {alert_level} (ROI: {min_roi['key']} = {min_roi['value']}) with {len(snapshot_images)} snapshots")
            print(f"Alert created with {len(snapshot_images)} snapshots")
            print(f"Snapshot data size: {len(json.dumps(snapshot_images))} characters")

        except Exception as e:
            logger.error(f"Error creating alert: {str(e)}")
        finally:
            if cursor:
                cursor.close()

    def scenario1_judge(self):
        """
        시나리오1: tb_video_receive_data의 최신 데이터 1개에서
        각 ROI 구간별 (최대-최소) 값의 차이가 기준값 이상이면 경보 생성
        """
        cursor = None
        print("scenario1_judge")
        try:
            cursor = self.get_db_cursor()
            if not cursor:
                return False, None
            
            # 1. 최신 데이터 1개 조회
            cursor.execute("""
                SELECT * FROM tb_video_receive_data
                ORDER BY create_date DESC
                LIMIT 1
            """)
            current = cursor.fetchone()

            if not current:
                logger.info("No data found for scenario1_judge")
                return False, None

            # 2. zone_type 리스트 가져오기
            if not self.zone_list:
                logger.warning("No active zone types found for scenario1_judge")
                return False, None

            # 3. ROI 값 추출 및 반복 (zone_type 기반)
            current_info = json.loads(current['data_value'])
            
            # zone_type을 기반으로 ROI 쌍 생성
            roi_pairs = []
            for zone_type in self.zone_list:
                try:
                    # zone_type을 숫자로 변환하여 ROI 인덱스 계산
                    zone_num = int(zone_type)
                    min_idx = 22 + (zone_num - 1) * 2  # zone1: 22,23, zone2: 24,25, ...
                    max_idx = min_idx + 1
                    roi_pairs.append((min_idx, max_idx, zone_type))
                except ValueError:
                    logger.warning(f"Invalid zone_type format: {zone_type}")
                    continue

            # scenario1의 4단계 기준값 가져오기
            print("self.alert_settings : ", self.alert_settings)
            levels = self.alert_settings['alarmLevels']['scenario1']
            print("levels : ", levels)
            # 4단계 기준값: [2, 5, 8, 10]

            for idx, (min_idx, max_idx, zone_type) in enumerate(roi_pairs):
                min_key = f'data_{min_idx}'
                max_key = f'data_{max_idx}'
                min_val = current_info.get(min_key)
                max_val = current_info.get(max_key)
                if min_val is not None and max_val is not None:
                    try:
                        diff = abs(float(max_val) - float(min_val))
                        logger.info(f"Zone {zone_type} ROI {min_key}/{max_key} 최대-최소값 차이: {diff}℃ (최대: {max_val}, 최소: {min_val})")
                        
                        # 4단계 기준값과 비교하여 alert_level 결정
                        self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 0, diff)
                        # if diff >= levels[3]:  # 10℃ 이상
                        #     self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 3, diff)
                        # elif diff >= levels[2]:  # 8℃ 이상
                        #     self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 2, diff)
                        # elif diff >= levels[1]:  # 5℃ 이상
                        #     self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 1, diff)
                        # elif diff >= levels[0]:  # 2℃ 이상
                        #     self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 0, diff)
                    except Exception as e:
                        logger.error(f"Zone {zone_type} ROI 값 비교 오류: {e}")

            return False, None

        except Exception as e:
            logger.error(f"scenario1_judge error: {e}")
            return False, None
        finally:
            if cursor:
                cursor.close()

    def scenario2_judge(self):
        """
        시나리오2: 
        - base 온도: data_19(최저)와 data_20(최고)의 차이
        - 각 ROI의 최고-최저 온도차가 base 온도차와 기준값 이상 차이나면 누수판단
        """
        try:
            cursor = self.get_db_cursor()
            if not cursor:
                return False, None

            # 1. 최신 데이터 1개 조회
            cursor.execute("""
                SELECT * FROM tb_video_receive_data
                ORDER BY create_date DESC
                LIMIT 1
            """)
            current = cursor.fetchone()

            if not current:
                logger.info("No data found for scenario2_judge")
                return False, None

            # 2. base 온도(data_19, data_20) 추출 및 차이 계산
            current_info = json.loads(current['data_value'])
            base_min = current_info.get('data_19')
            base_max = current_info.get('data_20')
            
            if base_min is None or base_max is None:
                logger.error("base 온도(data_19 또는 data_20) 정보가 없습니다.")
                return False, None

            try:
                base_min = float(base_min)
                base_max = float(base_max)
                base_diff = abs(base_max - base_min)
                logger.info(f"base 온도차: {base_diff:.1f}℃ (최고: {base_max}℃, 최저: {base_min}℃)")
            except ValueError:
                logger.error(f"base 온도 변환 오류: data_19={base_min}, data_20={base_max}")
                return False, None

            # 3. 각 ROI 지점의 최고-최저 온도차와 base 온도차 비교
            if not self.zone_list:
                logger.warning("No active zone types found for scenario2_judge")
                return False, None

            # zone_type을 기반으로 ROI 쌍 생성
            roi_pairs = []
            for zone_type in self.zone_list:
                try:
                    # zone_type을 숫자로 변환하여 ROI 인덱스 계산
                    zone_num = int(zone_type)
                    min_idx = 22 + (zone_num - 1) * 2  # zone1: 22,23, zone2: 24,25, ...
                    max_idx = min_idx + 1
                    roi_pairs.append((min_idx, max_idx, zone_type))
                except ValueError:
                    logger.warning(f"Invalid zone_type format: {zone_type}")
                    continue

            # scenario2의 4단계 기준값 가져오기
            levels = self.alert_settings['alarmLevels']['scenario2']
            # 4단계 기준값: [10, 15, 20, 25] (%)

            for idx, (min_idx, max_idx, zone_type) in enumerate(roi_pairs):
                min_key = f'data_{min_idx}'
                max_key = f'data_{max_idx}'
                min_val = current_info.get(min_key)
                max_val = current_info.get(max_key)
                
                if min_val is not None and max_val is not None:
                    try:
                        min_val = float(min_val)
                        max_val = float(max_val)
                        roi_diff = abs(max_val - min_val)
                        
                        # base 온도차와의 차이 계산 (%)
                        diff_percent = abs((roi_diff - base_diff) / base_diff * 100)
                        
                        logger.info(f"Zone {zone_type} ROI {min_key}/{max_key} 온도차: {roi_diff:.1f}℃ (최고: {max_val}℃, 최저: {min_val}℃), base 대비 차이: {diff_percent:.1f}%")
                        
                        # 4단계 기준값과 비교하여 alert_level 결정
                        if diff_percent >= levels[3]:  # 25% 이상
                            self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 3, diff_percent, base_diff, roi_diff, min_val, max_val)
                        elif diff_percent >= levels[2]:  # 20% 이상
                            self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 2, diff_percent, base_diff, roi_diff, min_val, max_val)
                        elif diff_percent >= levels[1]:  # 15% 이상
                            self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 1, diff_percent, base_diff, roi_diff, min_val, max_val)
                        elif diff_percent >= levels[0]:  # 10% 이상
                            self.create_alert(current['id'], current_info, idx, {'key': min_key, 'value': min_val}, 0, diff_percent, base_diff, roi_diff, min_val, max_val)
                    except Exception as e:
                        logger.error(f"Zone {zone_type} ROI {min_key}/{max_key} 값 비교 오류: {e}")

            return False, None

        except Exception as e:
            logger.error(f"scenario2_judge error: {e}")
            return False, None
        finally:
            if cursor:
                cursor.close()

    def scenario3_judge(self):
        """
        시나리오3: 
        - 1시간 동안의 data_21(평균온도) 데이터를 조회하여 95% 신뢰구간의 기준온도 계산
        - 최신 data_21 값과 기준온도의 차이가 기준값 이상이면 누수로 판단
        """
        try:
            cursor = self.get_db_cursor()
            if not cursor:
                return False, None

            # 1. 1시간 동안의 data_21 평균온도 데이터 조회 및 95% 신뢰구간 계산
            cursor.execute("""
                WITH hourly_data AS (
                    SELECT 
                        CAST(JSON_UNQUOTE(JSON_EXTRACT(data_value, '$.data_21')) AS DECIMAL(10,2)) as avg_temp
                    FROM tb_video_receive_data
                    WHERE create_date >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
                    AND JSON_EXTRACT(data_value, '$.data_21') IS NOT NULL
                )
                SELECT 
                    AVG(avg_temp) as mean_temp,
                    STDDEV(avg_temp) as std_temp,
                    COUNT(*) as data_count
                FROM hourly_data
            """)
            stats = cursor.fetchone()

            if not stats or stats['data_count'] < 2:
                logger.warning("1시간 동안의 충분한 데이터가 없습니다.")
                return False, None

            # 95% 신뢰구간 계산 (z-score = 1.96)
            mean_temp = float(stats['mean_temp'])
            std_temp = float(stats['std_temp'])
            confidence_interval = 1.96 * std_temp
            upper_bound = mean_temp + confidence_interval
            lower_bound = mean_temp - confidence_interval

            logger.info(f"1시간 평균온도 통계: 평균={mean_temp:.1f}℃, 표준편차={std_temp:.1f}℃")
            logger.info(f"95% 신뢰구간: {lower_bound:.1f}℃ ~ {upper_bound:.1f}℃")

            # 2. 최신 data_21 값 조회
            cursor.execute("""
                SELECT * FROM tb_video_receive_data
                ORDER BY create_date DESC
                LIMIT 1
            """)
            current = cursor.fetchone()

            if not current:
                logger.info("No current data found for scenario3_judge")
                return False, None

            current_info = json.loads(current['data_value'])
            current_temp = current_info.get('data_21')

            if current_temp is None:
                logger.error("현재 평균온도(data_21) 정보가 없습니다.")
                return False, None

            try:
                current_temp = float(current_temp)
                # 기준온도와의 차이 계산
                temp_diff = abs(current_temp - mean_temp)
                
                logger.info(f"현재 평균온도: {current_temp:.1f}℃, 기준온도(평균): {mean_temp:.1f}℃, 차이: {temp_diff:.1f}℃")
                
                # scenario3의 4단계 기준값 가져오기
                levels = self.alert_settings['alarmLevels']['scenario3']
                # 4단계 기준값: [2, 3, 4, 5] (℃)

                # 4단계 기준값과 비교하여 alert_level 결정
                if temp_diff >= levels[3]:  # 5℃ 이상
                    self.create_alert(current['id'], current_info, 0, {'key': 'data_21', 'value': current_temp}, 3, temp_diff, mean_temp, std_temp, upper_bound, lower_bound)
                elif temp_diff >= levels[2]:  # 4℃ 이상
                    self.create_alert(current['id'], current_info, 0, {'key': 'data_21', 'value': current_temp}, 2, temp_diff, mean_temp, std_temp, upper_bound, lower_bound)
                elif temp_diff >= levels[1]:  # 3℃ 이상
                    self.create_alert(current['id'], current_info, 0, {'key': 'data_21', 'value': current_temp}, 1, temp_diff, mean_temp, std_temp, upper_bound, lower_bound)
                elif temp_diff >= levels[0]:  # 2℃ 이상
                    self.create_alert(current['id'], current_info, 0, {'key': 'data_21', 'value': current_temp}, 0, temp_diff, mean_temp, std_temp, upper_bound, lower_bound)
            except ValueError:
                logger.error(f"온도 변환 오류: data_21={current_temp}")

        except Exception as e:
            logger.error(f"scenario3_judge error: {e}")
            return False, None
        finally:
            if cursor:
                cursor.close()

    def get_zone_list(self):
        """
        tb_event_detection_zone 테이블에서 zone_type 값을 리스트로 가져오기
        """
        try:
            cursor = self.get_db_cursor()
            if not cursor:
                return []

            query = """
                SELECT zone_type 
                FROM tb_event_detection_zone 
                WHERE zone_active = 1 
                AND zone_type IS NOT NULL 
                AND zone_type != ''
                ORDER BY id
            """
            cursor.execute(query)
            results = cursor.fetchall()
            
            zone_types = []
            for row in results:
                if row['zone_type']:
                    zone_types.append(row['zone_type'])
            
            self.zone_list = zone_types
            logger.info(f"Retrieved zone types: {zone_types}")
            return zone_types

        except Exception as e:
            logger.error(f"Error getting zone list: {str(e)}")
            return []
        finally:
            if cursor:
                cursor.close()

    def get_camera_rtsp_sources(self):
        """
        tb_cameras 테이블에서 videoConfig 필드의 JSON을 파싱하여 source 키값과 videoType을 읽어서 리스트 변수에 저장
        """
        try:
            cursor = self.get_db_cursor()
            if not cursor:
                return []

            query = """
                SELECT videoConfig 
                FROM tb_cameras 
                WHERE videoConfig IS NOT NULL 
                AND videoConfig != ''
            """
            cursor.execute(query)
            results = cursor.fetchall()
            
            camera_info_list = []
            for row in results:
                try:
                    if row['videoConfig']:
                        video_config = json.loads(row['videoConfig'])
                        if 'source' in video_config:
                            # RTSP URL에서 -i 파라미터 제거
                            rtsp_url = video_config['source']
                            print("rtsp_url : ", rtsp_url)
                            # URL이 문자열인지 확인
                            if not isinstance(rtsp_url, str):
                                logger.warning(f"Invalid source type: {type(rtsp_url)}, value: {rtsp_url}")
                                continue
                            
                            # 빈 문자열 체크
                            if not rtsp_url.strip():
                                logger.warning(f"Empty source URL: {rtsp_url}")
                                continue
                            
                            # -i 파라미터 제거 (rtsp://로 시작하는 부분만 유지)
                            if '-i' in rtsp_url:
                                # rtsp://로 시작하는 부분을 찾아서 추출
                                rtsp_start = rtsp_url.find('rtsp://')
                                if rtsp_start != -1:
                                    rtsp_url = rtsp_url[rtsp_start:]
                                else:
                                    # rtsp://가 없으면 http:// 또는 https:// 찾기
                                    http_start = rtsp_url.find('http://')
                                    if http_start != -1:
                                        rtsp_url = rtsp_url[http_start:]
                                    else:
                                        https_start = rtsp_url.find('https://')
                                        if https_start != -1:
                                            rtsp_url = rtsp_url[https_start:]
                                        else:
                                            logger.warning(f"No valid protocol found in URL: {rtsp_url}")
                                            continue
                            
                            # URL 정리 (앞뒤 공백 제거)
                            rtsp_url = rtsp_url.strip()
                            print("rtsp_url 2: ", rtsp_url)
                            # videoType 값 가져오기 (기본값: 'unknown')
                            video_type = video_config.get('videoType', 'unknown')
                            
                            camera_info = {
                                'rtsp_url': rtsp_url,
                                'video_type': video_type
                            }
                            print("camera_info : ", camera_info)
                            camera_info_list.append(camera_info)
                            logger.info(f"Found camera - RTSP: {rtsp_url}, Type: {video_type}")
                except json.JSONDecodeError as e:
                    logger.error(f"Error parsing videoConfig JSON: {str(e)}")
                except Exception as e:
                    logger.error(f"Error processing videoConfig: {str(e)}")
            
            self.camera_info_list = camera_info_list
            logger.info(f"Retrieved {len(camera_info_list)} camera configurations")
            return camera_info_list

        except Exception as e:
            logger.error(f"Error getting camera RTSP sources: {str(e)}")
            return []
        finally:
            if cursor:
                cursor.close()

    def capture_video_snapshots(self):
        """
        FFmpeg를 사용하여 RTSP 소스에서 비디오 이미지를 캡처하여 base64로 인코딩
        """
        snapshot_images = []
        
        if not hasattr(self, 'camera_info_list') or not self.camera_info_list:
            logger.warning("No camera configurations available for snapshot capture")
            return snapshot_images
        
        for camera_info in self.camera_info_list:
            try:
                # 강제 종료 체크
                if self.force_exit:
                    logger.info("Force exit requested, stopping snapshot capture")
                    return snapshot_images
                
                print("capture_video_snapshots 1 : ", camera_info)
                rtsp_url = camera_info['rtsp_url']
                video_type = camera_info['video_type']
                
                # RTSP URL 유효성 검사
                if not rtsp_url or not isinstance(rtsp_url, str) or rtsp_url.strip() == '':
                    logger.warning(f"Invalid RTSP URL: {rtsp_url}")
                    continue
                
                rtsp_url = rtsp_url.strip()
                
                # RTSP 프로토콜 확인
                if not rtsp_url.startswith(('rtsp://', 'http://', 'https://')):
                    logger.warning(f"Invalid protocol in RTSP URL: {rtsp_url}")
                    continue
                
                print(f"Capturing snapshot from: {rtsp_url}")
                
                try:
                    # FFmpeg 명령어 구성 (메모리로 직접 출력)
                    ffmpeg_cmd = [
                        'ffmpeg',
                        '-hide_banner',
                        '-loglevel', 'error',
                        '-rtsp_transport', 'tcp',  # TCP 전송 사용
                        '-i', rtsp_url,  # 입력 소스
                        '-vframes', '1',  # 1프레임만 캡처
                        '-q:v', '2',  # 품질 설정
                        '-f', 'image2',  # 이미지 포맷
                        '-'  # stdout으로 출력
                    ]
                    
                    print(f"FFmpeg command: {' '.join(ffmpeg_cmd)}")
                    
                    # FFmpeg 프로세스 실행
                    process = subprocess.Popen(
                        ffmpeg_cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE
                    )
                    
                    # 출력 데이터 수집 (타임아웃 설정)
                    stdout_data, stderr_data = process.communicate(timeout=30)
                    
                    # 디버깅을 위한 로그
                    if stderr_data:
                        stderr_text = stderr_data.decode('utf-8', errors='ignore')
                        logger.debug(f"FFmpeg stderr for {rtsp_url}: {stderr_text}")
                    
                    if process.returncode == 0 and stdout_data:
                        # base64로 인코딩
                        img_base64 = base64.b64encode(stdout_data).decode('utf-8')
                        
                        snapshot_data = {
                            'rtsp_url': rtsp_url,
                            'video_type': video_type,
                            'timestamp': datetime.now().isoformat(),
                            'image_data': img_base64
                        }
                        snapshot_images.append(snapshot_data)
                        logger.info(f"Successfully captured snapshot from: {rtsp_url} (Type: {video_type})")
                        print(f"Added snapshot to list. Total snapshots: {len(snapshot_images)}")
                    else:
                        error_msg = stderr_data.decode('utf-8') if stderr_data else "Unknown error"
                        logger.error(f"FFmpeg failed for {rtsp_url}: {error_msg}")
                        
                except subprocess.TimeoutExpired:
                    logger.error(f"FFmpeg timeout for {rtsp_url}")
                    if process:
                        process.kill()
                        process.wait()
                except Exception as e:
                    logger.error(f"FFmpeg error for {rtsp_url}: {str(e)}")
                
            except Exception as e:
                logger.error(f"Error capturing snapshot from {rtsp_url}: {str(e)}")
                logger.error(f"Exception details: {traceback.format_exc()}")
                continue
        
        print(f"Returning {len(snapshot_images)} snapshots from capture_video_snapshots")
        return snapshot_images

    def run(self):
        logger.info("Starting VideoAlertChecker...")
        try:
            while self.running:
                try:
                    current_time = time.time()
                    
                    # Check alert settings every 30 seconds
                    if current_time - self.last_settings_check >= self.settings_check_interval:
                        self.get_alert_settings()
                        self.get_zone_list()
                        self.get_camera_rtsp_sources()
                        self.last_settings_check = current_time

                    # 강제 종료 체크
                    if self.force_exit:
                        logger.info("Force exit requested, stopping main loop")
                        break
                    
                    #전체 시나리오를 다 체크크
                    self.scenario1_judge()
                    # self.scenario2_judge()
                    # self.scenario3_judge()
                   
                    time.sleep(self.data_check_interval)  # Sleep for 1 second to prevent CPU overuse

                except Exception as e:
                    logger.error(f"Error in main loop: {str(e)}")
                    logger.error(traceback.format_exc())
                    time.sleep(5)  # Wait 5 seconds before retrying

        except Exception as e:
            logger.error(f"Fatal error in run loop: {str(e)}")
            logger.error(traceback.format_exc())
        finally:
            self.cleanup()
            logger.info("VideoAlertChecker has been shut down")

if __name__ == "__main__":
    try:
        # 명령행 인자 파싱
        parser = argparse.ArgumentParser(description='Video Alert Checker')
        parser.add_argument('--debug', action='store_true', help='Enable debug mode with UI')
        args = parser.parse_args()
        
        alertChecker = VideoAlertChecker(debug_mode=args.debug)
        alertChecker.run()

    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt, initiating graceful shutdown...")
    except Exception as e:
        logger.error(f"Error in main: {str(e)}")
        logger.error(traceback.format_exc())
    finally:
        logger.info("Program terminated")

