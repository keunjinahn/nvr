import fs from 'fs-extra';
import path from 'path';
import moment from 'moment-timezone';
import LoggerService from '../logger/logger.service.js';
import ConfigService from '../config/config.service.js';
import Database from '../../api/database.js';

const logger = new LoggerService('RecordingService');

export class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // 현재 녹화 중인 카메라 맵
    this.recordingsPath = ConfigService.recordingsPath;
  }

  async addRecordingHistory(scheduleId, cameraName, startTime, filename) {
    logger.warn('Recording history is now managed by RecordingProcess');
    return null;
  }

  async updateRecordingHistory(recordingId, updates) {
    logger.warn('Recording history is now managed by RecordingProcess');
    return null;
  }

  async startRecording(cameraName, scheduleId, recordingType) {
    try {
      if (this.activeRecordings.has(cameraName)) {
        logger.warn(`Recording already in progress for camera: ${cameraName}`);
        return false;
      }

      // 한국 시간 기준으로 시간 정보 생성
      const nowMoment = moment().tz('Asia/Seoul');
      const timestamp = nowMoment.format('YYYY-MM-DDTHH-mm-ss');
      const filename = `${cameraName}_${timestamp}.mp4`;
      const recordingPath = path.join(this.recordingsPath, cameraName, filename);

      // 녹화 시작 시 기록 추가 (한국 시간 사용)
      const recordingId = await this.addRecordingHistory(
        scheduleId,
        cameraName,
        timestamp,
        filename
      );

      // 녹화 시작 시간 (한국 시간)
      const startTime = nowMoment.toDate();
      const recordingInfo = {
        recordingId,
        scheduleId,
        startTime,
        recordingType,
        status: 'recording'
      };

      // 녹화 폴더 생성 (한국 시간 기준 날짜)
      const recordingDir = path.join(
        this.recordingsPath,
        cameraName,
        nowMoment.format('YYYY-MM-DD')
      );
      await fs.ensureDir(recordingDir);

      // 녹화 정보 파일 생성
      const infoFile = path.join(recordingDir, 'recording_info.json');
      await fs.writeJson(infoFile, {
        ...recordingInfo,
        recordingDir,
        timestamp: timestamp
      });

      this.activeRecordings.set(cameraName, recordingInfo);
      logger.info(`Started recording for camera: ${cameraName}`, recordingInfo);

      return true;
    } catch (error) {
      logger.error(`Failed to start recording for camera: ${cameraName}`, error);
      return false;
    }
  }

  async stopRecording(cameraName) {
    try {
      if (!this.activeRecordings.has(cameraName)) {
        logger.warn(`No active recording found for camera: ${cameraName}`);
        return false;
      }

      const recordingInfo = this.activeRecordings.get(cameraName);
      recordingInfo.status = 'stopped';

      // 종료 시간도 한국 시간으로 설정
      const endTimeMoment = moment().tz('Asia/Seoul');
      recordingInfo.endTime = endTimeMoment.toDate();

      // 녹화 정보 파일 업데이트
      const recordingDir = path.join(
        this.recordingsPath,
        cameraName,
        moment(recordingInfo.startTime).tz('Asia/Seoul').format('YYYY-MM-DD')
      );
      const infoFile = path.join(recordingDir, 'recording_info.json');

      if (await fs.pathExists(infoFile)) {
        await fs.writeJson(infoFile, {
          ...recordingInfo,
          recordingDir,
          endTimestamp: endTimeMoment.format('YYYY-MM-DDTHH-mm-ss')
        });
      }

      // 녹화 종료 시 기록 업데이트 (한국 시간 사용)
      await this.updateRecordingHistory(recordingInfo.recordingId, {
        endTime: endTimeMoment.format('YYYY-MM-DDTHH-mm-ss'),
        status: 'completed'
      });

      this.activeRecordings.delete(cameraName);
      logger.info(`Stopped recording for camera: ${cameraName}`, recordingInfo);

      return true;
    } catch (error) {
      logger.error(`Failed to stop recording for camera: ${cameraName}`, error);
      return false;
    }
  }

  isRecording(cameraName) {
    return this.activeRecordings.has(cameraName);
  }

  getActiveRecordings() {
    return Array.from(this.activeRecordings.entries()).map(([cameraName, info]) => ({
      cameraName,
      ...info
    }));
  }

  async getRecordingStatus(cameraName) {
    if (this.activeRecordings.has(cameraName)) {
      return {
        isRecording: true,
        ...this.activeRecordings.get(cameraName)
      };
    }

    return {
      isRecording: false,
      status: 'stopped'
    };
  }

  async getRecordingHistory(filters = {}) {
    try {
      let recordingHistory = await Database.interfaceDB.chain.get('recordingHistory').cloneDeep().value() || [];

      // 필터 적용
      if (filters.cameraName) {
        recordingHistory = recordingHistory.filter(r => r.cameraName === filters.cameraName);
      }
      if (filters.scheduleId) {
        recordingHistory = recordingHistory.filter(r => r.scheduleId === filters.scheduleId);
      }
      if (filters.status) {
        recordingHistory = recordingHistory.filter(r => r.status === filters.status);
      }

      // 결과가 비어있는 경우 빈 배열 반환
      if (!recordingHistory || recordingHistory.length === 0) {
        return [];
      }

      // 시간 정보 포맷팅
      const formattedHistory = recordingHistory.map(record => ({
        ...record,
        startTime: record.startTime ? moment(record.startTime).tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss') : null,
        endTime: record.endTime ? moment(record.endTime).tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss') : null
      }));

      // 최신 기록이 먼저 오도록 정렬
      formattedHistory.sort((a, b) => b.id - a.id);

      return formattedHistory;
    } catch (error) {
      logger.error('Error getting recording history:', error);
      return []; // 에러 발생 시 빈 배열 반환
    }
  }
}

export default new RecordingService(); 