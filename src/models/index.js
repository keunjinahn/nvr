'use strict';

import { Sequelize } from 'sequelize';
import config from '../services/database/mariadb.config.js';
import Camera from './Camera.js';
import ScheduleModel from './schedule.js';

const sequelize = new Sequelize(
  config.config.database,
  config.config.user,
  config.config.password,
  {
    host: config.config.host,
    dialect: 'mariadb',
    port: config.config.port,
    logging: false,
  }
);

// 모델 초기화
const models = {
  Camera,
  Schedule: ScheduleModel(sequelize)
};

// 관계 초기화
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

export { sequelize, models };
export default sequelize; 