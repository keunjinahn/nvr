'use-strict';

import * as AlertModel from './alerts.model.js';
import AlertSetting from '../../../models/AlertSetting.js';

export const insert = async (req, res) => {
  try {
    await AlertModel.createAlert(req.body);

    res.status(201).send({
      statusCode: 201,
      message: 'Alert created successfully',
    });
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      message: error.message,
    });
  }
};

export const list = async (req, res, next) => {
  try {
    console.log('----------> list');
    const result = await AlertModel.list();

    res.locals.items = result;
    return next();
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      message: error.message,
    });
  }
};

export const getById = async (req, res) => {
  try {
    const alert = await AlertModel.findById(req.params.id);

    if (!alert) {
      return res.status(404).send({
        statusCode: 404,
        message: 'Alert not found',
      });
    }

    res.status(200).send(alert);
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      message: error.message,
    });
  }
};

export const patchById = async (req, res) => {
  try {
    const alert = await AlertModel.findById(req.params.id);

    if (!alert) {
      return res.status(404).send({
        statusCode: 404,
        message: 'Alert not found',
      });
    }

    await AlertModel.updateAlert(req.params.id, req.body);

    res.status(204).send({});
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      message: error.message,
    });
  }
};

export const removeById = async (req, res) => {
  try {
    const alert = await AlertModel.findById(req.params.id);

    if (!alert) {
      return res.status(404).send({
        statusCode: 404,
        message: 'Alert not found',
      });
    }

    await AlertModel.removeById(req.params.id);

    res.status(204).send({});
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      message: error.message,
    });
  }
};

export const getByCamera = async (req, res) => {
  try {
    const alerts = await AlertModel.getAlertsByCamera(req.params.cameraId);

    res.status(200).send(alerts);
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      message: error.message,
    });
  }
};

export const getByStatus = async (req, res) => {
  try {
    const alerts = await AlertModel.getAlertsByStatus(req.params.status);

    res.status(200).send(alerts);
  } catch (error) {
    res.status(500).send({
      statusCode: 500,
      message: error.message,
    });
  }
};

export const getAlertSettings = async (req, res) => {
  try {
    // (예시) userId는 인증정보에서 가져오거나 쿼리/파라미터에서 받음
    const setting = await AlertSetting.findOne();
    res.json({ result: setting });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const saveAlertSettings = async (req, res) => {
  try {
    const { alert_setting_json, fk_user_id } = req.body.settings;
    // console.log('----------> saveAlertSettings', req.body);
    let setting = await AlertSetting.findOne({ where: { fk_user_id } });
    if (setting) {
      // update
      await setting.update({
        alert_setting_json,
        update_date: new Date()
      });
    } else {
      // insert
      setting = await AlertSetting.create({
        alert_setting_json,
        fk_user_id,
        create_date: new Date(),
        update_date: new Date()
      });
    }
    res.json({ result: setting });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export { AlertSetting }; 