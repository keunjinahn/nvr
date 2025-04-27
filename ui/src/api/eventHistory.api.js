import api from './index';

const resource = '/eventHistory';

export const getEventHistory = async () => {
  const response = await api.get(resource);
  return response.data;
};

export default {
  getEventHistory
}; 
