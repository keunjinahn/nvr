import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import Database from '../../api/database.js';
import LoggerService from '../logger/logger.service.js';
import ConfigService from '../config/config.service.js';

const logger = new LoggerService('RecordingProcess');

class RecordingProcess {
  constructor() {
    this.activeRecordings = new Map(); // key: `${cameraName}_${scheduleId}`
    this.checkInterval = null;
    this.recordingsPath = ConfigService.recordingsPath;
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

      return schedules.filter(schedule =>
        schedule.isActive &&
        schedule.days_of_week.includes(currentDay) &&
        this.isTimeInRange(currentTime, schedule.start_time, schedule.end_time)
      );
    } catch (error) {
      logger.error('Error getting active schedules:', error);
      return [];
    }
  }

  async startRecording(cameraName, scheduleId, source) {
    try {
      const recordingKey = `${cameraName}_${scheduleId}`;

      // 이미 녹화 중인지 더 엄격하게 확인
      if (this.activeRecordings.has(recordingKey)) {
        const existingRecording = this.activeRecordings.get(recordingKey);
        if (existingRecording.process && !existingRecording.process.killed) {
          logger.warn(`Recording already in progress for schedule: ${recordingKey}, skipping...`);
          return;
        } else {
          // 프로세스가 죽었지만 Map에서 제거되지 않은 경우 정리
          logger.info(`Cleaning up dead recording process for schedule: ${recordingKey}`);
          await this.stopRecording(cameraName, scheduleId);
        }
      }

      // 녹화 디렉토리 생성
      const now = new Date();
      const recordingDir = path.join(
        this.recordingsPath,
        cameraName,
        now.toISOString().split('T')[0]
      );
      await fs.ensureDir(recordingDir);

      // 기존 프로세스 확인 및 종료 (OS 레벨)
      try {
        const killCmd = process.platform === 'win32' ?
          `taskkill /F /IM ffmpeg.exe /FI "WINDOWTITLE eq ${recordingKey}"` :
          `pkill -f "ffmpeg.*${recordingKey}"`;
        await new Promise((resolve) => {
          const kill = spawn(process.platform === 'win32' ? 'cmd' : 'sh',
            [process.platform === 'win32' ? '/c' : '-c', killCmd]);
          kill.on('close', resolve);
        });
        logger.info(`Killed any existing ffmpeg processes for schedule: ${recordingKey}`);
      } catch (err) {
        logger.debug(`No existing ffmpeg processes found for schedule: ${recordingKey}`);
      }

      // 녹화 파일명 생성
      const filename = `${now.getTime()}_${scheduleId}.mp4`;
      const outputPath = path.join(recordingDir, filename);

      // source URL에서 -i 옵션 제거
      let rtspUrl = source;
      if (rtspUrl.includes('-i')) {
        rtspUrl = rtspUrl.replace(/-i\s+/, '').trim();
        logger.info('Cleaned RTSP URL:', rtspUrl);
      }

      logger.info(`Starting recording for schedule: ${recordingKey} with URL: ${rtspUrl}`);

      // FFMPEG 프로세스 시작 - 윈도우 타이틀 추가
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
        // 프로세스 식별을 위한 윈도우 타이틀 설정
        env: { ...process.env, FFREPORT: `file=${recordingDir}/ffmpeg-${recordingKey}.log:level=32` }
      });

      let hasError = false;
      let dataReceived = false;
      let lastDataTime = Date.now();
      let segmentStartTime = Date.now();

      // FFMPEG 에러 로그 처리
      ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();
        logger.debug(`FFMPEG [${recordingKey}]: ${message}`);
        lastDataTime = Date.now(); // 데이터 수신 시간 업데이트

        // 스트림 데이터 수신 확인
        if (message.includes('Input #0') || message.includes('Stream mapping')) {
          dataReceived = true;
        }

        // 주요 에러 체크
        if (message.includes('Connection refused') ||
          message.includes('Connection timed out') ||
          message.includes('Invalid data found') ||
          message.includes('Error opening input') ||
          message.includes('Broken pipe') ||
          message.includes('End of file')) {
          hasError = true;
          logger.error(`FFMPEG Error for schedule ${recordingKey}:`, message);
        }

        // 녹화 진행 상황 로깅 (5분마다)
        const now = Date.now();
        if (now - segmentStartTime >= 300000) { // 5분
          const durationMinutes = ((now - segmentStartTime) / 60000).toFixed(1);
          logger.info(`Recording progress for ${recordingKey}: ${durationMinutes} minutes`);
          segmentStartTime = now;
        }
      });

      // 표준 출력 처리
      ffmpeg.stdout.on('data', (data) => {
        lastDataTime = Date.now(); // 데이터 수신 시간 업데이트
        logger.debug(`FFMPEG stdout [${recordingKey}]:`, data.toString());
      });

      // 주기적으로 데이터 수신 상태 체크 (30초마다)
      const healthCheck = setInterval(() => {
        const now = Date.now();
        if (now - lastDataTime > 30000) { // 30초 동안 데이터가 없으면
          logger.warn(`No data received for 30 seconds from schedule: ${recordingKey}`);
          clearInterval(healthCheck);
          this.stopRecording(cameraName, scheduleId).then(() => {
            // 재시작
            setTimeout(() => {
              this.startRecording(cameraName, scheduleId, source);
            }, 5000);
          });
        }
      }, 30000);

      // 프로세스 종료 처리
      ffmpeg.on('close', async (code) => {
        clearInterval(healthCheck); // 헬스체크 중지
        logger.info(`Recording stopped for schedule: ${recordingKey}, exit code: ${code}`);

        // 비정상 종료 시 재시도 로직
        if (code !== 0 && !hasError) {
          logger.warn(`Abnormal exit for schedule ${recordingKey}, attempting to restart...`);
          this.activeRecordings.delete(recordingKey);
          // 5초 후 재시도
          setTimeout(() => {
            this.startRecording(cameraName, scheduleId, source);
          }, 5000);
          return;
        }

        this.activeRecordings.delete(recordingKey);

        // 파일 크기 확인
        try {
          const stats = await fs.stat(outputPath);
          logger.info(`Recording file size: ${stats.size} bytes`);
          if (stats.size === 0) {
            logger.error(`Empty recording file detected for schedule: ${recordingKey}`);
          }
        } catch (err) {
          logger.error(`Error checking recording file: ${err.message}`);
        }
      });

      // 프로세스 에러 처리
      ffmpeg.on('error', (err) => {
        logger.error(`FFMPEG process error for schedule ${recordingKey}:`, err);
        hasError = true;
      });

      // 녹화 정보 저장 전에 기존 정보 정리
      if (this.activeRecordings.has(recordingKey)) {
        await this.stopRecording(cameraName, scheduleId);
      }

      // 녹화 정보 저장
      const recordingInfo = {
        cameraName,
        scheduleId,
        process: ffmpeg,
        startTime: now,
        outputPath,
        hasError: false,
        pid: ffmpeg.pid
      };

      this.activeRecordings.set(recordingKey, recordingInfo);
      logger.info(`Started recording for schedule: ${recordingKey}, PID: ${ffmpeg.pid}`);

      // 녹화 메타데이터 저장
      const metadataPath = path.join(recordingDir, `${filename}.json`);
      await fs.writeJson(metadataPath, {
        scheduleId,
        cameraName,
        startTime: now.toISOString(),
        outputPath,
        rtspUrl
      });

    } catch (error) {
      logger.error(`Failed to start recording for schedule: ${cameraName}_${scheduleId}`, error);
      // 에러 발생 시 정리
      await this.stopRecording(cameraName, scheduleId);
    }
  }

  async stopRecording(cameraName, scheduleId) {
    try {
      const recordingKey = `${cameraName}_${scheduleId}`;
      const recordingInfo = this.activeRecordings.get(recordingKey);
      if (!recordingInfo) {
        return;
      }

      // FFMPEG 프로세스 종료 전 상태 확인
      if (recordingInfo.process && !recordingInfo.process.killed) {
        try {
          recordingInfo.process.kill('SIGTERM');
          // 프로세스가 즉시 종료되지 않을 경우를 대비한 강제 종료
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

      // OS 레벨에서 프로세스 정리
      try {
        const killCmd = process.platform === 'win32' ?
          `taskkill /F /IM ffmpeg.exe /FI "WINDOWTITLE eq ${recordingKey}"` :
          `pkill -f "ffmpeg.*${recordingKey}"`;
        await new Promise((resolve) => {
          const kill = spawn(process.platform === 'win32' ? 'cmd' : 'sh',
            [process.platform === 'win32' ? '/c' : '-c', killCmd]);
          kill.on('close', resolve);
        });
      } catch (err) {
        logger.debug(`No additional ffmpeg processes found for schedule: ${recordingKey}`);
      }

      // 메타데이터 업데이트
      const metadataPath = `${recordingInfo.outputPath}.json`;
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        metadata.endTime = new Date().toISOString();
        await fs.writeJson(metadataPath, metadata);
      }

      this.activeRecordings.delete(recordingKey);
      logger.info(`Stopped recording for schedule: ${recordingKey}`);

    } catch (error) {
      logger.error(`Failed to stop recording for schedule: ${cameraName}_${scheduleId}`, error);
      // 에러가 발생하더라도 Map에서는 제거
      this.activeRecordings.delete(`${cameraName}_${scheduleId}`);
    }
  }

  async checkAndUpdateRecordings() {
    try {
      const activeSchedules = await this.getCurrentlyActiveSchedules();
      logger.info('Active schedules:', activeSchedules);

      // 현재 활성화된 스케줄의 카메라와 스케줄ID를 맵으로 관리
      const activeScheduleMap = new Map();
      activeSchedules.forEach(schedule => {
        const scheduleKey = `${schedule.cameraName}_${schedule.id}`;
        activeScheduleMap.set(scheduleKey, schedule);
      });

      // 현재 녹화 중인 프로세스 확인
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

        // 해당 스케줄에 대한 녹화가 없는 경우
        if (!this.activeRecordings.has(scheduleKey)) {
          logger.info(`Starting new recording for schedule: ${scheduleKey}`, {
            cameraName: schedule.cameraName,
            scheduleId: schedule.id,
            source: schedule.source
          });
          await this.startRecording(schedule.cameraName, schedule.id, schedule.source);
        }
      }

    } catch (error) {
      logger.error('Error in checkAndUpdateRecordings:', error);
    }
  }

  start() {
    if (this.checkInterval) {
      this.stop();
    }

    // 10초마다 스케줄 체크
    this.checkInterval = setInterval(() => {
      this.checkAndUpdateRecordings();
    }, 10000);

    logger.info('Recording process started, checking schedules every 10 seconds');
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