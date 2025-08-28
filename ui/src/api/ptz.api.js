import api from './index';

const resource = '/ptz';

// PTZ 이동 제어
export const ptzMove = (direction, speed, ip, port) =>
  api.post(`${resource}/move`, { direction, speed, ip, port });

// PTZ 정지
export const ptzStop = (ip, port) =>
  api.post(`${resource}/stop`, { ip, port });

// PTZ 줌 제어
export const ptzZoom = (direction, ip, port) =>
  api.post(`${resource}/zoom`, { direction, ip, port });

// PTZ 포커스 제어
export const ptzFocus = (direction, ip, port) =>
  api.post(`${resource}/focus`, { direction, ip, port });

// PTZ 와이퍼 제어
export const ptzWiper = (action, ip, port) =>
  api.post(`${resource}/wiper`, { action, ip, port });

