import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const RecordingHistory = sequelize.define('RecordingHistory', {
    scheduleId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    cameraName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'completed'
    }
  });

  return RecordingHistory;
}; 
