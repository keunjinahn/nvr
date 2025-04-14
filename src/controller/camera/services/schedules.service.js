'use strict';

import { validateSchedule } from '../../../api/components/schedules/schedules.validation.js';
import Database from '../../../api/database.js';
import LoggerService from '../../../services/logger/logger.service.js';

const logger = new LoggerService('Schedules');

class SchedulesService {
  /**
   * Get schedules with optional filters
   * @param {Object} filters - Optional filters for camera_id and isActive
   * @returns {Promise<Array>} Array of schedule objects
   */
  async getSchedules(filters = {}) {
    try {
      let schedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value() || [];

      if (filters.camera_name) {
        schedules = schedules.filter(schedule => schedule.cameraName === filters.camera_name);
      }

      if (filters.isActive !== undefined) {
        schedules = schedules.filter(schedule => schedule.isActive === filters.isActive);
      }

      return schedules;
    } catch (error) {
      logger.error('Error getting schedules:', error);
      throw error;
    }
  }

  /**
   * Create a new schedule
   * @param {Object} scheduleData - Data for new schedule
   * @returns {Promise<Object>} Created schedule
   */
  async createSchedule(scheduleData) {
    try {
      logger.info('Creating schedule with data:', scheduleData);

      const validationError = validateSchedule(scheduleData);
      if (validationError) {
        logger.warn('Schedule validation failed:', {
          error: validationError,
          data: scheduleData
        });
        throw new Error(validationError);
      }

      const schedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value() || [];

      // Generate new ID
      const maxId = schedules.reduce((max, schedule) => Math.max(max, schedule.id || 0), 0);
      const newSchedule = {
        id: maxId + 1,
        ...scheduleData,
        source: scheduleData.source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await Database.interfaceDB.chain.get('schedules').push(newSchedule).value();
      await Database.interfaceDB.write();

      logger.info('Schedule created successfully:', {
        id: newSchedule.id,
        cameraName: newSchedule.cameraName,
        source: newSchedule.source
      });

      return newSchedule;
    } catch (error) {
      logger.error('Failed to create schedule:', error);
      throw error;
    }
  }

  /**
   * Update an existing schedule
   * @param {number} id - Schedule ID
   * @param {Object} scheduleData - Updated schedule data
   * @returns {Promise<Object>} Updated schedule
   */
  async updateSchedule(id, scheduleData) {
    try {
      logger.info('Updating schedule with data:', { id, scheduleData });

      // 전체 schedules 데이터를 가져옴
      let schedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value() || [];
      const scheduleIndex = schedules.findIndex(s => s.id === parseInt(id));

      if (scheduleIndex === -1) {
        throw new Error('Schedule not found');
      }

      const existingSchedule = schedules[scheduleIndex];

      // 기존 데이터와 새로운 데이터를 병합하되, 필드 이름을 올바르게 매핑
      const updatedSchedule = {
        ...existingSchedule,
        cameraName: scheduleData.cameraName,
        days_of_week: scheduleData.days_of_week || scheduleData.days || existingSchedule.days_of_week,
        start_time: scheduleData.start_time || scheduleData.startTime || existingSchedule.start_time,
        end_time: scheduleData.end_time || scheduleData.endTime || existingSchedule.end_time,
        recording_type: scheduleData.recording_type || scheduleData.recordingType || existingSchedule.recording_type,
        isActive: scheduleData.isActive !== undefined ? scheduleData.isActive : existingSchedule.isActive,
        source: scheduleData.source || existingSchedule.source,
        id: parseInt(id),
        updatedAt: new Date().toISOString()
      };

      logger.info('Merged schedule data:', updatedSchedule);

      const validationError = validateSchedule(updatedSchedule);
      if (validationError) {
        logger.warn('Schedule validation failed:', {
          error: validationError,
          data: updatedSchedule
        });
        throw new Error(validationError);
      }

      // 배열에서 해당 스케줄을 업데이트
      schedules[scheduleIndex] = updatedSchedule;

      // 전체 schedules 배열을 다시 저장
      await Database.interfaceDB.chain.set('schedules', schedules).value();
      await Database.interfaceDB.write();

      // 저장 후 데이터 확인
      const savedSchedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value();
      logger.info('Saved schedules after update:', savedSchedules);

      if (!savedSchedules.find(s => s.id === parseInt(id))) {
        throw new Error('Failed to save schedule update');
      }

      logger.info('Schedule updated successfully:', { id, updatedSchedule });
      return updatedSchedule;
    } catch (error) {
      logger.error('Error updating schedule:', error);
      throw error;
    }
  }

  /**
   * Delete a schedule
   * @param {number} id - Schedule ID
   * @returns {Promise<boolean>} True if deletion successful
   */
  async deleteSchedule(id) {
    try {
      logger.info('Attempting to delete schedule:', { id });

      // 전체 schedules 데이터를 가져옴
      let schedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value() || [];

      // ID를 정수로 변환하여 비교
      const parsedId = parseInt(id);
      const scheduleIndex = schedules.findIndex(s => s.id === parsedId);

      if (scheduleIndex === -1) {
        logger.warn('Schedule not found for deletion:', { id: parsedId });
        throw new Error('Schedule not found');
      }

      // 삭제할 스케줄 정보 저장
      const scheduleToDelete = schedules[scheduleIndex];

      // 스케줄 배열에서 해당 스케줄 제거
      schedules.splice(scheduleIndex, 1);

      // 전체 schedules 배열을 다시 저장
      await Database.interfaceDB.chain.set('schedules', schedules).value();
      await Database.interfaceDB.write();

      // 저장 후 데이터 확인
      const savedSchedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value();
      logger.info('Remaining schedules after deletion:', savedSchedules);

      // 삭제된 스케줄이 실제로 제거되었는지 확인
      if (savedSchedules.some(s => s.id === parsedId)) {
        throw new Error('Failed to delete schedule');
      }

      logger.info('Schedule deleted successfully:', {
        id: parsedId,
        deletedSchedule: scheduleToDelete
      });

      return true;
    } catch (error) {
      logger.error('Error deleting schedule:', error);
      throw error;
    }
  }

  /**
   * Toggle schedule active status
   * @param {number} id - Schedule ID
   * @returns {Promise<Object>} Updated schedule
   */
  async toggleSchedule(id) {
    try {
      logger.info('Toggling schedule status for id:', id);

      // 전체 schedules 데이터를 가져옴
      let schedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value() || [];
      const scheduleIndex = schedules.findIndex(s => s.id === parseInt(id));

      if (scheduleIndex === -1) {
        throw new Error('Schedule not found');
      }

      const existingSchedule = schedules[scheduleIndex];
      const updatedSchedule = {
        ...existingSchedule,
        isActive: !existingSchedule.isActive,
        updatedAt: new Date().toISOString()
      };

      // 배열에서 해당 스케줄을 업데이트
      schedules[scheduleIndex] = updatedSchedule;

      // 전체 schedules 배열을 다시 저장
      await Database.interfaceDB.chain.set('schedules', schedules).value();
      await Database.interfaceDB.write();

      // 저장 후 데이터 확인
      const savedSchedules = await Database.interfaceDB.chain.get('schedules').cloneDeep().value();
      logger.info('Saved schedules after toggle:', savedSchedules);

      if (!savedSchedules.find(s => s.id === parseInt(id))) {
        throw new Error('Failed to save schedule toggle');
      }

      logger.info('Schedule status toggled successfully:', {
        id,
        isActive: updatedSchedule.isActive
      });
      return updatedSchedule;
    } catch (error) {
      logger.error('Error toggling schedule status:', error);
      throw error;
    }
  }
}

const schedulesService = new SchedulesService();
export default schedulesService; 