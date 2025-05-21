import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Schedule = sequelize.define('Schedule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    fk_camera_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    cameraName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    days_of_week: {
      type: DataTypes.STRING(255),
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('days_of_week');
        return rawValue ? JSON.parse(rawValue) : [];
      },
      set(val) {
        this.setDataValue('days_of_week', JSON.stringify(val));
      }
    },
    start_time: {
      type: DataTypes.STRING(5),
      allowNull: true
    },
    end_time: {
      type: DataTypes.STRING(5),
      allowNull: true
    },
    recording_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    isActive: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    source: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: ''
    },
    create_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    update_date: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'tb_schedules',
    timestamps: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_general_ci'
  });

  return Schedule;
}; 