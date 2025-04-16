import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import moment from 'moment-timezone';
import Database from '../../api/database.js';
import LoggerService from '../logger/logger.service.js';
import ConfigService from '../config/config.service.js';
import { nanoid } from 'nanoid';

const logger = new LoggerService('RecordingProcess');

class RecordingProcess {
  constructor() {
    this.activeRecordings = new Map(); // key: `${cameraName}_${scheduleId}`
    this.checkInterval = null;
    this.recordingsPath = ConfigService.recordingsPath;
    this.lastRetryTimes = new Map();
  }

  isTimeInRange(currentTime, startTime, endTime) {
    const [currentHour, currentMinute] = currentTime.split(':');
    const [startHour, startMinute] = startTime.split(':');
    const [endHour, endMinute] = endTime.split(':');

    const current = parseInt(currentHour) * 60 + parseInt(currentMinute);
    const start = parseInt(startHour) * 60 + parseInt(startMinute);
    const end = parseInt(endHour) * 60 + parseInt(endMinute);

    return current >= start && current < end;
  }

  async getCurrentlyActiveSchedules() {
    try {
      const schedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value() || [];
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      // 오늘 날짜의 녹화 히스토리 확인
      const todayStr = moment().tz('Asia/Seoul').format('YYYY-MM-DD');
      const recordingHistory = await Database.interfaceDB.chain.get('recordingHistory').cloneDeep().value() || [];

      const todayCompletedRecordings = recordingHistory.filter(record => {
        const recordDate = record.startTime.split('T')[0];
        return recordDate === todayStr &&
          ['completed', 'stopped'].includes(record.status);
      });

      return schedules.filter(schedule => {
        // 기본 스케줄 조건 확인
        const isScheduleActive = schedule.isActive &&
          schedule.days_of_week.includes(currentDay) &&
          this.isTimeInRange(currentTime, schedule.start_time, schedule.end_time);

        if (!isScheduleActive) return false;

        // 이미 완료된 녹화가 있는지 확인
        const hasCompletedRecording = todayCompletedRecordings.some(record =>
          record.scheduleId === schedule.id &&
          record.cameraName === schedule.cameraName
        );

        // 활성화된 스케줄이지만 이미 완료된 녹화가 있으면 제외
        return !hasCompletedRecording;
      });
    } catch (error) {
      logger.error('Error getting active schedules:', error);
      return [];
    }
  }

  async addRecordingHistory(scheduleId, cameraName, timeInfo, filename) {
    try {
      // 트랜잭션 시작 - 데이터베이스 락 획득
      const recordingHistory = await Database.interfaceDB.chain.get('recordingHistory').cloneDeep().value() || [];

      // 동일한 파일명으로 진행 중인 녹화가 있는지 확인
      const existingRecordings = recordingHistory.filter(record =>
        record.filename === filename ||
        (record.scheduleId === scheduleId &&
          record.cameraName === cameraName &&
          record.status === 'recording')
      );

      // 기존 녹화들의 상태를 'stopped'로 업데이트
      for (const existing of existingRecordings) {
        logger.info(`Marking existing recording as stopped: ${existing.id}`);
        existing.status = 'stopped';
        existing.endTime = timeInfo.formattedForFile;
        existing.updatedAt = timeInfo.formattedForFile;
      }

      const newRecord = {
        id: nanoid(),
        scheduleId,
        cameraName,
        filename,
        startTime: timeInfo.formattedForFile,
        endTime: null,
        status: 'recording',
        createdAt: timeInfo.formattedForFile
      };

      // 기존 녹화 업데이트와 새 녹화 추가를 한 번에 수행
      const updatedHistory = [
        ...recordingHistory.filter(r => !existingRecordings.find(e => e.id === r.id)),
        ...existingRecordings,
        newRecord
      ];

      // 데이터베이스 업데이트를 한 번에 수행
      await Database.interfaceDB.chain.set('recordingHistory', updatedHistory).value();
      await Database.interfaceDB.write();

      logger.info('Recording history updated:', {
        newRecordId: newRecord.id,
        stoppedRecords: existingRecordings.map(r => r.id),
        filename,
        cameraName
      });

      return newRecord.id;
    } catch (error) {
      logger.error('Error in addRecordingHistory:', error);
      throw error;
    }
  }

  async updateRecordingHistory(recordingId, updates) {
    try {
      const recordingHistory = await Database.interfaceDB.chain.get('recordingHistory').cloneDeep().value() || [];
      const recordIndex = recordingHistory.findIndex(r => r.id === recordingId);

      if (recordIndex === -1) {
        logger.warn(`Recording history not found for ID: ${recordingId}`);
        return;
      }

      const currentRecord = recordingHistory[recordIndex];

      // 이미 종료된 녹화는 업데이트하지 않음
      if (['completed', 'stopped', 'error'].includes(currentRecord.status) && updates.status === 'recording') {
        logger.warn(`Skipping update for already finished recording: ${recordingId}`);
        return;
      }

      recordingHistory[recordIndex] = {
        ...currentRecord,
        ...updates,
        updatedAt: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss')
      };

      await Database.interfaceDB.chain.set('recordingHistory', recordingHistory).value();
      await Database.interfaceDB.write();

      logger.info('Recording history updated:', {
        id: recordingId,
        previousStatus: currentRecord.status,
        newStatus: updates.status,
        updates
      });
    } catch (error) {
      logger.error('Error in updateRecordingHistory:', error);
    }
  }

  async startRecording(cameraName, scheduleId, source) {
    const recordingKey = `${cameraName}_${scheduleId}`;
    let recordingId = null;

    try {
      // 이미 녹화 중인지 확인
      const existingRecording = this.activeRecordings.get(recordingKey);
      if (existingRecording) {
        if (existingRecording.process && !existingRecording.process.killed) {
          logger.debug(`Recording already in progress for schedule: ${recordingKey}, skipping...`);
          return;
        }
        await this.stopRecording(cameraName, scheduleId);
      }

      // 시간 정보 생성 (한국 시간 기준)
      const nowMoment = moment().tz('Asia/Seoul');
      const timeInfo = {
        timestamp: nowMoment.unix(),
        formattedForFile: nowMoment.format('YYYY-MM-DDTHH-mm-ss'),
        formattedForDisplay: nowMoment.format('YYYY-MM-DDTHH:mm:ss'),
        dateString: nowMoment.format('YYYY-MM-DD')
      };

      // 녹화 디렉토리 생성
      const recordingDir = path.join(
        this.recordingsPath,
        cameraName,
        timeInfo.dateString
      );
      await fs.ensureDir(recordingDir);

      // 파일명 생성
      const filename = `${cameraName}_${timeInfo.formattedForFile}.mp4`;
      const outputPath = path.join(recordingDir, filename);

      // 기존 파일 확인 및 제거
      if (await fs.pathExists(outputPath)) {
        try {
          await fs.unlink(outputPath);
          logger.info(`Removed existing recording file: ${outputPath}`);
        } catch (err) {
          logger.error(`Failed to remove existing recording file: ${err.message}`);
        }
      }

      // recordingHistory에 추가 - 한 번만 수행
      try {
        recordingId = await this.addRecordingHistory(scheduleId, cameraName, timeInfo, filename);
      } catch (error) {
        logger.error('Failed to add recording history:', error);
        return;
      }

      // source URL에서 -i 옵션 제거
      let rtspUrl = source;
      if (rtspUrl.includes('-i')) {
        rtspUrl = rtspUrl.replace(/-i\s+/, '').trim();
      }

      // FFMPEG 프로세스 시작
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-rtsp_transport', 'tcp',
        '-i', rtspUrl,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-profile:v', 'baseline',
        '-level', '3.0',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-g', '30',
        '-keyint_min', '30',
        '-force_key_frames', 'expr:gte(t,n_forced*1)',
        '-b:v', '2000k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-strict', '-2',
        '-f', 'mp4',
        '-movflags', '+faststart+frag_keyframe+empty_moov+default_base_moof',
        '-reset_timestamps', '1',
        '-loglevel', 'warning',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        outputPath
      ], {
        windowsHide: true,
        windowsVerbatimArguments: true,
        env: { ...process.env, FFREPORT: `file=${recordingDir}/ffmpeg-${recordingKey}.log:level=32` }
      });

      let hasError = false;
      let errorMessage = '';

      // FFMPEG 에러 로그 처리
      ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();
        logger.debug(`FFMPEG [${recordingKey}]: ${message}`);

        // 주요 에러 체크
        if (message.includes('Connection refused') ||
          message.includes('Connection timed out') ||
          message.includes('Invalid data found') ||
          message.includes('Error opening input') ||
          message.includes('Broken pipe') ||
          message.includes('End of file')) {
          hasError = true;
          errorMessage = message;
          logger.error(`FFMPEG Error for schedule ${recordingKey}:`, message);
        }
      });

      // 프로세스 종료 처리
      ffmpeg.on('close', async (code) => {
        logger.info(`Recording stopped for schedule: ${recordingKey}, exit code: ${code}`);

        // 파일 크기 확인
        try {
          const stats = await fs.stat(outputPath);
          if (stats.size === 0) {
            logger.error(`Empty recording file detected for schedule: ${recordingKey}`);
            await fs.unlink(outputPath);
            // 녹화 히스토리 업데이트 - 에러 상태로
            if (recordingId) {
              await this.updateRecordingHistory(recordingId, {
                endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss'),
                status: 'error',
                errorMessage: 'Empty recording file'
              });
            }
          } else {
            // 정상 종료 시 녹화 히스토리 업데이트
            if (recordingId) {
              await this.updateRecordingHistory(recordingId, {
                endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss'),
                status: hasError ? 'error' : 'completed',
                errorMessage: hasError ? errorMessage : undefined
              });
            }
          }
        } catch (err) {
          logger.error(`Error checking recording file: ${err.message}`);
          if (recordingId) {
            await this.updateRecordingHistory(recordingId, {
              endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss'),
              status: 'error',
              errorMessage: err.message
            });
          }
        }

        this.activeRecordings.delete(recordingKey);

        // 비정상 종료 시 재시도
        if (code !== 0 && !hasError) {
          const lastRetryTime = this.lastRetryTimes.get(recordingKey) || 0;
          const now = Date.now();
          if (now - lastRetryTime > 60000) {
            logger.warn(`Abnormal exit for schedule ${recordingKey}, attempting to restart...`);
            this.lastRetryTimes.set(recordingKey, now);
            // 재시도 시에는 새로운 recordingHistory 생성
            setTimeout(() => {
              this.startRecording(cameraName, scheduleId, source);
            }, 5000);
          } else {
            logger.warn(`Skipping retry for ${recordingKey} due to frequent failures`);
          }
        }
      });

      // 프로세스 에러 처리
      ffmpeg.on('error', async (err) => {
        logger.error(`FFMPEG process error for schedule ${recordingKey}:`, err);
        hasError = true;
        if (recordingId) {
          await this.updateRecordingHistory(recordingId, {
            status: 'error',
            errorMessage: err.message
          });
        }
      });

      // 녹화 정보 저장
      const recordingInfo = {
        recordingId,
        cameraName,
        scheduleId,
        process: ffmpeg,
        timeInfo,
        outputPath,
        hasError: false,
        pid: ffmpeg.pid,
        startTime: Date.now()
      };

      this.activeRecordings.set(recordingKey, recordingInfo);

      // 녹화 메타데이터 저장
      const metadataPath = path.join(recordingDir, `${filename}.json`);
      await fs.writeJson(metadataPath, {
        recordingId,
        scheduleId,
        cameraName,
        startTime: timeInfo.formattedForFile,
        filename,
        outputPath,
        rtspUrl,
        status: 'recording'
      });

    } catch (error) {
      logger.error(`Failed to start recording for schedule: ${recordingKey}`, error);
      // 시작 실패 시 히스토리 업데이트
      if (recordingId) {
        await this.updateRecordingHistory(recordingId, {
          endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss'),
          status: 'error',
          errorMessage: error.message
        });
      }
      this.activeRecordings.delete(recordingKey);
    }
  }

  async stopRecording(cameraName, scheduleId) {
    try {
      const recordingKey = `${cameraName}_${scheduleId}`;
      const recordingInfo = this.activeRecordings.get(recordingKey);
      if (!recordingInfo) {
        return;
      }

      // FFMPEG 프로세스 종료
      if (recordingInfo.process && !recordingInfo.process.killed) {
        try {
          recordingInfo.process.kill('SIGTERM');
          // 5초 후에도 종료되지 않으면 강제 종료
          setTimeout(() => {
            try {
              if (!recordingInfo.process.killed) {
                recordingInfo.process.kill('SIGKILL');
              }
            } catch (e) {
              logger.debug(`Process already terminated: ${e.message}`);
            }
          }, 5000);
        } catch (e) {
          logger.error(`Error killing process: ${e.message}`);
        }
      }

      // recordingHistory 업데이트
      if (recordingInfo.recordingId) {
        const endTime = moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss');
        await this.updateRecordingHistory(recordingInfo.recordingId, {
          endTime,
          status: recordingInfo.hasError ? 'error' : 'stopped'
        });
      }

      // 메타데이터 업데이트
      const metadataPath = `${recordingInfo.outputPath}.json`;
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        metadata.endTime = moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH-mm-ss');
        metadata.status = recordingInfo.hasError ? 'error' : 'stopped';
        await fs.writeJson(metadataPath, metadata);
      }

      this.activeRecordings.delete(recordingKey);
      logger.info(`Stopped recording for schedule: ${recordingKey}`);

    } catch (error) {
      logger.error(`Failed to stop recording for schedule: ${cameraName}_${scheduleId}`, error);
      this.activeRecordings.delete(`${cameraName}_${scheduleId}`);
    }
  }

  async checkAndUpdateRecordings() {
    try {
      const activeSchedules = await this.getCurrentlyActiveSchedules();

      // 현재 활성화된 스케줄의 카메라와 스케줄ID를 맵으로 관리
      const activeScheduleMap = new Map();
      activeSchedules.forEach(schedule => {
        const scheduleKey = `${schedule.cameraName}_${schedule.id}`;
        activeScheduleMap.set(scheduleKey, schedule);
      });

      // 현재 녹화 중인 프로세스 확인 및 중지
      for (const [recordingKey, recordingInfo] of this.activeRecordings) {
        // 해당 스케줄이 더 이상 활성화되지 않은 경우 녹화 중지
        if (!activeScheduleMap.has(recordingKey)) {
          logger.info(`Stopping recording for inactive schedule: ${recordingKey}`);
          await this.stopRecording(recordingInfo.cameraName, recordingInfo.scheduleId);
        }
      }

      // 새로운 녹화 시작
      for (const schedule of activeSchedules) {
        const scheduleKey = `${schedule.cameraName}_${schedule.id}`;

        // 이미 녹화 중인 경우 스킵
        if (this.activeRecordings.has(scheduleKey)) {
          continue;
        }

        // 오늘 이미 완료된 녹화가 있는지 다시 한번 확인
        const todayStr = moment().tz('Asia/Seoul').format('YYYY-MM-DD');
        const recordingHistory = await Database.interfaceDB.chain.get('recordingHistory').cloneDeep().value() || [];
        const hasCompletedToday = recordingHistory.some(record =>
          record.scheduleId === schedule.id &&
          record.cameraName === schedule.cameraName &&
          record.startTime.startsWith(todayStr) &&
          ['completed', 'stopped'].includes(record.status)
        );

        if (hasCompletedToday) {
          logger.info(`Skipping recording for schedule ${scheduleKey} as it was already completed today`);
          continue;
        }

        logger.info(`Starting new recording for schedule: ${scheduleKey}`);
        await this.startRecording(schedule.cameraName, schedule.id, schedule.source);
      }

    } catch (error) {
      logger.error('Error in checkAndUpdateRecordings:', error);
    }
  }

  start() {
    if (this.checkInterval) {
      this.stop();
    }

    // 체크 주기를 30초로 증가
    this.checkInterval = setInterval(() => {
      this.checkAndUpdateRecordings();
    }, 30000);

    logger.info('Recording process started, checking schedules every 30 seconds');
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;

      // 모든 녹화 중지
      for (const [recordingKey, recordingInfo] of this.activeRecordings) {
        this.stopRecording(recordingInfo.cameraName, recordingInfo.scheduleId);
      }

      logger.info('Recording process stopped');
    }
  }
}

export default new RecordingProcess(); 