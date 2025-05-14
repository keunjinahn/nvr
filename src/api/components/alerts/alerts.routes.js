'use-strict';

import * as AlertsController from './alerts.controller.js';

import * as PaginationMiddleware from '../../middlewares/pagination.middleware.js';
import * as PermissionMiddleware from '../../middlewares/auth.permission.middleware.js';
import * as ValidationMiddleware from '../../middlewares/auth.validation.middleware.js';

/**
 * @swagger
 * tags:
 *  name: Alerts
 */

export const routesConfig = (app) => {
  /**
   * @swagger
   * /api/alerts:
   *   get:
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     summary: Get all alerts
   *     parameters:
   *       - in: query
   *         name: start
   *         schema:
   *           type: number
   *         description: Start index
   *       - in: query
   *         name: page
   *         schema:
   *           type: number
   *         description: Page
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: number
   *         description: Page size
   *     responses:
   *       200:
   *         description: Successful
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get('/api/alerts', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('alerts:access'),
    AlertsController.list,
    PaginationMiddleware.pages,
  ]);

  /**
   * @swagger
   * /api/alerts:
   *   post:
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     summary: Create new alert
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *          schema:
   *            type: object
   *            properties:
   *              fk_camera_id:
   *                type: integer
   *              alert_type:
   *                type: string
   *              alert_level:
   *                type: string
   *              alert_status:
   *                type: string
   *              alert_description:
   *                type: string
   *     responses:
   *       201:
   *         description: Successful
   *       400:
   *         description: Bad request
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post('/api/alerts', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('alerts:create'),
    AlertsController.insert,
  ]);

  /**
   * @swagger
   * /api/alerts/{id}:
   *   get:
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     summary: Get specific alert by id
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: integer
   *         required: true
   *         description: ID of the alert
   *     responses:
   *       200:
   *         description: Successful
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Not found
   *       500:
   *         description: Internal server error
   */
  app.get('/api/alerts/:id', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('alerts:access'),
    AlertsController.getById,
  ]);

  /**
   * @swagger
   * /api/alerts/{id}:
   *   patch:
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     summary: Update alert by id
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: integer
   *         required: true
   *         description: ID of the alert
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *          schema:
   *            type: object
   *            properties:
   *              alert_status:
   *                type: string
   *              fk_process_user_id:
   *                type: integer
   *              alert_process_time:
   *                type: string
   *              alert_description:
   *                type: string
   *     responses:
   *       204:
   *         description: Successful
   *       400:
   *         description: Bad request
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Not found
   *       500:
   *         description: Internal server error
   */
  app.patch('/api/alerts/:id', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('alerts:update'),
    AlertsController.patchById,
  ]);

  /**
   * @swagger
   * /api/alerts/{id}:
   *   delete:
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     summary: Delete alert by id
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: integer
   *         required: true
   *         description: ID of the alert
   *     responses:
   *       204:
   *         description: Successful
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Not found
   *       500:
   *         description: Internal server error
   */
  app.delete('/api/alerts/:id', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('alerts:delete'),
    AlertsController.removeById,
  ]);

  /**
   * @swagger
   * /api/alerts/camera/{cameraId}:
   *   get:
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     summary: Get alerts by camera ID
   *     parameters:
   *       - in: path
   *         name: cameraId
   *         schema:
   *           type: integer
   *         required: true
   *         description: ID of the camera
   *     responses:
   *       200:
   *         description: Successful
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get('/api/alerts/camera/:cameraId', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('alerts:access'),
    AlertsController.getByCamera,
  ]);

  /**
   * @swagger
   * /api/alerts/status/{status}:
   *   get:
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     summary: Get alerts by status
   *     parameters:
   *       - in: path
   *         name: status
   *         schema:
   *           type: string
   *         required: true
   *         description: Status of the alert
   *     responses:
   *       200:
   *         description: Successful
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get('/api/alerts/status/:status', [
    ValidationMiddleware.validJWTNeeded,
    PermissionMiddleware.minimumPermissionLevelRequired('alerts:access'),
    AlertsController.getByStatus,
  ]);

  const routes = app._router.stack
    .filter(r => r.route)
    .map(r => ({
      path: r.route.path,
      method: Object.keys(r.route.methods)[0].toUpperCase()
    }));
  console.log('Registered alert routes:', routes);
}; 