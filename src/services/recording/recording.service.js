import fs from 'fs-extra';
import path from 'path';
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
    try {
      const recordingHistory = await Database.interfaceDB.chain.get('recordingHistory').cloneDeep().value() || [];

      const newRecord = {
        id: Date.now(), // 고유 ID 생성
        scheduleId,
        cameraName,
        filename,
        startTime,
        endTime: null,
        status: 'recording' // recording, completed, error
      };

      recordingHistory.push(newRecord);
      await Database.interfaceDB.chain.set('recordingHistory', recordingHistory).value();
      await Database.interfaceDB.write();

      logger.info('Recording history added:', newRecord);
      return newRecord.id;
    } catch (error) {
      logger.error('Error adding recording history:', error);
      throw error;
    }
  }

  async updateRecordingHistory(recordingId, updates) {
    try {
      const recordingHistory = await Database.interfaceDB.chain.get('recordingHistory').cloneDeep().value() || [];
      const recordIndex = recordingHistory.findIndex(r => r.id === recordingId);

      if (recordIndex === -1) {
        throw new Error('Recording history not found');
      }

      recordingHistory[recordIndex] = {
        ...recordingHistory[recordIndex],
        ...updates
      };

      await Database.interfaceDB.chain.set('recordingHistory', recordingHistory).value();
      await Database.interfaceDB.write();

      logger.info('Recording history updated:', recordingHistory[recordIndex]);
    } catch (error) {
      logger.error('Error updating recording history:', error);
      throw error;
    }
  }

  async startRecording(cameraName, scheduleId, recordingType) {
    try {
      if (this.activeRecordings.has(cameraName)) {
        logger.warn(`Recording already in progress for camera: ${cameraName}`);
        return false;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${cameraName}_${timestamp}.mp4`;
      const recordingPath = path.join(this.recordingsPath, cameraName, filename);

      // 녹화 시작 시 기록 추가
      const recordingId = await this.addRecordingHistory(
        scheduleId,
        cameraName,
        new Date().toISOString(),
        filename
      );

      // 녹화 시작 시간
      const startTime = new Date();
      const recordingInfo = {
        recordingId,
        scheduleId,
        startTime,
        recordingType,
        status: 'recording'
      };

      // 녹화 폴더 생성
      const recordingDir = path.join(
        this.recordingsPath,
        cameraName,
        startTime.toISOString().split('T')[0]
      );
      await fs.ensureDir(recordingDir);

      // 녹화 정보 파일 생성
      const infoFile = path.join(recordingDir, 'recording_info.json');
      await fs.writeJson(infoFile, {
        ...recordingInfo,
        recordingDir
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
      recordingInfo.endTime = new Date();

      // 녹화 정보 파일 업데이트
      const recordingDir = path.join(
        this.recordingsPath,
        cameraName,
        recordingInfo.startTime.toISOString().split('T')[0]
      );
      const infoFile = path.join(recordingDir, 'recording_info.json');

      if (await fs.pathExists(infoFile)) {
        await fs.writeJson(infoFile, {
          ...recordingInfo,
          recordingDir
        });
      }

      // 녹화 종료 시 기록 업데이트
      await this.updateRecordingHistory(recordingInfo.recordingId, {
        endTime: recordingInfo.endTime.toISOString(),
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

      return recordingHistory;
    } catch (error) {
      logger.error('Error getting recording history:', error);
      throw error;
    }
  }
}

export default new RecordingService(); 