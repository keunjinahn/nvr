/* eslint-disable unicorn/prevent-abbreviations */
'use-strict';

import * as EventsModel from './events.model.js';
import path from 'path';
import fs from 'fs';

export const getAllEventHistory = async (req, res) => {
  try {
    const data = await EventsModel.getAllEventHistory();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getEventHistoryById = async (req, res) => {
  try {
    const data = await EventsModel.getEventHistoryById(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const addEventHistory = async (req, res) => {
  try {
    const event = req.body;
    if (!event.id) {
      return res.status(400).json({ error: 'id is required' });
    }
    const result = await EventsModel.addEventHistory(event);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateEventHistory = async (req, res) => {
  try {
    const result = await EventsModel.updateEventHistory(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteEventHistory = async (req, res) => {
  try {
    const result = await EventsModel.deleteEventHistory(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 이미지 파일 제공 API
export const getImageFile = (req, res) => {
  let filePath = req.body.path;
  console.log('[getImageFile] process.cwd():', process.cwd());
  if (!filePath) {
    console.log('[getImageFile] No path specified');
    return res.status(400).send('No path specified');
  }
  // filePath에서 ../ 제거
  filePath = filePath.replace(/\.\.\//g, '');
  const absPath = path.resolve(filePath);
  console.log('[getImageFile] absPath:', absPath);
  fs.access(absPath, fs.constants.R_OK, (err) => {
    if (err) {
      console.log(`[getImageFile] File not found: ${absPath}`);
      return res.status(404).send('File not found');
    }
    // 파일이 존재하면 크기와 데이터 확인
    fs.stat(absPath, (err, stats) => {
      if (err) {
        console.log(`[getImageFile] fs.stat error: ${err}`);
      } else {
        console.log(`[getImageFile] File exists: ${absPath}, size: ${stats.size} bytes`);
        if (stats.size === 0) {
          console.log('[getImageFile] File is empty');
        } else {
          // 파일 데이터 일부 읽어서 로그
          fs.readFile(absPath, (err, data) => {
            if (err) {
              console.log(`[getImageFile] fs.readFile error: ${err}`);
            } else {
              console.log(`[getImageFile] File read success, data length: ${data.length}`);
            }
            // 파일 전송
            res.sendFile(absPath);
          });
          return;
        }
      }
      // 파일 전송 (빈 파일이거나 stat 에러)
      res.sendFile(absPath);
    });
  });
};

export const getEventSetting = async (req, res) => {
  try {
    const id = req.params.id;
    const data = await EventsModel.getEventSetting(id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateEventSetting = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await EventsModel.updateEventSetting(id, req.body);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createEventSetting = async (req, res) => {
  try {
    const result = await EventsModel.createEventSetting(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

