import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const EventHistory = sequelize.define('EventHistory', {
    eventType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    eventDetailType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    recordingId: {
      type: DataTypes.STRING,
      allowNull: false
    }
  });

  return EventHistory;
}; 
