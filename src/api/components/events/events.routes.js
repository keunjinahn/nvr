'use strict';

import * as EventsController from './events.controller.js';
import LoggerService from '../../../services/logger/logger.service.js';
import express from 'express';

const router = express.Router();
const { log } = LoggerService;

// eventHistory CRUD
router.get('/eventHistory', EventsController.getAllEventHistory);
router.get('/eventHistory/:id', EventsController.getEventHistoryById);
router.post('/eventHistory', EventsController.addEventHistory);
router.put('/eventHistory/:id', EventsController.updateEventHistory);
router.delete('/eventHistory/:id', EventsController.deleteEventHistory);

export default router;

