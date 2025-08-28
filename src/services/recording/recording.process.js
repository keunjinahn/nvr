import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import moment from 'moment-timezone';
import Database from '../../api/database.js';
import LoggerService from '../logger/logger.service.js';
import ConfigService from '../config/config.service.js';
import { nanoid } from 'nanoid';
import ScheduleModel from '../../models/schedule.js';
import RecordingHistoryModel from '../../models/RecordingHistory.js';
import sequelize from '../../models/index.js';
import { Op } from 'sequelize';
const Schedule = ScheduleModel(sequelize);
const RecordingHistory = RecordingHistoryModel(sequelize);

const logger = new LoggerService('RecordingProcess');

class RecordingProcess {
  constructor() {
    this.activeRecordings = new Map(); // key: `${cameraName}_${scheduleId}`
    this.checkInterval = null;
    this.recordingsPath = ConfigService.recordingsPath;
    this.lastRetryTimes = new Map();
    this.cameraNameToIndex = new Map(); // 카메라명을 인덱스로 매핑
    this.cameraIndexCounter = 1; // 카메라 인덱스 카운터
  }

  // 카메라명을 안전한 파일명으로 변환 (한글 → 인덱스, 공백 제거)
  getSafeFileName(cameraName) {
    if (!this.cameraNameToIndex.has(cameraName)) {
      this.cameraNameToIndex.set(cameraName, this.cameraIndexCounter++);
      logger.info(`Camera name mapping: "${cameraName}" → camera_${this.cameraIndexCounter - 1}`);
    }
    const index = this.cameraNameToIndex.get(cameraName);
    return `camera_${index}`;
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
      const schedules = await Schedule.findAll({
        where: {
          isActive: true
        }
      });

      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      // 오늘 날짜의 녹화 히스토리 확인 (LIKE → 범위 조건)
      const today = moment().tz('Asia/Seoul').startOf('day');
      const tomorrow = moment(today).add(1, 'days');
      const recordingHistory = await RecordingHistory.findAll({
        where: {
          startTime: {
            [Op.gte]: today.toDate(),
            [Op.lt]: tomorrow.toDate()
          },
          status: {
            [Op.in]: ['completed', 'stopped']
          }
        }
      });

      return schedules.filter(schedule => {
        // 기본 스케줄 조건 확인
        const isScheduleActive = schedule.isActive &&
          schedule.days_of_week.includes(currentDay) &&
          this.isTimeInRange(currentTime, schedule.start_time, schedule.end_time);

        if (!isScheduleActive) return false;

        // 이미 완료된 녹화가 있는지 확인 (진행중인 녹화는 제외)
        const hasCompletedRecording = recordingHistory.some(record =>
          record.scheduleId === schedule.id &&
          record.cameraName === schedule.cameraName &&
          (record.status === 'completed' || record.status === 'stopped')
        );

        // 활성화된 스케줄이지만 이미 완료된 녹화가 있으면 제외
        return !hasCompletedRecording;
      });
    } catch (error) {
      logger.error('Error getting active schedules:', error);
      return [];
    }
  }

  async addRecordingHistory(scheduleId, cameraName, timeInfo, filename, fk_camera_id) {
    try {
      // 동일한 파일명으로 진행 중인 녹화가 있는지 확인
      const existingRecordings = await RecordingHistory.findAll({
        where: {
          [Op.or]: [
            { filename: filename },
            {
              scheduleId: scheduleId,
              cameraName: cameraName,
              fk_camera_id: fk_camera_id,
              status: 'recording'
            }
          ]
        }
      });

      // 기존 녹화들의 상태를 'stopped'로 업데이트
      for (const existing of existingRecordings) {
        logger.info(`Marking existing recording as stopped: ${existing.id}`);
        await existing.update({
          status: 'stopped',
          endTime: timeInfo.formattedForDB,
          updatedAt: timeInfo.formattedForDB
        });
      }

      const newRecord = {
        scheduleId,
        cameraName,
        filename,
        startTime: timeInfo.formattedForDB,
        endTime: null,
        status: 'recording',
        createdAt: timeInfo.formattedForDB,
        fk_camera_id: fk_camera_id
      };
      logger.info('newRecord', newRecord);
      // 새 녹화 추가
      const createdRecord = await RecordingHistory.create(newRecord);

      logger.info('Recording history updated:', {
        newRecordId: createdRecord.id,
        stoppedRecords: existingRecordings.map(r => r.id),
        filename,
        cameraName
      });

      return createdRecord.id;
    } catch (error) {
      logger.error('Error in addRecordingHistory:', error);
      throw error;
    }
  }

  async updateRecordingHistory(recordingId, updates) {
    try {
      logger.info(`🔄 Updating recording history for ID: ${recordingId} with:`, updates);

      // 먼저 Sequelize 모델로 시도
      try {
        const currentRecord = await RecordingHistory.findByPk(recordingId);

        if (!currentRecord) {
          logger.warn(`⚠️ Recording history not found for ID: ${recordingId}, trying direct SQL...`);
          // Sequelize 모델로 찾을 수 없으면 직접 SQL로 업데이트 시도
          return await this.forceUpdateRecordingHistory(recordingId, updates);
        }

        logger.info(`📊 Current record status: ${currentRecord.status}, Updating to: ${updates.status}`);

        // 종료 상태 업데이트는 항상 허용 (중요한 정보이므로)
        if (['completed', 'stopped', 'error'].includes(updates.status)) {
          logger.info(`✅ Allowing status update to: ${updates.status}`);
        } else if (['completed', 'stopped', 'error'].includes(currentRecord.status) && updates.status === 'recording') {
          logger.warn(`⚠️ Skipping update for already finished recording: ${recordingId}`);
          return;
        }

        const updatedRecord = {
          ...updates,
          updatedAt: moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')
        };

        logger.info(`💾 Updating record with:`, updatedRecord);

        const result = await currentRecord.update(updatedRecord);

        logger.info(`✅ Recording history updated successfully via model:`, {
          id: recordingId,
          previousStatus: currentRecord.status,
          newStatus: updates.status,
          updates: updatedRecord,
          result: result ? 'success' : 'failed'
        });

        return result;
      } catch (modelError) {
        logger.warn(`⚠️ Model update failed for ID ${recordingId}, trying direct SQL:`, modelError);

        // Sequelize 모델 업데이트 실패 시 직접 SQL로 시도
        return await this.forceUpdateRecordingHistory(recordingId, updates);
      }
    } catch (error) {
      logger.error(`❌ Error in updateRecordingHistory for ID ${recordingId}:`, error);

      // 마지막 시도: 직접 SQL로 강제 업데이트
      try {
        logger.warn(`⚠️ Final attempt: force update via direct SQL for ID ${recordingId}`);
        return await this.forceUpdateRecordingHistory(recordingId, updates);
      } catch (forceError) {
        logger.error(`❌ All update methods failed for ID ${recordingId}:`, forceError);
        throw error;
      }
    }
  }

  async startRecording(cameraName, scheduleId, source, fk_camera_id, recoding_bitrate = '1024k') {
    // HLS 레코딩 설정 확인 (디버깅용)
    const hlsConfig = ConfigService.recordings?.hls;
    logger.info(`=== Recording Config Debug ===`);
    logger.info(`ConfigService.recordings:`, ConfigService.recordings);
    logger.info(`HLS Config Check - enabled: ${hlsConfig?.enabled}, segmentDuration: ${hlsConfig?.segmentDuration}, maxSegments: ${hlsConfig?.maxSegments}`);
    logger.info(`Full HLS config:`, JSON.stringify(hlsConfig, null, 2));
    logger.info(`=============================`);

    // HLS 레코딩을 무조건 수행
    logger.info(`Starting HLS recording for camera: ${cameraName}`);
    return this.startHLSRecording(cameraName, scheduleId, source, fk_camera_id, recoding_bitrate);
    // 기존 MP4 레코딩 로직
    const safeCameraName = this.getSafeFileName(cameraName);
    const recordingKey = `${safeCameraName}_${scheduleId}`;
    let recordingId = null;

    try {
      // 이미 녹화 중인지 확인
      const existingRecording = this.activeRecordings.get(recordingKey);
      if (existingRecording) {
        if (existingRecording.process && !existingRecording.process.killed) {
          logger.debug(`Recording already in progress for schedule: ${recordingKey}, skipping...`);
          return;
        }
      }

      // 시간 정보 생성 (한국 시간 기준)
      const nowMoment = moment().tz('Asia/Seoul');
      const timeInfo = {
        timestamp: nowMoment.unix(),
        formattedForFile: nowMoment.format('YYYY-MM-DDTHH-mm-ss'),
        formattedForDisplay: nowMoment.format('YYYY-MM-DDTHH:mm:ss'),
        dateString: nowMoment.format('YYYY-MM-DD'),
        formattedForDB: nowMoment.format('YYYY-MM-DD HH:mm:ss')
      };

      // 녹화 디렉토리 생성
      const recordingDir = path.join(
        this.recordingsPath,
        cameraName,
        timeInfo.dateString
      );
      await fs.ensureDir(recordingDir);

      // 안전한 파일명 생성 (한글 → 인덱스, 공백 제거)
      const safeCameraName = this.getSafeFileName(cameraName);
      const filename = `${safeCameraName}_${timeInfo.formattedForFile}.mp4`;
      const outputPath = path.join(recordingDir, filename);

      // HLS 세그먼트 파일명 패턴 (1시간 단위)
      const segmentPattern = `${safeCameraName}_${timeInfo.formattedForFile}_%02d.ts`;
      const playlistName = `${safeCameraName}_${timeInfo.formattedForFile}.m3u8`;
      const segmentPath = path.join(recordingDir, segmentPattern);
      const playlistPath = path.join(recordingDir, playlistName);

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
        recordingId = await this.addRecordingHistory(scheduleId, cameraName, timeInfo, filename, fk_camera_id);
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
        '-g', '15',
        '-keyint_min', '15',
        '-force_key_frames', 'expr:gte(t,n_forced*1)',
        '-b:v', recoding_bitrate,
        '-maxrate', recoding_bitrate,
        '-bufsize', recoding_bitrate,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-strict', '-2',
        '-f', 'mp4',
        '-movflags', '+faststart+frag_keyframe+empty_moov+default_base_moof',
        '-reset_timestamps', '1',
        '-loglevel', 'error',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        outputPath
      ], {
        windowsHide: true,
        windowsVerbatimArguments: true,
        env: { ...process.env }
      });

      // console.log('=====> ffmpeg', ffmpeg);
      let hasError = false;
      let errorMessage = '';

      // FFMPEG 에러 로그 처리
      ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();

        // 타임스탬프 관련 경고 메시지 필터링
        if (message.includes('Non-monotonic DTS') ||
          message.includes('changing to') ||
          message.includes('This may result in incorrect timestamps')) {
          return; // 이 메시지들은 무시
        }

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
                endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss'),
                status: 'error',
                errorMessage: 'Empty recording file'
              });
            }
          } else {
            // 정상 종료 시 녹화 히스토리 업데이트
            if (recordingId) {
              await this.updateRecordingHistory(recordingId, {
                endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss'),
                status: hasError ? 'error' : 'completed',
                errorMessage: hasError ? errorMessage : undefined
              });
            }
          }
        } catch (err) {
          logger.error(`Error checking recording file: ${err.message}`);
          if (recordingId) {
            await this.updateRecordingHistory(recordingId, {
              endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss'),
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
            // setTimeout(() => {
            //   this.startRecording(cameraName, scheduleId, source, fk_camera_id);
            // }, 5000);
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
      // logger.info(`====> this.activeRecordings: ${Array.from(this.activeRecordings.entries())}`);
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
          endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss'),
          status: 'error',
          errorMessage: error.message
        });
      }
      this.activeRecordings.delete(recordingKey);
    }
  }

  async startHLSRecording(cameraName, scheduleId, source, fk_camera_id, recoding_bitrate = '1024k') {
    const safeCameraName = this.getSafeFileName(cameraName);
    const recordingKey = `${safeCameraName}_${scheduleId}`;
    let recordingId = null;

    try {
      // 이미 녹화 중인지 확인
      const existingRecording = this.activeRecordings.get(recordingKey);
      if (existingRecording) {
        if (existingRecording.process && !existingRecording.process.killed) {
          logger.debug(`HLS Recording already in progress for schedule: ${recordingKey}, skipping...`);
          return;
        }
      }

      // 시간 정보 생성 (한국 시간 기준)
      const nowMoment = moment().tz('Asia/Seoul');
      const timeInfo = {
        timestamp: nowMoment.unix(),
        formattedForFile: nowMoment.format('YYYY-MM-DDTHH-mm-ss'),
        formattedForDisplay: nowMoment.format('YYYY-MM-DDTHH:mm:ss'),
        dateString: nowMoment.format('YYYY-MM-DD'),
        formattedForDB: nowMoment.format('YYYY-MM-DD HH:mm:ss')
      };

      // HLS 녹화 디렉토리 생성
      const recordingDir = path.join(
        this.recordingsPath,
        cameraName,
        timeInfo.dateString,
        'hls'
      );
      await fs.ensureDir(recordingDir);

      // 안전한 HLS 세그먼트 파일명 패턴 (간단한 형태로 수정)
      const safeCameraName = this.getSafeFileName(cameraName);
      const segmentPattern = `${safeCameraName}_%03d.ts`;  // 간단한 인덱스 패턴
      const playlistName = `${safeCameraName}_${timeInfo.formattedForFile}.m3u8`;
      const segmentPath = path.join(recordingDir, segmentPattern);
      const playlistPath = path.join(recordingDir, playlistName);

      // recordingHistory에 추가 (안전한 파일명 사용)
      try {
        recordingId = await this.addRecordingHistory(scheduleId, cameraName, timeInfo, playlistName, fk_camera_id);
      } catch (error) {
        logger.error('Failed to add HLS recording history:', error);
        return;
      }

      // source URL에서 -i 옵션 제거
      let rtspUrl = source;
      if (rtspUrl.includes('-i')) {
        rtspUrl = rtspUrl.replace(/-i\s+/, '').trim();
      }

      // HLS FFMPEG 프로세스 시작 (설정값 기반)
      const hlsConfig = ConfigService.recordings?.hls;
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
        '-b:v', recoding_bitrate,
        '-maxrate', recoding_bitrate,
        '-bufsize', recoding_bitrate,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-strict', '-2',
        // HLS 세그먼트 설정 (1분 단위로 세그먼트 생성, 최대 1440개)
        '-f', 'hls',
        '-hls_time', '60',  // 세그먼트 시간: 1분 (60초)
        '-hls_list_size', '1440',  // 최대 세그먼트 수: 1440개 (24시간)
        '-hls_segment_filename', segmentPath,
        '-hls_flags', 'delete_segments+append_list+independent_segments+omit_endlist+split_by_time',  // 세그먼트 삭제 + 플레이리스트 업데이트 + 독립 세그먼트 + 끝 표시 제거 + 시간 기준 분할
        '-hls_allow_cache', '0',
        '-hls_segment_type', 'mpegts',  // TS 파일 타입 명시
        '-hls_playlist_type', 'vod',  // VOD 타입으로 설정하여 세그먼트 생성 보장
        '-loglevel', 'error',  // error 레벨로 변경하여 FFMPEG 로그 최소화
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        playlistPath
      ], {
        windowsHide: true,
        windowsVerbatimArguments: true,
        env: { ...process.env }
      });

      let hasError = false;
      let errorMessage = '';

      // FFMPEG 에러 로그 처리 (최소화)
      ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();

        // 주요 에러만 체크하고 로그는 출력하지 않음
        if (message.includes('Connection refused') ||
          message.includes('Connection timed out') ||
          message.includes('Invalid data found') ||
          message.includes('Error opening input') ||
          message.includes('Broken pipe') ||
          message.includes('End of file')) {
          hasError = true;
          errorMessage = message;
          logger.error(`FFMPEG HLS Error for schedule ${recordingKey}:`, message);
        }
      });

      // 프로세스 종료 처리
      ffmpeg.on('close', async (code) => {
        logger.info(`🛑 HLS recording stopped for ${recordingKey} (exit code: ${code})`);

        // 이벤트 리스너 제거하여 로그 출력 중단
        ffmpeg.removeAllListeners();
        ffmpeg.stderr.removeAllListeners();

        // 녹화 종료 시간 기록
        const endTime = moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss');
        logger.info(`⏰ Recording end time: ${endTime} for ${recordingKey}`);

        // 플레이리스트 파일 존재 확인
        try {
          const stats = await fs.stat(playlistPath);
          if (stats.size === 0) {
            logger.error(`Empty HLS playlist detected for schedule: ${recordingKey}`);
            await fs.unlink(playlistPath);
            // 녹화 히스토리 업데이트 - 에러 상태로
            if (recordingId) {
              await this.updateRecordingHistory(recordingId, {
                endTime: moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss'),
                status: 'error',
                errorMessage: 'Empty HLS playlist'
              });
            }
          } else {
            // 정상 종료 시 녹화 히스토리 업데이트
            if (recordingId) {
              logger.info(`💾 Updating recording history for ${recordingKey} with endTime: ${endTime}`);

              try {
                const updateResult = await this.updateRecordingHistory(recordingId, {
                  endTime: endTime,
                  status: hasError ? 'error' : 'completed',
                  errorMessage: hasError ? errorMessage : undefined
                });

                if (updateResult) {
                  logger.info(`✅ Recording history updated successfully for ${recordingKey}: status=${hasError ? 'error' : 'completed'}, endTime=${endTime}`);
                } else {
                  logger.error(`❌ Failed to update recording history for ${recordingKey}`);
                }
              } catch (error) {
                logger.error(`❌ Error updating recording history for ${recordingKey}:`, error);
              }
            } else {
              logger.warn(`⚠️ No recordingId found for ${recordingKey}, cannot update history`);
            }

            // HLS 녹화 완료 후 세그먼트 정리 수행 (1분 단위 기준)
            const recordingInfo = this.activeRecordings.get(recordingKey);
            if (!hasError) {
              try {
                const maxSegments = 1440; // 24시간 최대 1440개 세그먼트 (1분 단위)
                await this.cleanupHLSSegments(cameraName, recordingInfo.timeInfo.dateString, maxSegments);
                logger.info(`HLS cleanup completed for ${recordingKey}, max segments: ${maxSegments}`);
              } catch (cleanupError) {
                logger.error(`HLS cleanup failed for ${recordingKey}:`, cleanupError);
              }
            }
          }
        } catch (err) {
          logger.error(`❌ Error checking HLS playlist: ${err.message}`);
          if (recordingId) {
            logger.info(`💾 Updating recording history for ${recordingKey} with error status`);

            try {
              const updateResult = await this.updateRecordingHistory(recordingId, {
                endTime: endTime,
                status: 'error',
                errorMessage: err.message
              });

              if (updateResult) {
                logger.info(`✅ Recording history updated successfully for ${recordingKey}: status=error, endTime=${endTime}`);
              } else {
                logger.error(`❌ Failed to update recording history for ${recordingKey}`);
              }
            } catch (error) {
              logger.error(`❌ Error updating recording history for ${recordingKey}:`, error);
            }
          } else {
            logger.warn(`⚠️ No recordingId found for ${recordingKey}, cannot update history`);
          }
        }

        this.activeRecordings.delete(recordingKey);

        // 비정상 종료 시 재시도
        if (code !== 0 && !hasError) {
          const lastRetryTime = this.lastRetryTimes.get(recordingKey) || 0;
          const now = Date.now();
          if (now - lastRetryTime > 60000) {
            logger.warn(`Abnormal exit for HLS schedule ${recordingKey}, attempting to restart...`);
            this.lastRetryTimes.set(recordingKey, now);
          } else {
            logger.warn(`Skipping retry for ${recordingKey} due to frequent failures`);
          }
        }
      });

      // 프로세스 에러 처리
      ffmpeg.on('error', async (err) => {
        logger.error(`FFMPEG HLS process error for schedule ${recordingKey}:`, err);
        hasError = true;

        // 이벤트 리스너 제거하여 로그 출력 중단
        ffmpeg.removeAllListeners();
        ffmpeg.stderr.removeAllListeners();

        if (recordingId) {
          const errorEndTime = moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss');
          logger.info(`💾 Updating recording history for ${recordingKey} with error status`);

          try {
            const updateResult = await this.updateRecordingHistory(recordingId, {
              endTime: errorEndTime,
              status: 'error',
              errorMessage: err.message
            });

            if (updateResult) {
              logger.info(`✅ Recording history updated successfully for ${recordingKey}: status=error, endTime=${errorEndTime}`);
            } else {
              logger.error(`❌ Failed to update recording history for ${recordingKey}`);
            }
          } catch (error) {
            logger.error(`❌ Error updating recording history for ${recordingKey}:`, error);
          }
        } else {
          logger.warn(`⚠️ No recordingId found for ${recordingKey}, cannot update history`);
        }
      });

      // 녹화 정보 저장 - outputPath를 메타데이터 파일 경로로 설정
      const recordingInfo = {
        recordingId,
        cameraName,
        scheduleId,
        process: ffmpeg,
        timeInfo,
        outputPath: path.join(recordingDir, `${playlistName}.json`), // .m3u8.json 파일 경로
        segmentDir: recordingDir,
        hasError: false,
        pid: ffmpeg.pid,
        startTime: Date.now(),
        isHLS: true,
        hlsConfig
      };

      this.activeRecordings.set(recordingKey, recordingInfo);

      // TS 파일 생성 모니터링 (1분 후 체크)
      setTimeout(async () => {
        try {
          const files = await fs.readdir(recordingDir);
          const tsFiles = files.filter(file => file.endsWith('.ts'));
          const m3u8Files = files.filter(file => file.endsWith('.m3u8'));

          if (tsFiles.length > 0) {
            logger.info(`✅ TS files generated successfully: ${tsFiles.length} files for ${recordingKey}`);
          } else {
            logger.warn(`⚠️ No TS files generated for ${recordingKey} after 1 minute`);
          }

          if (m3u8Files.length > 0) {
            logger.info(`✅ M3U8 playlist generated: ${m3u8Files.length} files for ${recordingKey}`);
          } else {
            logger.warn(`⚠️ No M3U8 playlist generated for ${recordingKey} after 1 minute`);
          }
        } catch (error) {
          logger.error(`❌ HLS Monitoring Error for ${recordingKey}: ${error.message}`);
        }
      }, 60000); // 1분 (60000ms)

      // 녹화 자동 종료 모니터링 (스케줄 시간이 끝나면 자동 종료)
      this.startRecordingTimeout(recordingKey, scheduleId, cameraName, timeInfo);

      // 안전장치: 최대 24시간 후 자동 종료 (백업 타이머)
      setTimeout(() => {
        logger.warn(`⚠️ Safety timeout reached for ${recordingKey}, forcing stop after 24 hours`);
        this.stopRecording(cameraName, scheduleId);
      }, 24 * 60 * 60 * 1000); // 24시간

      // 녹화 메타데이터 저장 - outputPath를 직접 사용
      await fs.writeJson(recordingInfo.outputPath, {
        recordingId,
        scheduleId,
        cameraName,
        startTime: timeInfo.formattedForFile,
        filename: playlistName,
        playlistPath: playlistPath, // .m3u8 파일 경로
        segmentDir: recordingDir,
        rtspUrl,
        status: 'recording',
        isHLS: true,
        segmentDuration: 60,     // 1분 (60초)
        maxSegments: 1440        // 24시간 최대 1440개 세그먼트 (1분 단위)
      });

      logger.info(`🎬 HLS recording started for ${recordingKey} - TS files will be generated every 1 minute`);
      logger.info(`⏰ Safety timeout set: will auto-stop after 24 hours if not stopped by schedule`);

    } catch (error) {
      logger.error(`Failed to start HLS recording for schedule: ${recordingKey}`, error);
      // 시작 실패 시 히스토리 업데이트
      if (recordingId) {
        await this.updateRecordingHistory(recordingId, {
          status: 'error',
          errorMessage: error.message
        });
      }
    }
  }

  async stopRecording(cameraName, scheduleId) {
    try {
      // 카메라명을 안전한 형태로 변환하여 recordingKey 생성
      const safeCameraName = this.getSafeFileName(cameraName);
      const recordingKey = `${safeCameraName}_${scheduleId}`;
      logger.info(`🛑 Attempting to stop recording: ${recordingKey} (original: ${cameraName})`);

      const recordingInfo = this.activeRecordings.get(recordingKey);
      if (!recordingInfo) {
        logger.warn(`⚠️ Recording info not found for: ${recordingKey}`);
        return;
      }

      logger.info(`🛑 Found recording info: process=${!!recordingInfo.process}, killed=${recordingInfo.process?.killed}`);

      // FFMPEG 프로세스 강제 종료
      if (recordingInfo.process && !recordingInfo.process.killed) {
        try {
          logger.info(`🛑 Sending SIGTERM to process ${recordingInfo.process.pid}`);
          recordingInfo.process.kill('SIGTERM');

          // 즉시 종료 확인
          if (recordingInfo.process.killed) {
            logger.info(`✅ Process terminated immediately with SIGTERM`);
          } else {
            logger.info(`⏳ Process not terminated, waiting 3 seconds...`);

            // 3초 후에도 종료되지 않으면 강제 종료
            setTimeout(() => {
              try {
                if (!recordingInfo.process.killed) {
                  logger.info(`🛑 Sending SIGKILL to process ${recordingInfo.process.pid}`);
                  recordingInfo.process.kill('SIGKILL');

                  if (recordingInfo.process.killed) {
                    logger.info(`✅ Process terminated with SIGKILL`);
                  } else {
                    logger.error(`❌ Failed to terminate process ${recordingInfo.process.pid}`);
                  }
                }
              } catch (e) {
                logger.error(`❌ Error sending SIGKILL: ${e.message}`);
              }
            }, 3000);
          }
        } catch (e) {
          logger.error(`❌ Error killing process: ${e.message}`);
        }
      } else {
        logger.info(`ℹ️ Process already terminated or not found`);
      }

      // recordingHistory 업데이트
      if (recordingInfo.recordingId) {
        const endTime = moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss');
        logger.info(`💾 Updating recording history for ${recordingKey} with endTime: ${endTime}`);

        try {
          const updateResult = await this.updateRecordingHistory(recordingInfo.recordingId, {
            endTime,
            status: recordingInfo.hasError ? 'error' : 'stopped'
          });

          if (updateResult) {
            logger.info(`✅ Recording history updated successfully for ${recordingKey}`);
          } else {
            logger.error(`❌ Failed to update recording history for ${recordingKey}`);
          }
        } catch (error) {
          logger.error(`❌ Error updating recording history for ${recordingKey}:`, error);
        }
      } else {
        logger.warn(`⚠️ No recordingId found for ${recordingKey}, cannot update history`);
      }

      // 메타데이터 업데이트 - outputPath가 이미 .m3u8.json 파일 경로
      if (await fs.pathExists(recordingInfo.outputPath)) {
        try {
          const metadata = await fs.readJson(recordingInfo.outputPath);
          metadata.endTime = moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss');
          metadata.status = recordingInfo.hasError ? 'error' : 'stopped';
          await fs.writeJson(recordingInfo.outputPath, metadata);
          logger.info(`✅ Metadata updated for ${recordingKey}`);
        } catch (e) {
          logger.error(`❌ Error updating metadata: ${e.message}`);
        }
      } else {
        logger.warn(`⚠️ Metadata file not found for ${recordingKey} at: ${recordingInfo.outputPath}`);
      }

      // activeRecordings에서 제거
      this.activeRecordings.delete(recordingKey);
      logger.info(`✅ Recording stopped and removed from active recordings: ${recordingKey}`);

    } catch (error) {
      logger.error(`❌ Failed to stop recording for schedule: ${cameraName}_${scheduleId}`, error);
      // 에러가 발생해도 activeRecordings에서 제거
      this.activeRecordings.delete(`${cameraName}_${scheduleId}`);
    }
  }

  async checkAndUpdateRecordings() {
    try {
      const activeSchedules = await this.getCurrentlyActiveSchedules();
      // console.log('====> activeSchedules', activeSchedules);
      // 현재 활성화된 스케줄의 카메라와 스케줄ID를 맵으로 관리
      const activeScheduleMap = new Map();
      activeSchedules.forEach(schedule => {
        const scheduleKey = `${schedule.cameraName}_${schedule.id}`;
        activeScheduleMap.set(scheduleKey, schedule);
      });

      // 현재 녹화 중인 프로세스 확인 및 중지
      logger.info(`🔍 Checking ${this.activeRecordings.size} active recordings...`);

      for (const [recordingKey, recordingInfo] of this.activeRecordings) {
        logger.info(`🔍 Checking recording: ${recordingKey}`);

        // recordingKey에서 cameraName과 scheduleId 추출
        const parts = recordingKey.split('_');
        if (parts.length >= 2) {
          const scheduleId = parts[parts.length - 1]; // 마지막 부분이 scheduleId
          const originalCameraName = recordingInfo.cameraName; // 원본 카메라명 사용

          // 스케줄 키 생성 (원본 카메라명 사용)
          const scheduleKey = `${originalCameraName}_${scheduleId}`;
          logger.info(`🔍 Schedule key: ${scheduleKey}, Active schedules: ${Array.from(activeScheduleMap.keys()).join(', ')}`);

          if (!activeScheduleMap.has(scheduleKey)) {
            logger.info(`🛑 Stopping recording for inactive schedule: ${recordingKey} (schedule: ${scheduleKey})`);
            await this.stopRecording(recordingInfo.cameraName, recordingInfo.scheduleId);
          } else {
            // 활성 스케줄의 경우 종료 시간 체크
            const schedule = activeScheduleMap.get(scheduleKey);
            if (schedule) {
              const now = new Date();
              const currentDay = now.getDay();
              const currentTime = now.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
              });

              logger.info(`🔍 Schedule ${schedule.id}: ${schedule.start_time}-${schedule.end_time}, Current: ${currentTime}, Day: ${currentDay}`);

              // 스케줄 시간이 끝났으면 녹화 중지
              if (!this.isTimeInRange(currentTime, schedule.start_time, schedule.end_time)) {
                logger.info(`⏰ Schedule ${schedule.id} time range ended (${schedule.start_time}-${schedule.end_time}), stopping recording for ${recordingKey}`);
                await this.stopRecording(recordingInfo.cameraName, recordingInfo.scheduleId);

                // 추가 확인: 프로세스가 실제로 종료되었는지 체크
                setTimeout(async () => {
                  const stillActive = this.activeRecordings.has(recordingKey);
                  if (stillActive) {
                    logger.warn(`⚠️ Recording ${recordingKey} still active after stop attempt, force stopping...`);
                    await this.stopRecording(recordingInfo.cameraName, recordingInfo.scheduleId);
                  }
                }, 5000); // 5초 후 재확인
              }
            }
          }
        }
      }

      // 새로운 녹화 시작
      for (const schedule of activeSchedules) {
        const scheduleKey = `${schedule.cameraName}_${schedule.id}`;

        // 이미 녹화 중인 경우 스킵
        if (this.activeRecordings.has(scheduleKey)) {
          continue;
        }

        // 오늘 이미 완료된 녹화가 있는지 다시 한번 확인 (LIKE → 범위 조건)
        const today = moment().tz('Asia/Seoul').startOf('day');
        const tomorrow = moment(today).add(1, 'days');
        const recordingHistory = await RecordingHistory.findAll({
          where: {
            scheduleId: schedule.id,
            cameraName: schedule.cameraName,
            startTime: {
              [Op.gte]: today.toDate(),
              [Op.lt]: tomorrow.toDate()
            },
            status: {
              [Op.in]: ['completed', 'stopped']
            }
          }
        });

        if (recordingHistory.length > 0) {
          logger.info(`Skipping recording for schedule ${scheduleKey} as it was already completed today`);
          continue;
        }

        logger.info(`Starting new recording for schedule: ${scheduleKey}`);
        // console.log('=====> schedule', schedule);
        await this.startRecording(schedule.cameraName, schedule.id, schedule.source, schedule.fk_camera_id, schedule.recoding_bitrate);
      }

    } catch (error) {
      logger.error('Error in checkAndUpdateRecordings:', error);
    }
  }

  async cleanupHLSSegments(cameraName, recordingDate, maxSegments) {
    try {
      // 24시간 최대 1440개 세그먼트로 하드코딩 (1분 단위)
      const segmentsToKeep = 1440;

      const hlsDir = path.join(
        this.recordingsPath,
        cameraName,
        recordingDate,
        'hls'
      );

      if (!await fs.pathExists(hlsDir)) {
        return;
      }

      const files = await fs.readdir(hlsDir);
      const tsFiles = files.filter(file => file.endsWith('.ts')).sort();

      // 최대 세그먼트 수를 초과하는 오래된 파일 삭제
      if (tsFiles.length > segmentsToKeep) {
        const filesToDelete = tsFiles.slice(0, tsFiles.length - segmentsToKeep);

        for (const file of filesToDelete) {
          const filePath = path.join(hlsDir, file);
          await fs.unlink(filePath);
          logger.debug(`Deleted old HLS segment: ${file}`);
        }

        // 플레이리스트 파일 업데이트
        const playlistFiles = files.filter(file => file.endsWith('.m3u8'));
        for (const playlistFile of playlistFiles) {
          await this.updateHLSPlaylist(path.join(hlsDir, playlistFile), segmentsToKeep);
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up HLS segments: ${error.message}`);
    }
  }

  async performHLSCleanup() {
    try {
      // 24시간 최대 1440개 세그먼트로 하드코딩
      const cameras = await this.getActiveCameras();

      for (const camera of cameras) {
        const recordingDate = moment().tz('Asia/Seoul').format('YYYY-MM-DD');
        await this.cleanupHLSSegments(
          camera.name,
          recordingDate,
          1440  // 24시간 최대 1440개 세그먼트 (1분 단위)
        );
      }

      logger.debug('HLS cleanup completed (1440 segments max)');
    } catch (error) {
      logger.error('Error during HLS cleanup:', error);
    }
  }

  // 녹화 자동 종료 모니터링 함수
  startRecordingTimeout(recordingKey, scheduleId, cameraName, timeInfo) {
    try {
      // 스케줄 정보 조회
      Schedule.findByPk(scheduleId).then(schedule => {
        if (schedule) {
          const now = new Date();
          const currentDay = now.getDay();
          const currentTime = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
          });

          // 스케줄이 활성화되어 있고, 오늘 날짜이고, 현재 시간이 스케줄 시간 범위에 있는지 확인
          if (schedule.isActive &&
            schedule.days_of_week.includes(currentDay) &&
            this.isTimeInRange(currentTime, schedule.start_time, schedule.end_time)) {

            // 스케줄 종료 시간까지 대기 후 녹화 종료
            const [endHour, endMinute] = schedule.end_time.split(':');
            const endTime = new Date();
            endTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);

            // 현재 시간이 종료 시간을 지났으면 즉시 종료
            if (now >= endTime) {
              logger.info(`⏰ Schedule ${scheduleId} end time reached, stopping recording for ${recordingKey}`);
              this.stopRecording(cameraName, scheduleId);
              return;
            }

            // 종료 시간까지 남은 시간 계산
            const timeUntilEnd = endTime.getTime() - now.getTime();

            // 녹화 자동 종료 타이머 설정 (최대 24시간)
            const maxTimeout = Math.min(timeUntilEnd, 24 * 60 * 60 * 1000); // 24시간 제한

            setTimeout(() => {
              logger.info(`🛑 Auto-stopping recording for ${recordingKey} due to schedule end time`);
              this.stopRecording(cameraName, scheduleId);
            }, maxTimeout);

            logger.info(`⏰ Auto-stop timer set for ${recordingKey}: will stop in ${Math.round(maxTimeout / 60000)} minutes`);
          } else {
            logger.warn(`⚠️ Schedule ${scheduleId} is not active or outside time range for ${recordingKey}`);
          }
        } else {
          logger.warn(`⚠️ Schedule ${scheduleId} not found for ${recordingKey}`);
        }
      }).catch(error => {
        logger.error(`❌ Error setting recording timeout for ${recordingKey}:`, error);
      });
    } catch (error) {
      logger.error(`❌ Error in startRecordingTimeout for ${recordingKey}:`, error);
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

    // 안전장치: 1시간마다 모든 녹화 상태 체크 및 강제 정리
    setInterval(() => {
      this.checkAndForceCleanup();
    }, 60 * 60 * 1000); // 1시간

    logger.info('Recording process started, checking schedules every 30 seconds, cleanup every 1 hour');
  }

  // 녹화 상태 체크 및 강제 정리
  async checkAndForceCleanup() {
    try {
      logger.info(`🧹 Starting periodic cleanup check...`);

      for (const [recordingKey, recordingInfo] of this.activeRecordings) {
        // 녹화가 너무 오래 실행되고 있는지 확인 (24시간 이상)
        const runningTime = Date.now() - recordingInfo.startTime;
        const maxRunningTime = 24 * 60 * 60 * 1000; // 24시간

        if (runningTime > maxRunningTime) {
          logger.warn(`⚠️ Recording ${recordingKey} running too long (${Math.round(runningTime / 60000)} minutes), force stopping...`);
          await this.stopRecording(recordingInfo.cameraName, recordingInfo.scheduleId);
        }
      }

      logger.info(`🧹 Periodic cleanup check completed`);
    } catch (error) {
      logger.error(`❌ Error in periodic cleanup:`, error);
    }
  }

  // 강제로 모든 녹화를 중지하는 함수
  forceStopAllRecordings() {
    logger.warn(`⚠️ Force stopping all recordings...`);

    for (const [recordingKey, recordingInfo] of this.activeRecordings) {
      logger.warn(`⚠️ Force stopping: ${recordingKey}`);
      try {
        if (recordingInfo.process && !recordingInfo.process.killed) {
          recordingInfo.process.kill('SIGKILL');
          logger.info(`✅ Force killed process for ${recordingKey}`);
        }

        // 강제로 DB 업데이트 시도
        if (recordingInfo.recordingId) {
          const endTime = moment().tz('Asia/Seoul').format('YYYY-MM-DDTHH:mm:ss');
          this.updateRecordingHistory(recordingInfo.recordingId, {
            endTime,
            status: 'stopped',
            errorMessage: 'Force stopped'
          }).then(() => {
            logger.info(`✅ Force updated recording history for ${recordingKey}`);
          }).catch((error) => {
            logger.error(`❌ Failed to force update recording history for ${recordingKey}:`, error);
          });
        }
      } catch (e) {
        logger.error(`❌ Error force killing process for ${recordingKey}: ${e.message}`);
      }
    }

    // activeRecordings 초기화
    this.activeRecordings.clear();
    logger.info(`✅ All recordings force stopped and cleared`);
  }

  // DB 연결 상태 확인 및 녹화 히스토리 강제 업데이트
  async forceUpdateRecordingHistory(recordingId, updates) {
    try {
      logger.warn(`⚠️ Force updating recording history for ID: ${recordingId}`);

      // 여러 SQL 문법으로 시도 (데이터베이스 호환성)
      const sqlQueries = [
        // 표준 SQL
        'UPDATE RecordingHistories SET endTime = :endTime, status = :status, updatedAt = :updatedAt WHERE id = :id',
        // MySQL/SQLite 스타일
        'UPDATE RecordingHistories SET endTime = ?, status = ?, updatedAt = ? WHERE id = ?',
        // PostgreSQL 스타일
        'UPDATE "RecordingHistories" SET "endTime" = $1, "status" = $2, "updatedAt" = $3 WHERE "id" = $4'
      ];

      for (let i = 0; i < sqlQueries.length; i++) {
        try {
          const sql = sqlQueries[i];
          let replacements;

          if (sql.includes(':')) {
            // Named parameters
            replacements = {
              endTime: updates.endTime || null,
              status: updates.status || 'stopped',
              updatedAt: moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss'),
              id: recordingId
            };
          } else if (sql.includes('$')) {
            // Positional parameters (PostgreSQL)
            replacements = [
              updates.endTime || null,
              updates.status || 'stopped',
              moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss'),
              recordingId
            ];
          } else {
            // Positional parameters (MySQL/SQLite)
            replacements = [
              updates.endTime || null,
              updates.status || 'stopped',
              moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss'),
              recordingId
            ];
          }

          logger.info(`🔄 Trying SQL query ${i + 1}: ${sql}`);

          const result = await sequelize.query(sql, {
            replacements,
            type: sequelize.QueryTypes.UPDATE
          });

          logger.info(`✅ Force update successful with query ${i + 1}:`, result);
          return result;
        } catch (queryError) {
          logger.warn(`⚠️ Query ${i + 1} failed:`, queryError.message);
          if (i === sqlQueries.length - 1) {
            throw queryError; // 마지막 쿼리도 실패하면 에러 전파
          }
        }
      }
    } catch (error) {
      logger.error(`❌ All force update methods failed for ID ${recordingId}:`, error);

      // 최후의 수단: INSERT 시도 (레코드가 없는 경우)
      try {
        logger.warn(`⚠️ Attempting INSERT as last resort for ID ${recordingId}`);
        const insertResult = await sequelize.query(
          'INSERT INTO RecordingHistories (id, endTime, status, updatedAt, createdAt) VALUES (:id, :endTime, :status, :updatedAt, :createdAt)',
          {
            replacements: {
              id: recordingId,
              endTime: updates.endTime || null,
              status: updates.status || 'stopped',
              updatedAt: moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss'),
              createdAt: moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')
            },
            type: sequelize.QueryTypes.INSERT
          }
        );
        logger.info(`✅ INSERT successful as fallback:`, insertResult);
        return insertResult;
      } catch (insertError) {
        logger.error(`❌ INSERT also failed for ID ${recordingId}:`, insertError);
        throw error;
      }
    }
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;

      logger.info('🛑 Recording process stopping, force stopping all recordings...');

      // 강제로 모든 녹화 중지
      this.forceStopAllRecordings();

      logger.info('✅ Recording process stopped');
    }
  }
}

export default new RecordingProcess(); 