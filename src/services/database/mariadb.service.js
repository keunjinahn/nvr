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

      // 사용자 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS User (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    permissionLevel INT NOT NULL DEFAULT 1,
                    sessionTimer INT,
                    photo VARCHAR(255),
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);

      // 토큰 테이블
      await conn.query(`
                CREATE TABLE IF NOT EXISTS tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    token VARCHAR(255) UNIQUE NOT NULL,
                    valid BOOLEAN NOT NULL DEFAULT TRUE,
                    userId INT,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (userId) REFERENCES User(id)
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