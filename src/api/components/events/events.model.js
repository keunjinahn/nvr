import EventHistoryModel from '../../../models/EventHistory.js';
import sequelize from '../../../models/index.js';
import EventSettingModel from '../../../models/EventSetting.js';
import EventDetectionZoneModel from '../../../models/EventDetectionZone.js';

const EventHistory = EventHistoryModel(sequelize);
const EventSetting = EventSettingModel(sequelize);
const EventDetectionZone = EventDetectionZoneModel(sequelize);

const getAllEventHistory = async () => {
  return await EventHistory.findAll();
};

const getEventHistoryById = async (id) => {
  return await EventHistory.findByPk(id);
};

const addEventHistory = async (event) => {
  return await EventHistory.create(event);
};

const updateEventHistory = async (id, update) => {
  const event = await EventHistory.findByPk(id);
  if (!event) return null;
  await event.update(update);
  return event;
};

const deleteEventHistory = async (id) => {
  const event = await EventHistory.findByPk(id);
  if (!event) return false;
  await event.destroy();
  return true;
};

// EventSetting CRUD
const getEventSetting = async (id) => {
  if (id) {
    return await EventSetting.findByPk(id);
  } else {
    // 가장 최근 설정 반환 (id 내림차순)
    return await EventSetting.findOne({ order: [['id', 'DESC']] });
  }
};

const updateEventSetting = async (id, update) => {
  const setting = await EventSetting.findByPk(id);
  if (!setting) return null;
  await setting.update(update);
  return setting;
};

const createEventSetting = async (data) => {
  return await EventSetting.create(data);
};

// EventDetectionZone CRUD
const getAllDetectionZones = async () => {
  return await EventDetectionZone.findAll();
};

const getDetectionZoneById = async (id) => {
  return await EventDetectionZone.findByPk(id);
};

const getDetectionZonesByCameraId = async (cameraId) => {
  return await EventDetectionZone.findAll({
    where: { fk_camera_id: cameraId }
  });
};

const addDetectionZone = async (zoneData) => {
  const zone = {
    fk_camera_id: zoneData.cameraId,
    zone_desc: zoneData.description,
    zone_type: zoneData.type,
    zone_segment_json: JSON.stringify(zoneData.regions),
    zone_params_json: JSON.stringify(zoneData.options),
    zone_active: zoneData.active || 0,
    create_date: new Date(),
    update_date: new Date()
  };
  return await EventDetectionZone.create(zone);
};

const updateDetectionZone = async (id, zoneData) => {
  const zone = await EventDetectionZone.findByPk(id);
  if (!zone) return null;

  const updateData = {
    fk_camera_id: zoneData.cameraId,
    zone_desc: zoneData.description,
    zone_type: zoneData.type,
    zone_segment_json: JSON.stringify(zoneData.regions),
    zone_params_json: JSON.stringify(zoneData.options),
    zone_active: zoneData.active || 0,
    update_date: new Date()
  };

  await zone.update(updateData);
  return zone;
};

const deleteDetectionZone = async (id) => {
  const zone = await EventDetectionZone.findByPk(id);
  if (!zone) return false;
  await zone.destroy();
  return true;
};

export {
  getAllEventHistory,
  getEventHistoryById,
  addEventHistory,
  updateEventHistory,
  deleteEventHistory,
  getEventSetting,
  updateEventSetting,
  createEventSetting,
  getAllDetectionZones,
  getDetectionZoneById,
  getDetectionZonesByCameraId,
  addDetectionZone,
  updateDetectionZone,
  deleteDetectionZone
};
