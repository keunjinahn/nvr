import api from './index';

const resource = '/users';

export const addUser = async (userData) => await api.post(resource, userData);

export const changeUser = async (userId, userData) => await api.patch(`${resource}/${userId}`, userData);

export const getUser = async (userId) => await api.get(`${resource}/${userId}`);

export const getUsers = async (parameters) => await api.get(`${resource}${parameters ? parameters : ''}`);

export const removeUser = async (userId) => await api.delete(`${resource}/${userId}`);

export const getUserAccessHistory = async (userId, parameters) => await api.get(`${resource}/access-history${parameters ? parameters : ''}`);
