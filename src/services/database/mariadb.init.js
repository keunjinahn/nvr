// src/services/database/mariadb.init.js
import mariadbConfig from './mariadb.config.js';
import LoggerService from '../../services/logger/logger.service.js';

const { log } = LoggerService;
const { pool, config } = mariadbConfig;

export class MariaDBInit {
  static async initializeDatabase() {
    if (!config.enabled) {
      log.info('MariaDB is not enabled, skipping initialization1');
      return;
    }

    let conn;
    try {
      // 연결 테스트
      const isConnected = await config.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to MariaDB');
      }

      conn = await pool.getConnection();

      // 데이터베이스 생성
      await conn.query(`
                CREATE DATABASE IF NOT EXISTS ${config.database}
                CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            `);

      // 데이터베이스 선택
      await conn.query(`USE ${config.database}`);

      // 테이블 생성
      await this.createTables(conn);

      log.info('MariaDB database initialized successfully');
    } catch (error) {
      log.error('Error initializing MariaDB database:', error);
      throw error;
    } finally {
      if (conn) await conn.release();
    }
  }

  static async createTables(conn) {
    try {
      log.info('Starting table creation...');

      // 카메라 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS cameras (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    room VARCHAR(255),
                    videoConfig JSON,
                    settings JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);

      // 알림 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id VARCHAR(36) PRIMARY KEY,
                    camera_id INT,
                    type VARCHAR(50),
                    message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
                )
            `);

      // 사용자 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(36) PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    permission_level JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);

      // 녹화 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS recordings (
                    id VARCHAR(36) PRIMARY KEY,
                    camera_id INT,
                    file_path VARCHAR(255),
                    type VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
                )
            `);

      // 설정 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS settings (
                    id VARCHAR(36) PRIMARY KEY,
                    category VARCHAR(50),
                    settings JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);

      log.info('All tables created successfully');
    } catch (error) {
      log.error('Error creating tables:', error);
      throw error;
    }
  }

  static async resetDatabase() {
    if (!config.enabled) {
      log.info('MariaDB is not enabled, skipping reset');
      return;
    }

    let conn;
    try {
      conn = await pool.getConnection();

      // 기존 테이블 삭제 (외래 키 제약 조건을 고려한 순서)
      await conn.query('DROP TABLE IF EXISTS notifications');
      await conn.query('DROP TABLE IF EXISTS recordings');
      await conn.query('DROP TABLE IF EXISTS cameras');
      await conn.query('DROP TABLE IF EXISTS users');
      await conn.query('DROP TABLE IF EXISTS settings');

      // 테이블 재생성
      await this.createTables(conn);

      log.info('MariaDB database reset successfully');
    } catch (error) {
      log.error('Error resetting MariaDB database:', error);
      throw error;
    } finally {
      if (conn) await conn.release();
    }
  }
}