import { DataTypes } from 'sequelize';
import sequelize from '../database/config.js';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  permissionLevel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  sessionTimer: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  photo: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'User',
  timestamps: true
});

export default User; 