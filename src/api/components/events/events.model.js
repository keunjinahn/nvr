import EventHistoryModel from '../../../models/EventHistory.js';
import sequelize from '../../../models/index.js';
import EventSettingModel from '../../../models/EventSetting.js';

const EventHistory = EventHistoryModel(sequelize);
const EventSetting = EventSettingModel(sequelize);

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

export {
  getAllEventHistory,
  getEventHistoryById,
  addEventHistory,
  updateEventHistory,
  deleteEventHistory,
  getEventSetting,
  updateEventSetting,
  createEventSetting
};
