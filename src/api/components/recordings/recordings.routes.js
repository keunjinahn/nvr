'use-strict';

import * as RecordingsController from './recordings.controller.js';

import * as PaginationMiddleware from '../../middlewares/pagination.middleware.js';
import * as PermissionMiddleware from '../../middlewares/auth.permission.middleware.js';
import * as ValidationMiddleware from '../../middlewares/auth.validation.middleware.js';
import * as RecordingsValidationMiddleware from '../../middlewares/recordings.validation.middleware.js';

import Database from '../../database.js';
import LoggerService from '../../../services/logger/logger.service.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const logger = new LoggerService();

// Get current file's directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 썸네일 저장 디렉토리 설정
const THUMBNAIL_DIR = resolve(process.env.CUI_STORAGE_PATH || 'storage', 'thumbnails');
const RECORDINGS_DIR = resolve(process.env.CUI_STORAGE_PATH || 'storage', 'recordings');

// 썸네일 디렉토리가 없으면 생성
if (!fs.existsSync(THUMBNAIL_DIR)) {
  fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

// FFmpeg를 사용하여 비디오의 첫 프레임을 추출하는 함수
const generateThumbnail = async (videoPath, thumbnailPath) => {
  return new Promise((resolve, reject) => {
    logger.debug('Generating thumbnail', { videoPath, thumbnailPath });

    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,           // 입력 비디오 파일
      '-vf', 'select=eq(n\\,0)', // 첫 프레임 선택
      '-vframes', '1',           // 1프레임만 추출
      '-y',                      // 기존 파일 덮어쓰기
      thumbnailPath             // 출력 썸네일 파일
    ]);

    ffmpeg.stderr.on('data', (data) => {
      logger.debug(`FFmpeg stderr: ${data}`);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        logger.info('Thumbnail generated successfully', { thumbnailPath });
        resolve(thumbnailPath);
      } else {
        reject(new Error(`FFmpeg process exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      logger.error('FFmpeg process error:', err);
      reject(err);
    });
  });
};

// 비디오 파일 경로 생성 함수
const getVideoPath = (cameraName, recordingDate) => {
  return path.join(RECORDINGS_DIR, cameraName, recordingDate);
};

/**
 * @swagger
 * tags:
 *  name: Recordings
 */

export const routesConfig = (app) => {
  logger.info('Initializing recordings routes', {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    appRoutes: Object.keys(app._router.stack)
      .filter(key => app._router.stack[key].route)
      .map(key => app._router.stack[key].route.path)
  });

  /**
   * @swagger
   * /api/recordings:
   *   get:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Get all recordings
   *     parameters:
   *       - in: query
   *         name: cameras
   *         description: Cameras
   *         example: "Camera One,Camera Two"
   *         type: string
   *       - in: query
   *         name: labels
   *         description: Labels
   *         example: "Human,Person,Face"
   *         type: string
   *       - in: query
   *         name: type
   *         description: Type
   *         example: "Snapshot,Video"
   *         type: string
   *       - in: query
   *         name: start
   *         type: number
   *         description: Start index
   *       - in: query
   *         name: page
   *         type: number
   *         description: Page
   *       - in: query
   *         name: pageSize
   *         type: number
   *         description: Page size
   *       - in: query
   *         name: from
   *         description: Start Date
   *         example: "2020-01-01"
   *         format: date
   *         pattern: "YYYY-MM-DD"
   *         minLength: 0
   *         maxLength: 10
   *       - in: query
   *         name: to
   *         description: End Date
   *         example: "2020-02-01"
   *         format: date
   *         pattern: "YYYY-MM-DD"
   *         minLength: 0
   *         maxLength: 10
   *     responses:
   *       200:
   *         description: Successfull
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get('/api/recordings', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('recordings:access'),
    RecordingsController.list,
    PaginationMiddleware.pages,
  ]);

  /**
   * @swagger
   * /api/recordings/history:
   *   get:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Get recording history
   *     responses:
   *       200:
   *         description: Successfull
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get('/api/recordings/history', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('recordings:access'),
    async (req, res) => {
      const startTime = Date.now();
      const requestId = Math.random().toString(36).substring(7);

      logger.info('Recording history request started', {
        requestId,
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
          'authorization': req.headers['authorization'] ? 'Bearer [REDACTED]' : undefined
        },
        timestamp: new Date().toISOString()
      });

      try {
        logger.debug('Fetching recording history from database', {
          requestId,
          database: Database.interfaceDB ? 'connected' : 'disconnected',
          collection: 'recordingHistory'
        });

        // Check if recordingHistory collection exists
        const recordingHistory = await Database.interfaceDB.chain
          .has('recordingHistory')
          .value();

        if (!recordingHistory) {
          logger.warn('Recording history collection not found', { requestId });
          return res.status(404).json({
            statusCode: 404,
            message: "Recording history collection not found Recording not exists",
            requestId
          });
        }

        const recordings = await Database.interfaceDB.chain
          .get('recordingHistory')
          .cloneDeep()
          .value() || [];

        if (!recordings.length) {
          logger.warn('No recordings found in history', { requestId });
          return res.status(404).json({
            statusCode: 404,
            message: "No recordings found Recording not exists",
            requestId
          });
        }

        const duration = Date.now() - startTime;
        logger.info('Recording history fetched successfully', {
          requestId,
          count: recordings.length,
          duration: `${duration}ms`,
          memoryUsage: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
          },
          firstRecord: recordings[0] ? {
            cameraName: recordings[0].cameraName,
            startTime: recordings[0].startTime,
            status: recordings[0].status
          } : null
        });

        res.json(recordings);
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Error fetching recording history', {
          requestId,
          error: {
            message: error.message,
            name: error.name,
            stack: error.stack
          },
          duration: `${duration}ms`,
          memoryUsage: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
          }
        });
        res.status(500).json({
          error: 'Failed to fetch recording history',
          message: error.message,
          requestId
        });
      }
    }
  ]);

  /**
   * @swagger
   * /api/recordings/status/{cameraName}:
   *   get:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Get recording status for specific camera
   *     parameters:
   *       - in: path
   *         name: cameraName
   *         schema:
   *           type: string
   *         required: true
   *         description: Name of the camera
   *     responses:
   *       200:
   *         description: Successfull
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get('/api/recordings/status/:cameraName', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('recordings:access'),
    async (req, res) => {
      try {
        const { cameraName } = req.params;
        const recordingHistory = await Database.interfaceDB.chain
          .get('recordingHistory')
          .filter(record => record.cameraName === cameraName && record.status === 'recording')
          .value();

        res.json({
          isRecording: recordingHistory.length > 0,
          currentRecording: recordingHistory[0] || null
        });
      } catch (error) {
        logger.error('Error fetching recording status:', error);
        res.status(500).json({ error: 'Failed to fetch recording status' });
      }
    }
  ]);

  /**
   * @swagger
   * /api/recordings/active:
   *   get:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Get active recordings
   *     responses:
   *       200:
   *         description: Successfull
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get('/api/recordings/active', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('recordings:access'),
    async (req, res) => {
      try {
        const activeRecordings = await Database.interfaceDB.chain
          .get('recordingHistory')
          .filter(record => record.status === 'recording')
          .value();

        res.json(activeRecordings);
      } catch (error) {
        logger.error('Error fetching active recordings:', error);
        res.status(500).json({ error: 'Failed to fetch active recordings' });
      }
    }
  ]);

  /**
   * @swagger
   * /api/recordings/thumbnail/{cameraName}/{date}:
   *   get:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Get recording thumbnail
   *     parameters:
   *       - in: path
   *         name: cameraName
   *         schema:
   *           type: string
   *         required: true
   *         description: Name of the camera (e.g. test1)
   *       - in: path
   *         name: date
   *         schema:
   *           type: string
   *         required: true
   *         description: Recording date (YYYY-MM-DD format)
   *     responses:
   *       200:
   *         description: Thumbnail image
   *       404:
   *         description: Video file not found
   *       500:
   *         description: Internal server error
   */
  app.get('/api/recordings/thumbnail/:cameraName/:date', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('recordings:access'),
    async (req, res) => {
      try {
        const { cameraName, date } = req.params;

        // 비디오 파일 경로 생성
        const videoPath = getVideoPath(cameraName, date);
        const thumbnailPath = resolve(THUMBNAIL_DIR, `${cameraName}_${date}.jpg`);

        logger.debug('Processing thumbnail request', {
          cameraName,
          date,
          videoPath,
          thumbnailPath,
          absolutePath: resolve(thumbnailPath)
        });

        // 썸네일이 이미 존재하는지 확인
        if (!fs.existsSync(thumbnailPath)) {
          // 비디오 파일이 존재하는지 확인
          if (!fs.existsSync(videoPath)) {
            logger.warn(`Video directory not found: ${videoPath}`);
            return res.status(404).json({
              error: 'Video file not found',
              path: videoPath
            });
          }

          // 디렉토리에서 첫 번째 비디오 파일 찾기
          const files = fs.readdirSync(videoPath);
          const videoFile = files.find(file => file.endsWith('.mp4') || file.endsWith('.avi'));

          if (!videoFile) {
            logger.warn(`No video files found in directory: ${videoPath}`);
            return res.status(404).json({
              error: 'No video files found',
              path: videoPath
            });
          }

          const fullVideoPath = resolve(videoPath, videoFile);

          // 썸네일 생성
          try {
            await generateThumbnail(fullVideoPath, thumbnailPath);
          } catch (error) {
            logger.error('Error generating thumbnail:', error);
            return res.status(500).json({
              error: 'Failed to generate thumbnail',
              details: error.message
            });
          }
        }

        // 썸네일 파일 전송
        const absoluteThumbnailPath = resolve(thumbnailPath);
        logger.debug('Sending thumbnail file', { absoluteThumbnailPath });
        res.sendFile(absoluteThumbnailPath, {
          headers: {
            'Content-Type': 'image/jpeg'
          }
        });
      } catch (error) {
        logger.error('Error serving thumbnail:', error);
        res.status(500).json({
          error: 'Failed to serve thumbnail',
          details: error.message
        });
      }
    }
  ]);

  /**
   * @swagger
   * /api/recordings/{id}:
   *   get:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Get specific recording by ID
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: string
   *         required: true
   *         description: ID of the recording
   *     responses:
   *       200:
   *         description: Successfull
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Not found
   *       500:
   *         description: Internal server error
   */
  app.get('/api/recordings/:id', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('recordings:access'),
    RecordingsController.getById,
  ]);

  /**
   * @swagger
   * /api/recordings:
   *   post:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Creates new recording
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *          schema:
   *            type: object
   *            properties:
   *              camera:
   *                type: string
   *              trigger:
   *                type: string
   *              type:
   *                type: string
   *     responses:
   *       201:
   *         description: Successfull
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post('/api/recordings', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('notifications:edit'),
    RecordingsValidationMiddleware.hasValidFields,
    RecordingsController.insert,
  ]);

  /**
   * @swagger
   * /api/recordings:
   *   delete:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Remove all recordings
   *     responses:
   *       204:
   *         description: Successfull
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete('/api/recordings', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('recordings:edit'),
    RecordingsController.removeAll,
  ]);

  /**
   * @swagger
   * /api/recordings/{id}:
   *   delete:
   *     tags: [Recordings]
   *     security:
   *       - bearerAuth: []
   *     summary: Delete recording by id
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: string
   *         required: true
   *         description: ID of the recordings
   *     responses:
   *       200:
   *         description: Successfull
   *       400:
   *         description: Bad request
   *       404:
   *         description: Not found
   *       500:
   *         description: Internal server error
   */
  app.delete('/api/recordings/:id', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('recordings:edit'),
    RecordingsController.removeById,
  ]);

  logger.info('Recordings routes initialization completed', {
    timestamp: new Date().toISOString(),
    registeredEndpoints: [
      '/api/recordings',
      '/api/recordings/history',
      '/api/recordings/status/:cameraName',
      '/api/recordings/active',
      '/api/recordings/thumbnail/:cameraName/:date',
      '/api/recordings/:id'
    ]
  });
};
