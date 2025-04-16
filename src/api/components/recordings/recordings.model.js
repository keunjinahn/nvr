'use-strict';

import fs from 'fs-extra';
import moment from 'moment';
import { customAlphabet } from 'nanoid/async';
import path from 'path';

import Cleartimer from '../../../common/cleartimer.js';

import Database from '../../database.js';
import Socket from '../../socket.js';

import {
  getAndStoreSnapshot,
  handleFragmentsRequests,
  storeBuffer,
  storeSnapshotFromVideo,
  storeVideo,
  storeVideoBuffer,
} from '../../../common/ffmpeg.js';

const nanoid = customAlphabet('1234567890abcdef', 10);

export const refresh = async () => {
  return await Database.refreshRecordingsDatabase();
};

export const list = (query) => {
  let recordings = Database.recordingsDB.chain.get('recordings').cloneDeep().value();

  // eslint-disable-next-line unicorn/consistent-function-scoping
  const GetSortOrder = (property) => {
    return (a, b) => {
      if (a[property] < b[property]) {
        return 1;
      } else if (a[property] > b[property]) {
        return -1;
      }
      return 0;
    };
  };

  recordings.sort(GetSortOrder('timestamp'));

  if (moment(query.from, 'YYYY-MM-DD').isValid()) {
    recordings = recordings.filter((recording) => {
      const date = moment.unix(recording.timestamp).format('YYYY-MM-DD');
      const dateMoment = moment(date).set({ hour: 0, minute: 0, second: 1 });

      let fromDate = query.from;
      let toDate = moment(query.to, 'YYYY-MM-DD').isValid() ? query.to : moment();

      if (moment(toDate).isBefore(fromDate)) {
        toDate = query.from;
        fromDate = moment(query.to, 'YYYY-MM-DD').isValid() ? query.to : moment();
      }

      const fromDateMoment = moment(fromDate).set({ hour: 0, minute: 0, second: 0 });
      const toDateMoment = moment(toDate).set({ hour: 23, minute: 59, second: 59 });

      const isBetween = dateMoment.isBetween(fromDateMoment, toDateMoment);

      return isBetween;
    });
  }

  if (query.cameras) {
    const cameras = query.cameras.split(',');
    recordings = recordings.filter((recording) => cameras.includes(recording.camera));
  }

  if (query.labels) {
    const labels = query.labels.split(',');
    recordings = recordings.filter((recording) => labels.includes(recording.label));
  }

  if (query.rooms) {
    const rooms = query.rooms.split(',');
    recordings = recordings.filter((recording) => rooms.includes(recording.room));
  }

  if (query.types) {
    const types = query.types.split(',');
    recordings = recordings.filter((recording) => types.includes(recording.recordType));
  }

  return recordings;
};

export const listByCameraName = (name) => {
  let recordings = Database.recordingsDB.chain.get('recordings').reverse().cloneDeep().value();

  if (recordings) {
    recordings = recordings.filter((rec) => rec.camera === name);
  }

  return recordings;
};

export const findById = (id) => {
  return Database.recordingsDB.chain.get('recordings').find({ id: id }).cloneDeep().value();
};

export const createRecording = async (data, fileBuffer) => {
  const camera = await Database.interfaceDB.chain.get('cameras').find({ name: data.camera }).cloneDeep().value();

  if (!camera) {
    throw new Error('Can not assign recording to camera!');
  }

  const camerasSettings = await Database.interfaceDB.chain.get('settings').get('cameras').cloneDeep().value();
  const recordingsSettings = await Database.interfaceDB.chain.get('settings').get('recordings').cloneDeep().value();

  const cameraSetting = camerasSettings.find((cameraSetting) => cameraSetting && cameraSetting.name === camera.name);

  const id = data.id || (await nanoid());
  const room = cameraSetting ? cameraSetting.room : 'Standard';

  // 시간 정보 생성 (한국 시간 기준으로 통일)
  const nowMoment = moment().tz('Asia/Seoul');
  const recordingTime = {
    timestamp: nowMoment.unix(),
    // 한국 시간으로 파일명 생성 (밀리초 제외, Z 제외, 24시간 형식)
    formattedForFile: nowMoment.format('YYYY-MM-DDTHH-mm-ss'),
    // 표시용 시간 포맷 (24시간 형식)
    formattedForDisplay: nowMoment.format('YYYY-MM-DD HH:mm:ss'),
    dateString: nowMoment.format('YYYY-MM-DD')
  };

  // 파일명 생성 (한국 시간 사용)
  const fileName = `${camera.name}_${recordingTime.formattedForFile}.mp4`;

  const recording = {
    id: id,
    camera: camera.name,
    fileName: fileName,
    name: fileName.replace('.mp4', ''),
    extension: 'mp4',
    recordStoring: true,
    recordType: 'Video',
    trigger: data.trigger,
    room: room,
    time: recordingTime.formattedForDisplay,
    timestamp: recordingTime.timestamp,
    label: (data.label || 'no label').toString(),
    recordingTime: recordingTime  // 녹화 프로세스에 전달할 시간 정보
  };

  // DB에 저장하기 전에 로그로 확인
  logger.info('Creating recording with time info:', {
    fileName,
    formattedTime: recordingTime.formattedForFile,
    displayTime: recordingTime.formattedForDisplay,
    timestamp: recordingTime.timestamp
  });

  if (fileBuffer) {
    await storeVideoBuffer(camera, fileBuffer, data.path, fileName, recordingTime);
    await storeSnapshotFromVideo(camera, data.path, fileName, recording.label);
  } else {
    const isPlaceholder = true;
    const externRecording = false;
    const storeSnapshot = true;

    if (data.imgBuffer) {
      await storeBuffer(camera, data.imgBuffer, data.path, fileName, recording.label, isPlaceholder, externRecording);
    } else {
      await getAndStoreSnapshot(camera, false, data.path, fileName, recording.label, isPlaceholder, storeSnapshot);
    }

    if (camera.prebuffering) {
      let filebuffer = Buffer.alloc(0);
      let generator = handleFragmentsRequests(camera);
      setTimeout(async () => {
        if (generator) {
          generator.throw();
        }
      }, recordingsSettings.timer * 1000);
      for await (const fileBuffer of generator) {
        filebuffer = Buffer.concat([filebuffer, Buffer.concat(fileBuffer)]);
      }
      generator = null;
      await storeVideoBuffer(camera, filebuffer, data.path, fileName, recordingTime);
    } else {
      await storeVideo(camera, data.path, fileName, data.timer, recordingTime);
    }
  }

  // DB에 저장
  Database.recordingsDB.chain.push(recording).value();
  await Database.recordingsDB.write();  // 변경사항 즉시 저장

  Socket.io.emit('recording', recording);
  Cleartimer.setRecording(id, recordingTime.timestamp);
  return recording;
};

export const removeById = async (id) => {
  try {

    // recordingHistory에서 삭제 (문자열 ID로 처리)
    const recordingHistory = await Database.interfaceDB.chain
      .get('recordingHistory')
      .value();

    if (recordingHistory) {
      await Database.interfaceDB.chain
        .get('recordingHistory')
        .remove((rec) => rec.id.toString() === id.toString())
        .value();
    }

    await Database.interfaceDB.write();

    return { success: true, id: id };
  } catch (error) {
    throw new Error(`Failed to remove recording: ${error.message}`);
  }
};

export const removeAll = async () => {
  const recPath = Database.recordingsDB.chain.get('path').cloneDeep().value();

  await fs.emptyDir(recPath);
  Cleartimer.stopRecordings();

  return Database.recordingsDB.chain
    .get('recordings')
    .remove(() => true)
    .value();
};
