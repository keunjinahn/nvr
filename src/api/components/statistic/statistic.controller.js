import VideoReceiveData from '../../../models/VideoReceiveData.js';
import { Op, fn, col, literal } from 'sequelize';

export const getRealtimeTemp = async (req, res) => {
  try {
    const { cameraId } = req.query;
    const where = {};
    if (cameraId) where.fk_camera_id = cameraId;

    // 현재 시간에서 1분 전 시간 계산
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    where.create_date = {
      [Op.gte]: oneMinuteAgo
    };

    const rows = await VideoReceiveData.findAll({
      where,
      order: [['create_date', 'DESC']]
    });
    rows.reverse();
    const result = rows.map(row => {
      const v = row.getDataValue('data_value') || {};
      return {
        time: row.getDataValue('create_date'),
        rois: Array.from({ length: 10 }, (_, i) => v[`data_${22 + i * 2}`] ?? null),
        min: v.data_19 ?? null,
        max: v.data_20 ?? null,
        avg: v.data_21 ?? null,
      };
    });
    res.json({ result });
  } catch (e) {
    console.error('Error in getRealtimeTemp:', e);
    res.status(500).json({ error: e.message });
  }
};

export const getDailyRoiAvgTemp = async (req, res) => {
  try {
    const { cameraId } = req.query;
    const where = {};
    // 오늘 날짜의 시작과 끝 시간 설정
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    console.log(today, tomorrow)
    const oneDay = new Date(Date.now() - 60 * 60 * 24 * 1000);
    where.create_date = {
      [Op.gte]: oneDay
    };

    const rows = await VideoReceiveData.findAll({
      where,
      attributes: [
        'data_value',
        [fn('DATE', col('create_date')), 'date']
      ],
      order: [['create_date', 'ASC']]
    });

    // ROI별 온도 데이터 추출 및 평균 계산
    const roiTemps = Array.from({ length: 10 }, () => []);

    rows.forEach(row => {
      const dataValue = row.getDataValue('data_value');
      if (dataValue) {
        for (let i = 0; i < 10; i++) {
          const temp = dataValue[`data_${22 + i * 2}`];
          if (temp !== null && temp !== undefined) {
            roiTemps[i].push(temp);
          }
        }
      }
    });

    // 각 ROI의 평균 온도 계산
    const result = roiTemps.map((temps, index) => {
      const validTemps = temps.filter(temp => temp !== null && temp !== undefined);
      const avgTemp = validTemps.length > 0
        ? validTemps.reduce((sum, temp) => sum + temp, 0) / validTemps.length
        : null;

      return {
        roi: `ROI${index + 1}`,
        averageTemp: avgTemp !== null ? Number(avgTemp.toFixed(1)) : null,
        dataCount: validTemps.length
      };
    });

    res.json({
      result,
      date: today.toISOString().split('T')[0],
      totalDataPoints: rows.length
    });
  } catch (e) {
    console.error('Error in getDailyRoiAvgTemp:', e);
    res.status(500).json({ error: e.message });
  }
};

export const getDailyRoiMinChange = async (req, res) => {
  try {
    const { cameraId } = req.query;
    const where = {};
    if (cameraId) where.fk_camera_id = cameraId;

    const oneDay = new Date(Date.now() - 60 * 60 * 24 * 1000);
    where.create_date = {
      [Op.gte]: oneDay
    };
    const rows = await VideoReceiveData.findAll({
      where,
      attributes: ['data_value'],
      order: [['create_date', 'ASC']]
    });

    // // 데이터가 없으면 빈 배열 반환
    // if (rows.length === 0) {
    //   return res.json({ result: [] });
    // }

    // ROI별 온도 데이터 추출
    const roiTemps = Array.from({ length: 10 }, () => []);

    rows.forEach(row => {
      const dataValue = row.getDataValue('data_value');
      if (dataValue) {
        for (let i = 0; i < 10; i++) {
          const temp = dataValue[`data_${22 + i * 2}`];
          if (temp !== null && temp !== undefined) {
            roiTemps[i].push(temp);
          }
        }
      }
    });

    // 각 ROI의 평균, 최소, 변화율 계산
    let result = roiTemps.map((temps, index) => {
      const validTemps = temps.filter(temp => temp !== null && temp !== undefined);
      const avgTemp = validTemps.length > 0
        ? validTemps.reduce((sum, temp) => sum + temp, 0) / validTemps.length
        : null;
      const minTemp = validTemps.length > 0
        ? Math.min(...validTemps)
        : null;
      const changeRate = (avgTemp && minTemp !== null)
        ? Number((((avgTemp - minTemp) / avgTemp) * 100).toFixed(1))
        : null;
      return {
        roi: `ROI${index + 1}`,
        averageTemp: avgTemp !== null ? Number(avgTemp.toFixed(1)) : null,
        minTemp: minTemp !== null ? Number(minTemp.toFixed(1)) : null,
        changeRate
      };
    });

    // 변화율 내림차순 정렬
    result = result
      .map((item, idx) => ({ ...item, no: idx + 1 }))
      .sort((a, b) => (b.changeRate ?? -Infinity) - (a.changeRate ?? -Infinity))
      .map((item, idx) => ({ ...item, no: idx + 1 }));

    res.json({ result });
  } catch (e) {
    console.error('Error in getDailyRoiMinChange:', e);
    res.status(500).json({ error: e.message });
  }
}; 