import fs from 'fs';
import path from 'path';
import EventSettingModel from '../../models/EventSetting.js';
import sequelize from '../../models/index.js';
import LoggerService from '../logger/logger.service.js';

const EventSetting = EventSettingModel(sequelize);
const logger = new LoggerService('RecordingCleanup');

class RecordingCleanupService {
  constructor() {
    logger.info('='.repeat(60));
    logger.info('RecordingCleanupService 인스턴스 생성 시작');
    logger.info('='.repeat(60));

    this.cleanupInterval = null;
    this.recordingsPath = path.join(process.cwd(), 'outputs', 'nvr', 'recordings');
    this.defaultDeleteDays = 30; // 기본값: 30일
    this.lastCleanupTime = null; // 마지막 정리 실행 시간
    this.cleanupCount = 0; // 정리 실행 횟수
    this.isPerformingCleanup = false; // 현재 정리 작업 수행 중 여부
    this.autoStartEnabled = false; // 자동 시작 여부
    this.instanceCreatedAt = new Date(); // 인스턴스 생성 시간
    this.isStarted = false; // 서비스 시작 여부

    logger.info(`RecordingCleanupService 인스턴스 생성 완료`);
    logger.info(`- Recordings Path: ${this.recordingsPath}`);
    logger.info(`- Default Delete Days: ${this.defaultDeleteDays}`);
    logger.info(`- Instance Created At: ${this.instanceCreatedAt.toISOString()}`);
    logger.info('='.repeat(60));
    logger.info('서버 시작 시 자동으로 시작됩니다 (startOnServerReady 호출 필요)');
    logger.info('='.repeat(60));
  }

  /**
   * 서버 시작 시 호출되는 메서드 (내부 서비스로 동작)
   */
  startOnServerReady() {
    if (this.isStarted) {
      logger.warn('RecordingCleanupService는 이미 시작되었습니다.');
      return;
    }

    try {
      logger.info('='.repeat(60));
      logger.info('RecordingCleanupService 서버 시작 시 자동 시작');
      logger.info('='.repeat(60));

      this.startCleanup(24); // 24시간 간격으로 자동 실행
      this.autoStartEnabled = true;
      this.isStarted = true;

      logger.info('='.repeat(60));
      logger.info('RecordingCleanupService 자동 시작 성공');
      logger.info(`- Auto Start Enabled: ${this.autoStartEnabled}`);
      logger.info(`- Is Started: ${this.isStarted}`);
      logger.info(`- Cleanup Interval: 24 hours`);
      logger.info(`- Next cleanup will run in 24 hours`);
      logger.info('='.repeat(60));
    } catch (error) {
      logger.error('='.repeat(60));
      logger.error('RecordingCleanupService 자동 시작 실패');
      logger.error(`Error: ${error.message}`);
      logger.error(error.stack);
      logger.error('='.repeat(60));
    }
  }

  /**
   * EventSetting 테이블에서 object_json을 파싱하여 recodingFileDeleteDays 값을 가져옴
   */
  async getDeleteDaysFromSettings() {
    try {
      const eventSetting = await EventSetting.findOne({
        where: { id: 1 }, // 기본 설정 레코드
        attributes: ['object_json']
      });

      if (eventSetting && eventSetting.object_json) {
        const objectConfig = JSON.parse(eventSetting.object_json);
        const recordingConfig = objectConfig.recording || {};
        return recordingConfig.recodingFileDeleteDays || this.defaultDeleteDays;
      }

      return this.defaultDeleteDays;
    } catch (error) {
      logger.error('Error getting delete days from settings:', error);
      return this.defaultDeleteDays;
    }
  }

  /**
   * 파일의 생성 시간을 확인
   */
  getFileCreationTime(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.birthtime || stats.mtime;
    } catch (error) {
      logger.error(`Error getting file creation time for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 파일이 삭제 대상인지 확인
   */
  isFileExpired(filePath, deleteDays) {
    const creationTime = this.getFileCreationTime(filePath);
    if (!creationTime) return false;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - deleteDays);
    return creationTime < cutoffDate;
  }

  /**
   * 파일과 관련 JSON 파일을 삭제
   */
  deleteFileAndMetadata(filePath) {
    try {
      // 메인 파일 삭제
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted file: ${filePath}`);
      }

      // 관련 JSON 파일 삭제
      const jsonPath = filePath.replace(/\.(mp4|avi|mov)$/, '.json');
      if (fs.existsSync(jsonPath)) {
        fs.unlinkSync(jsonPath);
        logger.info(`Deleted metadata file: ${jsonPath}`);
      }

      return true;
    } catch (error) {
      logger.error(`Error deleting file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * 디렉토리 내의 모든 파일을 재귀적으로 검사하고 삭제
   */
  async cleanupDirectory(dirPath, deleteDays) {
    try {
      if (!fs.existsSync(dirPath)) {
        return;
      }

      const items = fs.readdirSync(dirPath);
      let deletedCount = 0;

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          // 디렉토리인 경우 재귀적으로 처리
          const subDeletedCount = await this.cleanupDirectory(itemPath, deleteDays);
          deletedCount += subDeletedCount;

          // 디렉토리가 비어있으면 삭제
          const remainingItems = fs.readdirSync(itemPath);
          if (remainingItems.length === 0) {
            fs.rmdirSync(itemPath);
            logger.info(`Deleted empty directory: ${itemPath}`);
          }
        } else if (stats.isFile()) {
          // 파일인 경우 삭제 대상인지 확인
          const isVideoFile = /\.(mp4|avi|mov)$/i.test(item);
          if (isVideoFile && this.isFileExpired(itemPath, deleteDays)) {
            if (this.deleteFileAndMetadata(itemPath)) {
              deletedCount++;
            }
          }
        }
      }

      return deletedCount;
    } catch (error) {
      logger.error(`Error cleaning up directory ${dirPath}:`, error);
      return 0;
    }
  }

  /**
   * 메인 정리 프로세스
   */
  async performCleanup() {
    // 이미 실행 중이면 중복 실행 방지
    if (this.isPerformingCleanup) {
      logger.warn('Cleanup is already in progress, skipping this execution');
      return {
        success: false,
        error: 'Cleanup is already in progress',
        timestamp: new Date().toISOString()
      };
    }

    this.isPerformingCleanup = true;
    const startTime = new Date();

    try {
      logger.info('='.repeat(50));
      logger.info('Starting recording file cleanup process...');
      logger.info(`Cleanup execution #${this.cleanupCount + 1}`);
      logger.info(`Start time: ${startTime.toISOString()}`);

      // 설정에서 삭제 일수 가져오기
      const deleteDays = await this.getDeleteDaysFromSettings();
      logger.info(`Using delete days: ${deleteDays} days`);

      // 녹화 디렉토리 정리
      const deletedCount = await this.cleanupDirectory(this.recordingsPath, deleteDays);

      const endTime = new Date();
      const duration = (endTime - startTime) / 1000; // 초 단위

      this.lastCleanupTime = endTime;
      this.cleanupCount++;

      logger.info(`Cleanup completed. Deleted ${deletedCount} files.`);
      logger.info(`Duration: ${duration.toFixed(2)} seconds`);
      logger.info(`End time: ${endTime.toISOString()}`);
      logger.info('='.repeat(50));

      return {
        success: true,
        deletedCount,
        deleteDays,
        duration: duration,
        timestamp: endTime.toISOString()
      };
    } catch (error) {
      const endTime = new Date();
      logger.error('Error in cleanup process:', error);
      logger.error(`Error occurred at: ${endTime.toISOString()}`);
      logger.error('='.repeat(50));
      return {
        success: false,
        error: error.message,
        timestamp: endTime.toISOString()
      };
    } finally {
      this.isPerformingCleanup = false;
    }
  }

  /**
   * 정기적인 정리 작업 시작
   */
  startCleanup(intervalHours = 24) {
    logger.info(`[startCleanup] 호출됨 - intervalHours: ${intervalHours}`);

    if (this.cleanupInterval) {
      logger.warn('Cleanup service is already running, stopping previous instance...');
      this.stopCleanup();
    }

    logger.info(`[startCleanup] Recording cleanup service 시작 중... (간격: ${intervalHours}시간)`);

    // 즉시 한 번 실행
    logger.info(`[startCleanup] 초기 cleanup 실행 시작...`);
    this.performCleanup().catch(err => {
      logger.error('[startCleanup] 초기 cleanup 실행 오류:', err);
    });

    // 정기적으로 실행
    this.cleanupInterval = setInterval(async () => {
      logger.info(`[Scheduled] 정기 cleanup 실행 (간격: ${intervalHours}시간)`);
      await this.performCleanup();
    }, intervalHours * 60 * 60 * 1000);

    logger.info(`[startCleanup] Recording cleanup service 시작 완료`);
    logger.info(`[startCleanup] 다음 cleanup 실행: ${intervalHours}시간 후`);
    logger.info(`[startCleanup] Interval ID: ${this.cleanupInterval ? '설정됨' : '설정 안됨'}`);
  }

  /**
   * 정리 작업 중지
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Recording cleanup service stopped');
    }
  }

  /**
   * 수동으로 정리 작업 실행
   */
  async manualCleanup() {
    logger.info('Manual cleanup requested');
    return await this.performCleanup();
  }

  /**
   * 현재 설정 정보 반환
   */
  async getCleanupInfo() {
    const deleteDays = await this.getDeleteDaysFromSettings();
    const info = {
      deleteDays,
      recordingsPath: this.recordingsPath,
      isRunning: !!this.cleanupInterval,
      isPerformingCleanup: this.isPerformingCleanup,
      autoStartEnabled: this.autoStartEnabled,
      instanceCreatedAt: this.instanceCreatedAt ? this.instanceCreatedAt.toISOString() : null,
      lastCleanupTime: this.lastCleanupTime ? this.lastCleanupTime.toISOString() : null,
      cleanupCount: this.cleanupCount,
      hasInterval: !!this.cleanupInterval,
      lastCheck: new Date().toISOString()
    };

    logger.info('[getCleanupInfo] 서비스 상태 조회:');
    logger.info(`  - isRunning: ${info.isRunning}`);
    logger.info(`  - autoStartEnabled: ${info.autoStartEnabled}`);
    logger.info(`  - cleanupCount: ${info.cleanupCount}`);
    logger.info(`  - hasInterval: ${info.hasInterval}`);
    logger.info(`  - lastCleanupTime: ${info.lastCleanupTime || '없음'}`);

    return info;
  }
}

// 인스턴스 생성 및 로그 출력
logger.info('='.repeat(60));
logger.info('RecordingCleanupService 모듈 로드 완료');
logger.info('인스턴스 생성 중...');
logger.info('='.repeat(60));

const recordingCleanupService = new RecordingCleanupService();

logger.info('='.repeat(60));
logger.info('RecordingCleanupService 인스턴스 export 완료');
logger.info('='.repeat(60));

export default recordingCleanupService; 