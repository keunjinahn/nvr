import api from './index';

const resource = '/recordings';

export const getRecordingHistory = async () => {
  const response = await api.get(`${resource}/history`);
  return response.data;
};

export const getVideoThumbnail = async (recordingId) => {
  try {
    console.log(`Requesting thumbnail for recording ID: ${recordingId}`);
    const response = await api.get(`${resource}/thumbnail/${recordingId}`, {
      responseType: 'blob'
    });
    console.log(`Thumbnail response status: ${response.status}`);

    if (response.status === 200) {
      const blob = new Blob([response.data], { type: 'image/png' });
      const thumbnailUrl = URL.createObjectURL(blob);
      console.log(`Generated thumbnail URL: ${thumbnailUrl}`);
      return thumbnailUrl;
    } else {
      console.error(`Failed to fetch thumbnail. Status: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching thumbnail:', error.message);
    return null;
  }
};

export const getRecordingStatus = async (cameraName) => {
  const response = await api.get(`${resource}/status/${cameraName}`);
  return response.data;
};

export const getActiveRecordings = async () => {
  const response = await api.get(`${resource}/active`);
  return response.data;
};

export default {
  getRecordingHistory,
  getVideoThumbnail,
  getRecordingStatus,
  getActiveRecordings
}; 
