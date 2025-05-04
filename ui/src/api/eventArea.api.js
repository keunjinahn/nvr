import api from './index';

const resource = '/eventArea';

export const getEventAreas = () => api.get(resource);
export const getEventAreaById = (id) => api.get(`${resource}/${id}`);
export const addEventArea = (eventArea) => api.post(resource, eventArea);
export const updateEventArea = (id, eventArea) => api.put(`${resource}/${id}`, eventArea);
export const deleteEventArea = (id) => api.delete(`${resource}/${id}`); 
