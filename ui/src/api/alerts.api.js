import api from './index';

const resource = '/alerts';

export const addAlert = async (alertData) => await api.post(resource, alertData);

export const changeAlert = async (alertId, alertData) => await api.patch(`${resource}/${alertId}`, alertData);

export const getAlert = async (alertId) => await api.get(`${resource}/${alertId}`);

export const getAlerts = async (parameters) => await api.get(`${resource}${parameters ? parameters : ''}`);

export const removeAlert = async (alertId) => await api.delete(`${resource}/${alertId}`);

export const getAlertsByCamera = async (cameraId) => await api.get(`${resource}/camera/${cameraId}`);

export const getAlertsByStatus = async (status) => await api.get(`${resource}/status/${status}`);

export const updateAlertStatus = async (alertId, status, processUserId) => {
  return await api.patch(`${resource}/${alertId}`, {
    alert_status: status,
    fk_process_user_id: processUserId,
    alert_process_time: new Date().toISOString()
  });
};

export const completeAlert = async (alertId, processUserId, description) => {
  return await api.patch(`${resource}/${alertId}`, {
    alert_status: 'COMPLETED',
    fk_process_user_id: processUserId,
    alert_process_time: new Date().toISOString(),
    alert_description: description
  });
}; 
