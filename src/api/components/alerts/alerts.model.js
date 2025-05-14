'use-strict';

import AlertHistory from '../../../models/AlertHistory.js';

export const list = async (options = {}) => {
  return await AlertHistory.findAll({
    order: [['alert_accur_time', 'DESC']],
    ...options
  });
};

export const findById = async (id) => {
  return await AlertHistory.findOne({ where: { id } });
};

export const createAlert = async (alertData) => {
  const alert = {
    fk_camera_id: alertData.fk_camera_id,
    alert_accur_time: alertData.alert_accur_time || new Date(),
    alert_type: alertData.alert_type,
    alert_level: alertData.alert_level,
    alert_status: alertData.alert_status || 'NEW',
    fk_detect_zone_id: alertData.fk_detect_zone_id || 0,
    fk_process_user_id: alertData.fk_process_user_id || 0,
    alert_process_time: alertData.alert_process_time,
    alert_description: alertData.alert_description,
    create_date: new Date(),
    update_date: new Date()
  };

  return await AlertHistory.create(alert);
};

export const updateAlert = async (id, alertData) => {
  const alert = await AlertHistory.findOne({ where: { id } });
  if (!alert) return null;

  alertData.update_date = new Date();
  return await alert.update(alertData);
};

export const removeById = async (id) => {
  return await AlertHistory.destroy({ where: { id } });
};

export const getAlertsByCamera = async (cameraId) => {
  return await AlertHistory.findAll({
    where: { fk_camera_id: cameraId },
    order: [['alert_accur_time', 'DESC']]
  });
};

export const getAlertsByStatus = async (status) => {
  return await AlertHistory.findAll({
    where: { alert_status: status },
    order: [['alert_accur_time', 'DESC']]
  });
}; 