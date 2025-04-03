import mariadbConfig from './mariadb.config.js';
import LoggerService from '../logger/logger.service.js';

const { log } = LoggerService;
const { pool, config } = mariadbConfig;

export class MariaDBService {
  async initializeTables() {
    if (!config.enabled) {
      return;
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query(`USE ${config.database}`);

      // 카메라 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS cameras (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    room VARCHAR(255),
                    config JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

      // 알림 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id VARCHAR(36) PRIMARY KEY,
                    type VARCHAR(50),
                    message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

      // 사용자 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(36) PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    permission_level JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

      log.info('Tables initialized successfully');
    } catch (error) {
      log.error('Error initializing tables:', error);
      throw error;
    } finally {
      if (conn) await conn.release();
    }
  }

  async syncData(tableName, data) {
    if (!config.enabled || !data) {
      return;
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query(`USE ${config.database}`);

      // 기존 데이터 삭제
      await conn.query(`DELETE FROM ${tableName}`);

      if (data.length > 0) {
        // 테이블별 컬럼 매핑
        const columnMapping = {
          cameras: {
            columns: ['id', 'name', 'room', 'videoConfig', 'settings', 'created_at', 'updated_at'],
            placeholders: '(?, ?, ?, ?, ?, NOW(), NOW())'
          },
          notifications: {
            columns: ['id', 'camera_id', 'type', 'message', 'created_at'],
            placeholders: '(?, ?, ?, ?, NOW())'
          },
          users: {
            columns: ['id', 'username', 'password', 'permission_level', 'created_at', 'updated_at'],
            placeholders: '(?, ?, ?, ?, NOW(), NOW())'
          },
          recordings: {
            columns: ['id', 'camera_id', 'file_path', 'type', 'created_at'],
            placeholders: '(?, ?, ?, ?, NOW())'
          },
          settings: {
            columns: ['id', 'category', 'settings', 'created_at', 'updated_at'],
            placeholders: '(?, ?, ?, NOW(), NOW())'
          }
        };

        const mapping = columnMapping[tableName];
        if (!mapping) {
          throw new Error(`Unknown table: ${tableName}`);
        }

        // 데이터 삽입
        const values = data.map(item => {
          switch (tableName) {
            case 'cameras':
              return [
                item.id,
                item.name,
                item.room,
                JSON.stringify(item.videoConfig),
                JSON.stringify(item.settings)
              ];
            case 'notifications':
              return [
                item.id,
                item.camera_id,
                item.type,
                item.message
              ];
            case 'users':
              return [
                item.id,
                item.username,
                item.password,
                JSON.stringify(item.permission_level)
              ];
            case 'recordings':
              return [
                item.id,
                item.camera_id,
                item.file_path,
                item.type
              ];
            case 'settings':
              return [
                item.id,
                item.category,
                JSON.stringify(item.settings)
              ];
            default:
              throw new Error(`Unknown table: ${tableName}`);
          }
        });

        const query = `
                    INSERT INTO ${tableName} 
                    (${mapping.columns.join(', ')})
                    VALUES ${mapping.placeholders}
                `;

        // 배치 삽입 수행
        for (const value of values) {
          await conn.query(query, value);
        }
      }

      log.info(`Successfully synced data to ${tableName}`);
    } catch (error) {
      log.error(`Error syncing data to ${tableName}:`, error);
      throw error;
    } finally {
      if (conn) await conn.release();
    }
  }

  async getData(tableName) {
    if (!config.enabled) {
      return [];
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query(`USE ${config.database}`);

      const results = await conn.query(`SELECT * FROM ${tableName}`);
      return results;
    } catch (error) {
      log.error(`Error getting data from ${tableName}:`, error);
      throw error;
    } finally {
      if (conn) await conn.release();
    }
  }
}