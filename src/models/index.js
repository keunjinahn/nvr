'use strict';

import { Sequelize } from 'sequelize';
import config from '../services/database/mariadb.config.js';

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

export default sequelize; 