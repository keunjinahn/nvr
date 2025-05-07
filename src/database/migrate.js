import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../models/User.js';
import Token from '../models/Token.js';
import sequelize from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');

    // Disable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    // Delete existing data
    await Token.destroy({ where: {}, truncate: true });
    await User.destroy({ where: {}, truncate: true });
    console.log('Existing data cleared successfully');

    // Enable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

    // Read database.json
    const dbData = JSON.parse(readFileSync(join(__dirname, '../../test/camera.ui/database/database.json'), 'utf8'));

    // Migrate users
    if (dbData.users && Array.isArray(dbData.users)) {
      for (const user of dbData.users) {
        // Convert permissionLevel from array to integer if needed
        const permissionLevel = Array.isArray(user.permissionLevel)
          ? user.permissionLevel.includes('admin') ? 2 : 1
          : user.permissionLevel;

        await User.create({
          username: user.username,
          password: user.password,
          permissionLevel: permissionLevel,
          sessionTimer: user.sessionTimer || 14400,
          photo: user.photo || 'no_img.png'
        });
      }
      console.log('Users migrated successfully');
    } else {
      console.log('No users found in database.json');
    }

    // Migrate tokens if they exist
    if (dbData.tokens) {
      for (const token of dbData.tokens) {
        await Token.create({
          token: token.token,
          valid: token.valid
        });
      }
      console.log('Tokens migrated successfully');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    if (error.original) {
      console.error('Database Error Details:');
      console.error('Message:', error.original.sqlMessage);
      console.error('Error Code:', error.original.code);
      console.error('SQL State:', error.original.sqlState);
    }
  } finally {
    // Make sure foreign key checks are enabled even if there's an error
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    await sequelize.close();
  }
}

migrate(); 
