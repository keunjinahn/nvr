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
        self.last_settings_check = 0
        self.last_data_check = 0
        self.settings_check_interval = 30  # 30 seconds
        self.data_check_interval = 10  # 10 seconds

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
            cursor = self.get_db_cursor()
            if not cursor:
                return False

            query = """
                SELECT alert_setting_json 
                FROM tb_alert_setting 
                WHERE id = 1
            """
            cursor.execute(query)
            result = cursor.fetchone()

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
                                self.create_alert(data['id'],data_value,idx, min_roi, int(levelItem['id']) -1)
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

    def create_alert(self, fk_video_receive_data_id, data_value, idx, min_roi, alert_level):
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

            alert_info = {
                'min_roi_key': min_roi['key'],
                'min_roi_value': min_roi['value'],
                'max_roi_key': max_roi_key,
                'max_roi_value': data_value.get(max_roi_key),
                'alert_level': alert_level,
                'check_time': datetime.now().isoformat()
            }
            print("alert_info : ", alert_info)
            query = """
                INSERT INTO tb_alert_history 
                (fk_camera_id, alert_accur_time, alert_type, alert_level, 
                alert_status, alert_info_json, fk_detect_zone_id, 
                fk_process_user_id, create_date, update_date, fk_video_receive_data_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                fk_video_receive_data_id   # fk_video_receive_data_id
            )

            cursor.execute(query, values)
            logger.info(f"Created alert for camera with level {alert_level} (ROI: {min_roi['key']} = {min_roi['value']})")

        except Exception as e:
            logger.error(f"Error creating alert: {str(e)}")
        finally:
            if cursor:
                cursor.close()

    def run(self):
        logger.info("Starting VideoAlertChecker...")
        while True:
            try:
                current_time = time.time()
                
                # Check alert settings every 30 seconds
                if current_time - self.last_settings_check >= self.settings_check_interval:
                    self.get_alert_settings()
                    self.last_settings_check = current_time

                # Check video data every 10 seconds
                if current_time - self.last_data_check >= self.data_check_interval:
                    self.check_video_data()
                    self.last_data_check = current_time
                
                time.sleep(1)  # Sleep for 1 second to prevent CPU overuse

            except KeyboardInterrupt:
                logger.info("Received keyboard interrupt, shutting down...")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {str(e)}")
                logger.error(traceback.format_exc())
                time.sleep(5)  # Wait 5 seconds before retrying

        self.disconnect_db()

if __name__ == "__main__":
    try:
        # 명령행 인자 파싱
        parser = argparse.ArgumentParser(description='Video Alert Checker')
        parser.add_argument('--debug', action='store_true', help='Enable debug mode with UI')
        args = parser.parse_args()
        
        alertChecker = VideoAlertChecker(debug_mode=args.debug)
        alertChecker.run()

    except Exception as e:
        logger.error(f"Error in main: {str(e)}")
        logger.error(traceback.format_exc())

