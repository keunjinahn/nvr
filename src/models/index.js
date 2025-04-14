'use strict';

import { Sequelize } from 'sequelize';
import scheduleModel from './schedule.js';

const env = process.env.NODE_ENV || 'development';
const config = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nvr_db',
  host: process.env.DB_HOST || '127.0.0.1',
  dialect: 'mysql',
  logging: false
};

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  config
);

const db = {
  Schedule: scheduleModel(sequelize),
  sequelize,
  Sequelize
};

Object.values(db).forEach(model => {
  if (model.associate) {
    model.associate(db);
  }
});

export default db; 