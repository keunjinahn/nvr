/* eslint-disable unicorn/prevent-abbreviations */
'use-strict';

import * as EventsModel from './events.model.js';

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

