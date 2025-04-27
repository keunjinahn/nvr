import Database from '../../database.js';
import lodash from 'lodash';

const getAllEventHistory = async () => {
  await Database.interfaceDB.read();
  return Database.interfaceDB.data.eventHistory || [];
};

const getEventHistoryById = async (id) => {
  await Database.interfaceDB.read();
  return (Database.interfaceDB.data.eventHistory || []).find(e => e.id === id) || null;
};

const addEventHistory = async (event) => {
  await Database.interfaceDB.read();
  if (!Database.interfaceDB.data.eventHistory) Database.interfaceDB.data.eventHistory = [];
  Database.interfaceDB.data.eventHistory.push(event);
  await Database.interfaceDB.write();
  return event;
};

const updateEventHistory = async (id, update) => {
  await Database.interfaceDB.read();
  const idx = (Database.interfaceDB.data.eventHistory || []).findIndex(e => e.id === id);
  if (idx === -1) return null;
  Database.interfaceDB.data.eventHistory[idx] = {
    ...Database.interfaceDB.data.eventHistory[idx],
    ...update,
    id // id는 변경 불가
  };
  await Database.interfaceDB.write();
  return Database.interfaceDB.data.eventHistory[idx];
};

const deleteEventHistory = async (id) => {
  await Database.interfaceDB.read();
  const before = Database.interfaceDB.data.eventHistory.length;
  Database.interfaceDB.data.eventHistory = (Database.interfaceDB.data.eventHistory || []).filter(e => e.id !== id);
  await Database.interfaceDB.write();
  return Database.interfaceDB.data.eventHistory.length < before;
};

export {
  getAllEventHistory,
  getEventHistoryById,
  addEventHistory,
  updateEventHistory,
  deleteEventHistory
};
