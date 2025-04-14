'use strict';

import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class Schedule extends Model {
    static associate(models) {
      // define associations here if needed
    }
  }

  Schedule.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false
    },
    days: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'Schedule',
    tableName: 'schedules',
    timestamps: true
  });

  return Schedule;
}; 