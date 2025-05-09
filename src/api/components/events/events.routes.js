'use strict';

import * as EventsController from './events.controller.js';
import LoggerService from '../../../services/logger/logger.service.js';
import express, { Router } from 'express';

const router = Router();
const { log } = LoggerService;

// eventHistory CRUD
router.get('/eventHistory', EventsController.getAllEventHistory);
router.get('/eventHistory/:id', EventsController.getEventHistoryById);
router.post('/eventHistory', EventsController.addEventHistory);
router.put('/eventHistory/:id', EventsController.updateEventHistory);
router.delete('/eventHistory/:id', EventsController.deleteEventHistory);

// 이미지 파일 제공 API (POST, body에서 path 받음)
router.post('/image', EventsController.getImageFile);

// EventSetting API
router.get('/eventSetting/:id', EventsController.getEventSetting);
router.get('/eventSetting', EventsController.getEventSetting);
router.post('/eventSetting', EventsController.createEventSetting);
router.put('/eventSetting/:id', EventsController.updateEventSetting);

export default router;

