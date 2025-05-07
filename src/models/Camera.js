import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Camera = sequelize.define('Camera', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    motionTimeout: {
      type: DataTypes.INTEGER,
      defaultValue: 15
    },
    recordOnMovement: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    prebuffering: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    videoConfig: {
      type: DataTypes.JSON,
      allowNull: false
    },
    mqtt: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    smtp: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    videoanalysis: {
      type: DataTypes.JSON,
      defaultValue: { active: false }
    },
    prebufferLength: {
      type: DataTypes.INTEGER,
      defaultValue: 4
    }
  });

  return Camera;
}; 
