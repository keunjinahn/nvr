import fs from 'fs-extra';
import path from 'path';
import LoggerService from '../logger/logger.service.js';
import ConfigService from '../config/config.service.js';

const logger = new LoggerService('RecordingService');

class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // 현재 녹화 중인 카메라 맵
    this.recordingsPath = ConfigService.recordingsPath;
  }

  async startRecording(cameraName, scheduleId, recordingType) {
    try {
      if (this.activeRecordings.has(cameraName)) {
        logger.warn(`Recording already in progress for camera: ${cameraName}`);
        return false;
      }

      // 녹화 시작 시간
      const startTime = new Date();
      const recordingInfo = {
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
}

export default new RecordingService(); 