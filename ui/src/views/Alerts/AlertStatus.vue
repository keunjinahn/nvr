<template lang="pug">
.alert-status-container
  .left-sidebar
    .time-layer
      .location-info {{ location_info }}
      .current-time {{ currentTime }}
    .alert-history-layer
      .layer-title
        | 경보 이력
        v-btn(
          icon
          :color="autoRefreshAlertHistory ? 'primary' : 'grey'"
          @click="toggleAlertHistoryRefresh"
          class="ml-2"
          small
        )
          v-icon {{ icons.mdiRefresh }}
      .alert-history-content
        .alert-history-table
          .table-row(
            v-for="(alert, index) in alertHistory" 
            :key="alert.id"
            :class="getAlertRowClass(alert, index)"
            @click="selectAlert(index)"
          )
            .table-item
              .item-label 최고온도
              .item-value {{ alert.maxTemp }}°C
            .table-item
              .item-label 최소온도
              .item-value {{ alert.minTemp }}°C
            .table-item
              .item-label 평균온도
              .item-value {{ (Number(alert.maxTemp) + Number(alert.minTemp)) / 2 | toFixed(2) }}°C
            .table-item
              .item-label 경보단계
              .item-value {{ getLevelText(alert.level) }}
            .table-item
              .item-label 측정시간
              .item-value {{ alert.time }}

  .center-content
    .top-image-box
      .box-title 열화상 이미지 분석 결과({{ currentTime }})
      .image-container
        img.thermal-image(
          v-if="thermalImageSrc"
          :src="thermalImageSrc"
          alt="열화상 이미지"
        )
        .thermal-image-placeholder(v-else)
          .placeholder-text 열화상 이미지
          .placeholder-subtext (DB에서 base64 이미지 로드 예정)
    .bottom-image-box
      .box-title 실화상 이미지
      .image-container
        img.visual-image(
          v-if="visualImageSrc"
          :src="visualImageSrc"
          alt="실화상 이미지"
        )
        .visual-image-placeholder(v-else)
          .placeholder-text 실화상 이미지
          .placeholder-subtext (DB에서 base64 이미지 로드 예정)

  .right-sidebar
    .gauge-box
      .box-title 현재 경보단계
      .gauge-container
        .gauge-meter(ref="gaugeChart")
    
    .chart-box
      .box-title 최근 7일 경보 발령 수
      .chart-container
        div(ref="alertChart" style="width:100%;height:200px;min-width:200px;min-height:200px;")
    
    .history-box
      .box-title 경보 발생(누수) 날짜 및 시간 이력
      .alert-table
        .table-header
          .header-cell 경보레벨
          .header-cell 발생일자
        .table-body
          .table-row(v-for="alert in alertHistory" :key="alert.id")
            .table-cell {{ getLevelText(alert.level) }}
            .table-cell {{ alert.time }}
</template>
  
<script>
import { 
  mdiRefresh
} from '@mdi/js';
import { getCameras, getCameraSettings } from '@/api/cameras.api';
import { getAlerts, getRecentAlertCounts } from '@/api/alerts.api';
import VideoCard from '@/components/camera-card.vue';
import socket from '@/mixins/socket';
import * as echarts from 'echarts';

export default {
  name: 'NotificationStatus',

  components: {
    VideoCard
  },

  mixins: [socket],

  data: () => ({
    icons: {
      mdiRefresh
    },
    loading: false,
    cameras: [],
    selectedCameraIndex: null,
    videoKey: 0,
    currentAlertLevel: '대기',
    alertChart: null,
    gaugeChart: null,
    alertCount: 4,
    alertHistory: [],
    env: process.env.NODE_ENV,
    alertRefreshTimer: null,
    autoRefreshAlertHistory: true,
    currentTime: '',
    timeInterval: null,
    location_info: '수자원공사 섬진강댐',
    thermalImageSrc: null,
    visualImageSrc: null,
    selectedAlertIndex: 0,
    siteDetails: {
      maxTemp: '46.24',
      minTemp: '19.73',
      avgTemp: '41.31',
      alertLevel: '4',
      measurementTime: '2025-07-09 15:40:00'
    }
  }),

  computed: {
    selectedCamera() {
      return this.selectedCameraIndex !== null && this.cameras.length > 0 
        ? this.cameras[this.selectedCameraIndex] 
        : null;
    }
  },
  
  filters: {
    toFixed(value, decimals) {
      if (isNaN(value)) return '0.00';
      return Number(value).toFixed(decimals);
    }
  },

  watch: {
    cameras: {
      immediate: true,
      handler(newCameras) {
        console.log('Cameras changed:', {
          length: newCameras.length,
          cameras: newCameras
        });
      }
    }
  },

  async created() {
    console.log('Component created');
    if (this.$sidebar) this.$sidebar.close();
    this.updateTime();
    this.timeInterval = setInterval(this.updateTime, 1000);
    await this.initializeData();
    await this.loadAlertHistory();
  },

  mounted() {
    console.log('Component mounted, cameras:', this.cameras);
    this.$socket.client.on('connect', this.handleSocketConnect);
    this.$nextTick(() => {
      this.initAlertChart();
      this.initGaugeChart();
      this.loadAlertChart();
    });
    //this.startAlertRefresh();
  },

  beforeDestroy() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
    if (this.selectedCamera?.name) {
      this.$refs[this.selectedCamera.name]?.[0]?.destroy();
    }
    if (this.alertChart) {
      this.alertChart.dispose();
    }
    if (this.gaugeChart) {
      this.gaugeChart.dispose();
    }
    window.removeEventListener('resize', this.handleChartResize);
    this.$socket.client.off('connect', this.handleSocketConnect);
    this.stopAlertRefresh();
  },

  methods: {
    updateTime() {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      
      this.currentTime = `${year}/${month}/${day} 오후 ${hours}:${minutes}:${seconds}`;
    },
    
    async initializeData() {
      try {
        await this.fetchCameras();
        if (this.cameras.length > 0) {
          this.selectCamera(0);
        }
      } catch (error) {
        console.error('Error initializing data:', error);
      }
    },

    async fetchCameras() {
      console.log('Starting fetchCameras');
      this.loading = true;
      
      try {
        const response = await getCameras();
        console.log('getCameras response:', response);

        if (!response?.data?.result) {
          console.warn('No camera data in response');
          this.cameras = [];
          return;
        }

        const rawCameras = response.data.result;
        console.log('Raw cameras:', rawCameras);

        if (!Array.isArray(rawCameras)) {
          console.warn('Camera data is not an array');
          this.cameras = [];
          return;
        }

        const processedCameras = [];
        for (const camera of rawCameras) {
          try {
            if (!camera?.name) {
              console.warn('Skipping camera without name:', camera);
              continue;
            }

            console.log('Processing camera:', camera.name);
            
            const settingsResponse = await getCameraSettings(camera.name);
            console.log('Camera settings response:', settingsResponse);
            
            const processedCamera = {
              ...camera,
              settings: settingsResponse?.data || {}
            };
            
            processedCameras.push(processedCamera);
            console.log('Added processed camera:', processedCamera);
          } catch (err) {
            console.error(`Error processing camera ${camera?.name || 'unknown'}:`, err);
          }
        }

        console.log('Setting cameras array:', processedCameras);
        this.cameras = processedCameras;
        
      } catch (error) {
        console.error('Error in fetchCameras:', error);
        this.$toast.error('카메라 목록을 불러오는데 실패했습니다.');
        this.cameras = [];
      } finally {
        this.loading = false;
        console.log('fetchCameras completed. Current cameras:', this.cameras);
      }
    },

    selectCamera(index) {
      if (this.selectedCameraIndex === index) {
        return;
      }
      
      // 이전 선택된 카메라의 VideoCard 인스턴스 정리
      if (this.selectedCamera) {
        const prevRef = this.$refs[`main-${this.selectedCamera.name}`];
        if (prevRef && prevRef[0]) {
          prevRef[0].destroy();
        }
      }

      this.selectedCameraIndex = index;
      this.videoKey++; // 비디오 키 업데이트로 VideoCard 재생성

      // 새로 선택된 카메라의 VideoCard 초기화
      this.$nextTick(() => {
        const newRef = this.$refs[`main-${this.selectedCamera.name}`];
        if (newRef && newRef[0]) {
          newRef[0].initialize();
        }
      });
    },

    async refreshCameras() {
      await this.fetchCameras();
    },

    handleSocketConnect() {
      if (this.selectedCamera?.name && this.$refs[this.selectedCamera.name]?.[0]) {
        this.$refs[this.selectedCamera.name][0].refreshStream(true);
      }
    },

    formatRtspUrl(camera) {
      try {
        if (!camera?.videoConfig?.source) return 'URL 없음';
        const source = camera.videoConfig.source.replace(/\u00A0/g, ' ');
        const parts = source.split('-i ');
        return parts.length > 1 ? parts[1] : 'URL 없음';
      } catch (error) {
        console.error('Error formatting RTSP URL:', error);
        return 'URL 없음';
      }
    },

    initAlertChart() {
      const chartDom = this.$refs.alertChart;
      if (!chartDom) return;
      if (this.alertChart) {
        this.alertChart.dispose();
      }
      this.alertChart = echarts.init(chartDom);

      // 빈 데이터로만 초기화
      this.alertChart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: '#ffffff' } }, axisLabel: { color: '#ffffff' } },
        yAxis: { type: 'value', axisLine: { lineStyle: { color: '#ffffff' } }, axisLabel: { color: '#ffffff' }, splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } } },
        series: [{
          name: '경보건수',
          type: 'bar',
          data: [],
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#83bff6' },
              { offset: 0.5, color: '#188df0' },
              { offset: 1, color: '#188df0' }
            ])
          }
        }]
      });
    },

    initGaugeChart() {
      const chartDom = this.$refs.gaugeChart;
      this.gaugeChart = echarts.init(chartDom);
      
      const option = {
        backgroundColor: 'transparent',
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          center: ['50%', '75%'],
          radius: '90%',
          min: 0,
          max: 4,
          splitNumber: 4,
          axisLine: {
            lineStyle: {
              width: 20,
              color: [
                [0.25, '#4B7BE5'],  // 관심 - 파랑
                [0.5, '#FFB800'],   // 주의 - 노랑
                [0.75, '#FF8A00'],  // 경계 - 주황
                [1, '#FF4B4B']      // 심각 - 빨강
              ]
            }
          },
          pointer: {
            icon: 'path://M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z',
            length: '60%',
            width: 8,
            offsetCenter: [0, '5%'],
            itemStyle: {
              color: '#999'
            }
          },
          axisTick: {
            length: 12,
            lineStyle: {
              color: 'auto',
              width: 2
            }
          },
          splitLine: {
            length: 20,
            lineStyle: {
              color: 'auto',
              width: 2
            }
          },
          axisLabel: {
            color: '#999',
            fontSize: 12,
            distance: -60,
            formatter: (value) => {
              if (value === 1) return '주의';
              if (value === 2) return '경고';
              if (value === 3) return '위험';
              if (value === 4) return '심각';
              if (value === 5) return '비상';
              return '';
            }
          },
          title: {
            offsetCenter: [0, '20%'],
            fontSize: 14,
            color: '#fff'
          },
          detail: {
            fontSize: 24,
            offsetCenter: [0, '40%'],
            valueAnimation: true,
            formatter: (value) => {
              return Math.round(value) + '단계';
            },
            color: '#fff'
          },
          data: [{
            value: this.alertCount,
            name: '경보 단계'
          }]
        }]
      };

      this.gaugeChart.setOption(option);
      window.addEventListener('resize', this.handleChartResize);
    },

    handleChartResize() {
      if (this.alertChart) {
        this.alertChart.resize();
      }
      if (this.gaugeChart) {
        this.gaugeChart.resize();
      }
    },

    async loadAlertHistory() {
      try {
        // 1페이지 20개만 요청
        const response = await getAlerts('?page=1&pageSize=20');
        this.alertHistory = response.data.result.map(alert => {
          let minTemp = '-';
          let maxTemp = '-';
          try {
            const info = alert.alert_info_json ? JSON.parse(alert.alert_info_json) : {};
            minTemp = (typeof info.min_roi_value === 'number') ? info.min_roi_value.toFixed(1) : '-';
            maxTemp = (typeof info.max_roi_value === 'number') ? info.max_roi_value.toFixed(1) : '-';
          } catch (e) {
            // no-op
          }
          return {
            id: alert.id,
            time: this.formatDate(alert.alert_accur_time),
            type: alert.alert_type,
            level: alert.alert_level,
            maxTemp,
            minTemp,
            snapshotImages: alert.snapshotImages
          }
        });

        // 최신 경보의 snapshotImages 파싱하여 이미지 분류
        if (this.alertHistory.length > 0) {
          this.selectedAlertIndex = 0; // 최신 경보를 기본 선택
          this.parseSnapshotImages(this.alertHistory[0].snapshotImages);
        }

        // 최신 경보단계로 gaugeChart 값 반영 (한글 문구로)
        if (this.alertHistory.length > 0) {
          this.alertCount = Number(this.alertHistory[0].level) || 0;
          const levelLabel = this.getLevelText(this.alertHistory[0].level);
          if (this.gaugeChart) {
            this.gaugeChart.setOption({
              series: [{
                data: [{
                  value: this.alertCount,
                  name: levelLabel
                }],
                detail: {
                  formatter: () => levelLabel,
                  color: '#fff',
                  fontSize: 24,
                  offsetCenter: [0, '40%']
                }
              }]
            });
          }
        }
      } catch (error) {
        console.error('알림 이력 조회 실패:', error);
        this.$toast?.error('알림 이력을 불러오는 중 오류가 발생했습니다.');
      }
    },

    formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleString();
    },

    getTypeText(type) {
      const types = {
        'A001': '누수 감지',
        'A002': '움직임 감지',
        'A003': '얼굴 인식',
        'A004': '차량 감지'
      };
      return types[type] || type;
    },

    getLevelText(level) {
      const levels = {
        '1': '주의',
        '2': '경고',
        '3': '위험',
        '4': '심각',
        '5': '비상'
      };
      return levels[level] || level;
    },

    async loadAlertChart() {
      try {
        const response = await getRecentAlertCounts();
        const data = response.data.result;

        // 최근 7일 날짜 배열 생성 (오늘 포함)
        const today = new Date();
        const categories = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          categories.push(d.toISOString().slice(0, 10));
        }
        const dataMap = Object.fromEntries(data.map(d => [d.date, d.count]));
        const counts = categories.map(date => dataMap[date] || 0);

        if (this.alertChart) {
          this.alertChart.setOption({
            xAxis: { type: 'category', data: categories },
            yAxis: { type: 'value' },
            legend: { show: false },
            tooltip: { trigger: 'axis' },
            series: [{
              name: '경보건수',
              type: 'bar',
              data: counts,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#83bff6' },
                  { offset: 0.5, color: '#188df0' },
                  { offset: 1, color: '#188df0' }
                ])
              }
            }]
          }, true); // notMerge: true
        }
      } catch (e) {
        console.error('최근 7일 경보 차트 데이터 조회 실패:', e);
      }
    },

    startAlertRefresh() {
      this.stopAlertRefresh();
      this.alertRefreshTimer = setInterval(() => {
        this.loadAlertHistory();
      }, 2000);
    },

    stopAlertRefresh() {
      if (this.alertRefreshTimer) {
        clearInterval(this.alertRefreshTimer);
        this.alertRefreshTimer = null;
      }
    },

    getAlertRowClass(alert, index) {
      return {
        'alert-level-3': Number(alert.level) >= 3,
        'alert-level-4': Number(alert.level) >= 4,
        'alert-level-5': Number(alert.level) >= 5,
        'selected-alert': this.selectedAlertIndex === index
      };
    },

    selectAlert(index) {
      if (index >= 0 && index < this.alertHistory.length) {
        this.selectedAlertIndex = index;
        const selectedAlert = this.alertHistory[index];
        console.log('Selected alert:', selectedAlert);
        this.parseSnapshotImages(selectedAlert.snapshotImages);
      }
    },

    parseSnapshotImages(snapshotImagesJson) {
      try {
        if (!snapshotImagesJson) {
          console.log('No snapshot images data');
          this.thermalImageSrc = null;
          this.visualImageSrc = null;
          return;
        }

        const snapshotImages = JSON.parse(snapshotImagesJson);
        console.log('Parsed snapshot images:', snapshotImages);

        if (!Array.isArray(snapshotImages) || snapshotImages.length === 0) {
          console.log('No snapshot images in array');
          this.thermalImageSrc = null;
          this.visualImageSrc = null;
          return;
        }

        // video_type에 따라 이미지 분류
        let thermalImage = null;
        let visualImage = null;

        for (const snapshot of snapshotImages) {
          if (snapshot.video_type === '1' || snapshot.video_type === 1) {
            thermalImage = snapshot;
          } else if (snapshot.video_type === '2' || snapshot.video_type === 2) {
            visualImage = snapshot;
          }
        }

        // base64 이미지 소스 설정
        if (thermalImage && thermalImage.image_data) {
          this.thermalImageSrc = `data:image/jpeg;base64,${thermalImage.image_data}`;
          console.log('Thermal image loaded');
        } else {
          this.thermalImageSrc = null;
          console.log('No thermal image found');
        }

        if (visualImage && visualImage.image_data) {
          this.visualImageSrc = `data:image/jpeg;base64,${visualImage.image_data}`;
          console.log('Visual image loaded');
        } else {
          this.visualImageSrc = null;
          console.log('No visual image found');
        }

      } catch (error) {
        console.error('Error parsing snapshot images:', error);
        this.thermalImageSrc = null;
        this.visualImageSrc = null;
      }
    },

    toggleAlertHistoryRefresh() {
      this.autoRefreshAlertHistory = !this.autoRefreshAlertHistory;
      if (this.autoRefreshAlertHistory) {
        this.startAlertRefresh();
      } else {
        this.stopAlertRefresh();
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.alert-status-container {
  display: flex;
  height: 100vh;
  background: #222736;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

.left-sidebar {
  width: 25%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  min-width: 250px;
}

.center-content {
  width: 50%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  flex-shrink: 0;
}

.right-sidebar {
  width: 25%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
  min-width: 250px;
}

// Time Layer
.time-layer {
  background: #3659e2;
  color: white;
  padding: 15px;
  text-align: center;
  border-radius: 8px;
  height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  
  .location-info {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 8px;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
    line-height: 1.2;
  }
  
  .current-time {
    font-size: 18px;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  }
}

// Alert History Layer
.alert-history-layer {
  background: #2a3042;
  color: white;
  padding: 8px;
  border-radius: 8px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  
  .layer-title {
    background: #666;
    color: white;
    font-weight: bold;
    padding: 8px 10px;
    margin-bottom: 10px;
    font-size: 14px;
    text-align: left;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .alert-history-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    
            .alert-history-table {
          .table-row {
            background: #1e1e1e;
            border-radius: 4px;
            margin-bottom: 8px;
            overflow: hidden;
            cursor: pointer;
            transition: all 0.2s ease;
            
            &:hover {
              background: #2a2a2a;
              transform: translateY(-1px);
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            
            .table-item {
              display: flex;
              padding: 0;
              border-bottom: 1px solid #2d2d2d;
              
              &:last-child {
                border-bottom: none;
              }
              
              .item-label {
                background: #535e6c;
                color: #ffffff;
                font-size: 12px;
                font-weight: bold;
                padding: 8px 12px;
                flex: 0 0 40%;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              
              .item-value {
                background: #1e1e1e;
                color: #ffffff;
                font-size: 12px;
                padding: 8px 12px;
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: flex-start;
              }
            }
        
        &.alert-level-3 {
          animation: blink-amber 1s infinite;
        }
        &.alert-level-4 {
          animation: blink-orange 1s infinite;
        }
        &.alert-level-5 {
          animation: blink-red 1s infinite;
        }
        
        &.selected-alert {
          background: #3659e2 !important;
          border: 2px solid #fff;
          box-shadow: 0 0 10px rgba(54, 89, 226, 0.5);
          
          .table-item {
            .item-label {
              background: #2a3042;
            }
            
            .item-value {
              background: #3659e2;
              color: #fff;
              font-weight: bold;
            }
          }
        }
      }
    }
  }
}

@keyframes blink-amber {
  0% { background-color: #1e1e1e; }
  50% { background-color: rgba(255, 193, 7, 0.2); }
  100% { background-color: #1e1e1e; }
}

@keyframes blink-orange {
  0% { background-color: #1e1e1e; }
  50% { background-color: rgba(255, 152, 0, 0.2); }
  100% { background-color: #1e1e1e; }
}

@keyframes blink-red {
  0% { background-color: #1e1e1e; }
  50% { background-color: rgba(244, 67, 54, 0.2); }
  100% { background-color: #1e1e1e; }
}



// Center Content - Image Boxes
.top-image-box, .bottom-image-box {
  background: #2a3042;
  border: 1px solid #2a3042;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.top-image-box {
  flex: 1;
}

.bottom-image-box {
  flex: 1;
}

.box-title {
  background: #666;
  color: #fff;
  font-weight: bold;
  padding: 8px 16px;
  border-bottom: 2px solid #555;
  border-radius: 8px 8px 0 0;
  flex-shrink: 0;
}

.image-container {
  flex: 1;
  position: relative;
  background: #000;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.thermal-image, .visual-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  background: #000;
}

.thermal-image-placeholder, .visual-image-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed #444;
  
  .placeholder-text {
    color: #fff;
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 8px;
  }
  
  .placeholder-subtext {
    color: #888;
    font-size: 14px;
    text-align: center;
  }
}

// Right Sidebar
.gauge-box, .chart-box, .history-box {
  background: #2a3042;
  border: 1px solid #2a3042;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.gauge-box {
  height: 300px;
}

.chart-box {
  height: 250px;
}

.history-box {
  flex: 1;
}

.gauge-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
}

.gauge-meter {
  width: 100%;
  height: 240px;
  min-width: 180px;
  min-height: 180px;
}

.chart-container {
  flex: 1;
  padding: 16px;
  background: #2a3042;
}

.alert-table {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  .table-header {
    display: flex;
    background: #444;
    font-weight: bold;
    flex-shrink: 0;
    
    .header-cell {
      flex: 1;
      text-align: center;
      color: #fff;
      padding: 8px 0;
      font-size: 12px;
    }
  }
  
  .table-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    
    .table-row {
      display: flex;
      align-items: center;
      border-bottom: 1px solid #333;
      transition: background 0.2s;
      
      &:hover {
        background: #333;
      }
      
      .table-cell {
        flex: 1;
        text-align: center;
        color: #eee;
        padding: 6px 0;
        font-size: 12px;
        
        .level-icon {
          margin-right: 4px;
        }
      }
      
      &.level-4 { background: rgba(255,75,75,0.15);}
      &.level-3 { background: rgba(255,138,0,0.10);}
      &.level-2 { background: rgba(255,184,0,0.10);}
      &.level-1 { background: rgba(75,123,229,0.10);}
    }
  }
}

@media (max-width: 1200px) {
  .alert-status-container {
    flex-direction: column;
    height: auto;
    gap: 8px;
  }
  
  .left-sidebar, .right-sidebar {
    width: 100%;
  }
  
  .center-content {
    min-height: 400px;
  }
}
</style>
