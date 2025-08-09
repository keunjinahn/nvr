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
            .roi-number
              .roi-label ROI {{ alert.roiNumber || '-' }}
            .data-table
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
      .box-title 열화상 이미지 분석 결과({{ lastEventTime }})
      .image-container
        img.thermal-image(
          v-if="thermalImageSrc"
          :src="thermalImageSrc"
          alt="열화상 이미지"
          @load="onThermalImageLoad"
        )
        .thermal-image-placeholder(v-else)
          .placeholder-text 열화상 이미지
          .placeholder-subtext
        // Zone 박스 오버레이
        .zone-overlay(v-if="thermalImageSrc && zoneBoxes.length > 0")
          .zone-box(
            v-for="(zone, index) in zoneBoxes"
            :key="index"
            :style="getZoneBoxStyle(zone)"
            :class="{ 'active-zone': zone.zone_type === selectedAlertZoneType }"
            @click="onZoneBoxClick(zone)"
          )
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
          .placeholder-subtext
  .right-sidebar
    .gauge-box
      .box-title 현재 경보단계
      .gauge-container
        .gauge-meter(ref="gaugeChart")
    
    .chart-box
      .box-title 최근 7일 경보 발령 수
      .chart-container
        div(ref="alertChart" style="width:100%;height:180px;min-width:180px;min-height:180px;")
    
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

  // ROI 데이터 팝업 다이얼로그
  v-dialog(
    v-model="showRoiDataDialog"
    max-width="1000px"
    persistent
  )
    v-card.roi-dialog-card
      v-card-title.roi-dialog-title
        .title-content
          .main-title ROI {{ selectedRoiNumber }} 시계열 데이터
          .sub-title 열화상 이미지 분석 결과
        v-spacer
        v-btn.close-btn(icon @click="closeRoiDataDialog")
          v-icon mdi-close
      v-card-text.roi-dialog-content
        .roi-data-container
          .temperature-summary(v-if="roiTimeSeriesData.length > 0")
            .summary-item
              .item-label 최대온도
              .item-value {{ roiTemperatureStats.maxTemp }}°C
            .summary-item
              .item-label 최소온도
              .item-value {{ roiTemperatureStats.minTemp }}°C
            .summary-item
              .item-label 평균온도
              .item-value {{ roiTemperatureStats.avgTemp }}°C
          .chart-container(v-if="roiTimeSeriesData.length > 0")
            div(ref="roiTimeSeriesChart" style="width:100%;height:400px;")
          .no-data(v-else)
            .no-data-text 데이터가 없습니다.
      v-card-actions.roi-dialog-actions
        v-spacer
        v-btn.close-action-btn(color="primary" @click="closeRoiDataDialog") 닫기
</template>
  
<script>
import { 
  mdiRefresh
} from '@mdi/js';
import { getCameras, getCameraSettings } from '@/api/cameras.api';
import { getAlerts, getRecentAlertCounts } from '@/api/alerts.api';
import { getEventSetting } from '@/api/eventSetting.api';
import { getRoiTimeSeriesData } from '@/api/statistic.api';
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
    zoneBoxes: [],
    selectedAlertZoneType: null,
    thermalImageSize: { width: 0, height: 0 },
    siteDetails: {
      maxTemp: '46.24',
      minTemp: '19.73',
      avgTemp: '41.31',
      alertLevel: '4',
      measurementTime: '2025-07-09 15:40:00'
    },
    // ROI 데이터 팝업 관련
    showRoiDataDialog: false,
    selectedRoiNumber: null,
    roiTimeSeriesData: [],
    roiTimeSeriesChart: null,
    roiTemperatureStats: {
      maxTemp: 0,
      minTemp: 0,
      avgTemp: 0
    }
  }),

  computed: {
    selectedCamera() {
      return this.selectedCameraIndex !== null && this.cameras.length > 0 
        ? this.cameras[this.selectedCameraIndex] 
        : null;
    },
    
    lastEventTime() {
      if (this.alertHistory.length === 0) {
        return this.currentTime;
      }
      
      // 선택된 경보가 있으면 해당 경보의 시간, 없으면 마지막 이벤트의 시간 반환
      if (this.selectedAlertIndex >= 0 && this.selectedAlertIndex < this.alertHistory.length) {
        const selectedAlert = this.alertHistory[this.selectedAlertIndex];
        return selectedAlert.time || this.currentTime;
      } else {
        const lastEvent = this.alertHistory[this.alertHistory.length - 1];
        return lastEvent.time || this.currentTime;
      }
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
    
    // 윈도우 resize 이벤트 리스너 추가
    window.addEventListener('resize', this.handleWindowResize);
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
    window.removeEventListener('resize', this.handleWindowResize);
    this.$socket.client.off('connect', this.handleSocketConnect);
    this.stopAlertRefresh();
  },

  methods: {
    updateTime() {
      // 한국 시간으로 변환 (UTC+9)
      const now = new Date();
      const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
      
      const year = koreaTime.getUTCFullYear();
      const month = koreaTime.getUTCMonth() + 1;
      const day = koreaTime.getUTCDate();
      const hours = koreaTime.getUTCHours();
      const minutes = String(koreaTime.getUTCMinutes()).padStart(2, '0');
      const seconds = String(koreaTime.getUTCSeconds()).padStart(2, '0');
      
      // 오전/오후 구분
      const period = hours < 12 ? '오전' : '오후';
      const displayHours = hours < 12 ? hours : (hours === 12 ? 12 : hours - 12);
      const displayHoursStr = String(displayHours).padStart(2, '0');
      
      this.currentTime = `${year}/${month}/${day} ${period} ${displayHoursStr}:${minutes}:${seconds}`;
    },
    
    async initializeData() {
      try {
        await this.fetchCameras();
        await this.loadLocationInfo();
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

    async loadLocationInfo() {
      try {
        console.log('Loading location info...');
        const data = await getEventSetting();
        console.log('Event setting response:', data);
        
        if (data && data.system_json) {
          const system = JSON.parse(data.system_json);
          this.location_info = system.location_info || '수자원공사 섬진강댐';
          console.log('Location info loaded:', this.location_info);
        } else {
          console.log('No system_json found, using default location info');
          this.location_info = '수자원공사 섬진강댐';
        }
      } catch (error) {
        console.error('Error loading location info:', error);
        this.location_info = '수자원공사 섬진강댐';
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

    handleWindowResize() {
      // 윈도우 크기 변경 시 zone 박스 위치 재계산
      this.$nextTick(() => {
        this.updateZoneBoxes();
      });
    },

    async loadAlertHistory() {
      try {
        // 1페이지 20개만 요청
        const response = await getAlerts('?page=1&pageSize=20');
        this.alertHistory = response.data.result.map(alert => {
          let minTemp = '-';
          let maxTemp = '-';
          const info = alert.alert_info_json ? JSON.parse(alert.alert_info_json) : {};
          try {
            
            minTemp = (typeof info.min_roi_value === 'number') ? info.min_roi_value.toFixed(1) : '-';
            maxTemp = (typeof info.max_roi_value === 'number') ? info.max_roi_value.toFixed(1) : '-';
          } catch (e) {
            // no-op
          }
          return {
            id: alert.id,
            time: this.formatDate(alert.alert_accur_time),
            originalTime: alert.alert_accur_time, // 원본 날짜 데이터 보존
            type: alert.alert_type,
            level: alert.alert_level,
            maxTemp,
            minTemp,
            roiNumber: info.zone_type,
            snapshotImages: alert.snapshotImages,
            alert_info_json: alert.alert_info_json
          }
        });

        // 최신 경보의 snapshotImages 파싱하여 이미지 분류
        if (this.alertHistory.length > 0) {
          this.selectedAlertIndex = 0; // 최신 경보를 기본 선택
          this.parseSnapshotImages(this.alertHistory[0].snapshotImages);
          this.updateZoneBoxes();
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
      if (!dateStr) return '-';
      
      try {
        // ISO 문자열이면 포맷팅 (AdminResult.vue와 동일한 방식)
        if (typeof dateStr === 'string') {
          return dateStr.replace('T', ' ').substring(0, 19);
        }
        
        // Date 객체인 경우
        if (dateStr instanceof Date) {
          return dateStr.toISOString().replace('T', ' ').substring(0, 19);
        }
        
        return String(dateStr);
      } catch (error) {
        console.error('날짜 포맷팅 오류:', error);
        return String(dateStr);
      }
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

        // 최근 7일 날짜 배열 생성 (오늘 포함) - 한국 시간 기준
        const today = new Date();
        const koreaToday = new Date(today.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
        const categories = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(koreaToday);
          d.setUTCDate(koreaToday.getUTCDate() - i);
          const year = d.getUTCFullYear();
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          categories.push(`${year}-${month}-${day}`);
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
        this.updateZoneBoxes();
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
    },

    onThermalImageLoad(event) {
      console.log('onThermalImageLoad', event);
      // 고정된 640x480 크기 사용
      this.thermalImageSize = {
        width: 640,
        height: 480
      };
      
      // 이미지 렌더링 완료 후 zone 박스 업데이트
      this.$nextTick(() => {
        setTimeout(() => {
          this.updateZoneBoxes();
        }, 100);
      });
    },

    updateZoneBoxes() {
      if (this.alertHistory.length === 0 || this.selectedAlertIndex >= this.alertHistory.length) {
        this.zoneBoxes = [];
        return;
      }

      const selectedAlert = this.alertHistory[this.selectedAlertIndex];
      try {
        const alertInfo = selectedAlert.alert_info_json ? JSON.parse(selectedAlert.alert_info_json) : {};
        const zoneList = alertInfo.zone_list || [];
        this.selectedAlertZoneType = alertInfo.zone_type;

        // zone_list에서 박스 정보 추출
        this.zoneBoxes = zoneList.map(zone => {
          if (typeof zone === 'object' && zone !== null) {
            return {
              left: zone.left  + 3|| zone.x1 || 0,
              top: zone.top || zone.y1 || 0,
              right: zone.right - 4 || zone.x2 || 0,
              bottom: zone.bottom || zone.y2 || 0,
              zone_type: zone.zone_type || zone.type || '1'
            };
          }
          return null;
        }).filter(zone => zone !== null);

        console.log('Zone boxes updated:', this.zoneBoxes);
        console.log('Selected alert zone type:', this.selectedAlertZoneType);
      } catch (error) {
        console.error('Error parsing zone list:', error);
        this.zoneBoxes = [];
      }
    },

    getZoneBoxStyle(zone) {
      // 640x480 고정 크기에 맞춰 오버레이 위치 계산
      // 오버레이가 이미지와 정확히 겹치므로 zone 좌표를 직접 사용
      return {
        position: 'absolute',
        left: `${zone.left}px`,
        top: `${zone.top}px`,
        width: `${zone.right - zone.left}px`,
        height: `${zone.bottom - zone.top}px`
      };
    },

    // Zone 박스 클릭 이벤트
    onZoneBoxClick(zone) {
      console.log('Zone box clicked:', zone);
      this.selectedRoiNumber = zone.zone_type;
      this.showRoiDataDialog = true;
      this.loadRoiTimeSeriesData(zone.zone_type);
    },

    // ROI 시계열 데이터 로드
    async loadRoiTimeSeriesData(roiNumber) {
      try {
        console.log('Loading ROI time series data for:', roiNumber);
        
        // 선택된 경보의 시간 정보 가져오기
        if (this.selectedAlertIndex >= 0 && this.selectedAlertIndex < this.alertHistory.length) {
          const selectedAlert = this.alertHistory[this.selectedAlertIndex];
          
          // 날짜 유효성 검사 및 변환 (한국 시간 기준)
          let eventDate;
          if (selectedAlert.originalTime) {
            eventDate = new Date(selectedAlert.originalTime);
            // Invalid Date 체크
            if (isNaN(eventDate.getTime())) {
              console.warn('Invalid date format:', selectedAlert.originalTime);
              // 현재 한국 시간으로 대체
              const now = new Date();
              eventDate = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
            }
          } else if (selectedAlert.time) {
            // fallback: 포맷된 시간 사용
            eventDate = new Date(selectedAlert.time);
            if (isNaN(eventDate.getTime())) {
              console.warn('Invalid formatted date format:', selectedAlert.time);
              // 현재 한국 시간으로 대체
              const now = new Date();
              eventDate = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
            }
          } else {
            console.warn('No time data available, using current Korea time');
            const now = new Date();
            eventDate = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
          }
          
          console.log('Using event date (Korea time):', eventDate.toISOString());
          
          // API 호출
          const response = await getRoiTimeSeriesData({
            roiNumber: roiNumber,
            eventDate: eventDate.toISOString()
          });
          
          console.log('ROI Time Series API Response:', response);
          
          if (response && response.data && response.data.result) {
            const result = response.data.result;
            
            // API 응답 데이터를 차트용 데이터로 변환 (최대, 평균, 최소 온도 포함)
            this.roiTimeSeriesData = result.timeSeriesData.map(item => ({
              time: item.time,
              maxTemp: parseFloat(item.max || item.avg || 0),
              avgTemp: parseFloat(item.avg || 0),
              minTemp: parseFloat(item.min || item.avg || 0),
              roiNumber: item.roiNumber
            }));
            
            // 통계 정보 업데이트
            this.roiTemperatureStats = {
              maxTemp: parseFloat(result.statistics.maxTemp),
              minTemp: parseFloat(result.statistics.minTemp),
              avgTemp: parseFloat(result.statistics.avgTemp)
            };
            
            console.log('Processed ROI time series data:', this.roiTimeSeriesData);
            console.log('Temperature stats:', this.roiTemperatureStats);
            
            // 차트 초기화
            this.$nextTick(() => {
              this.initRoiTimeSeriesChart();
            });
          } else {
            console.log('No data available for ROI', roiNumber);
            this.roiTimeSeriesData = [];
            this.roiTemperatureStats = { maxTemp: 0, minTemp: 0, avgTemp: 0 };
          }
        } else {
          console.log('No selected alert available');
          this.roiTimeSeriesData = [];
          this.roiTemperatureStats = { maxTemp: 0, minTemp: 0, avgTemp: 0 };
        }
      } catch (error) {
        console.error('Error loading ROI time series data:', error);
        this.$toast.error('ROI 데이터를 불러오는데 실패했습니다.');
        this.roiTimeSeriesData = [];
        this.roiTemperatureStats = { maxTemp: 0, minTemp: 0, avgTemp: 0 };
      }
    },

    // 임시 데이터 생성 (실제 API 연동 시 제거)
    // generateMockRoiData(roiNumber) {
    //   const now = new Date();
    //   const data = [];
    //   
    //   for (let i = 24; i >= 0; i--) {
    //     const time = new Date(now.getTime() - i * 60 * 60 * 1000); // 1시간 간격
    //     const temperature = 20 + Math.random() * 30 + (roiNumber * 2); // ROI 번호에 따른 온도 변화
    //     
    //     data.push({
    //       time: time.toISOString(),
    //       temperature: parseFloat(temperature.toFixed(2)),
    //       roiNumber: roiNumber
    //     });
    //   }
    //   
    //   this.roiTimeSeriesData = data;
    //   this.calculateTemperatureStats();
    //   console.log('Generated mock ROI data:', data);
    // },

    // 온도 통계 계산
    calculateTemperatureStats() {
      if (this.roiTimeSeriesData.length === 0) {
        this.roiTemperatureStats = { maxTemp: 0, minTemp: 0, avgTemp: 0 };
        return;
      }

      const maxTemps = this.roiTimeSeriesData.map(item => item.maxTemp);
      const avgTemps = this.roiTimeSeriesData.map(item => item.avgTemp);
      const minTemps = this.roiTimeSeriesData.map(item => item.minTemp);
      
      const maxTemp = Math.max(...maxTemps);
      const minTemp = Math.min(...minTemps);
      const avgTemp = avgTemps.reduce((sum, temp) => sum + temp, 0) / avgTemps.length;

      this.roiTemperatureStats = {
        maxTemp: parseFloat(maxTemp.toFixed(2)),
        minTemp: parseFloat(minTemp.toFixed(2)),
        avgTemp: parseFloat(avgTemp.toFixed(2))
      };

      console.log('Temperature stats:', this.roiTemperatureStats);
    },

    // ROI 시계열 차트 초기화
    initRoiTimeSeriesChart() {
      const chartDom = this.$refs.roiTimeSeriesChart;
      if (!chartDom) return;
      
      if (this.roiTimeSeriesChart) {
        this.roiTimeSeriesChart.dispose();
      }
      
      this.roiTimeSeriesChart = echarts.init(chartDom);
      
      // 데이터가 없으면 빈 차트 표시
      if (!this.roiTimeSeriesData || this.roiTimeSeriesData.length === 0) {
        const emptyOption = {
          backgroundColor: 'transparent',
          title: {
            text: `ROI ${this.selectedRoiNumber} 온도 변화 추이`,
            textStyle: {
              color: '#ffffff',
              fontSize: 18,
              fontWeight: 'bold'
            },
            left: 'center',
            top: 10
          },
          graphic: {
            type: 'text',
            left: 'center',
            top: 'middle',
            style: {
              text: '데이터가 없습니다',
              fontSize: 16,
              fill: '#888'
            }
          }
        };
        this.roiTimeSeriesChart.setOption(emptyOption);
        return;
      }
      
      const timeData = this.roiTimeSeriesData.map(item => {
        const date = new Date(item.time);
        // 한국 시간으로 변환 (UTC+9)
        const koreaTime = new Date(date.getTime() + (9 * 60 * 60 * 1000));
        return `${koreaTime.getUTCHours()}:${String(koreaTime.getUTCMinutes()).padStart(2, '0')}:${String(koreaTime.getUTCSeconds()).padStart(2, '0')}`;
      });
      
      const maxTempData = this.roiTimeSeriesData.map(item => item.maxTemp);
      const avgTempData = this.roiTimeSeriesData.map(item => item.avgTemp);
      const minTempData = this.roiTimeSeriesData.map(item => item.minTemp);
      
      const option = {
        backgroundColor: 'transparent',
        title: {
          text: `ROI ${this.selectedRoiNumber} 온도 변화 추이 (1분간)`,
          textStyle: {
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 'bold'
          },
          left: 'center',
          top: 10
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          borderColor: '#ff6b6b',
          borderWidth: 1,
          textStyle: {
            color: '#ffffff'
          },
          axisPointer: {
            type: 'cross',
            lineStyle: {
              color: '#ff6b6b',
              width: 1
            }
          },
          formatter: function (params) {
            let tooltipContent = `<div style="padding: 8px;">
              <div style="font-weight: bold; margin-bottom: 8px;">${params[0].name}</div>`;
            
            params.forEach(param => {
              const color = param.color;
              const value = param.value;
              const seriesName = param.seriesName;
              tooltipContent += `<div style="color: ${color}; margin-bottom: 4px;">${seriesName}: ${value}°C</div>`;
            });
            
            tooltipContent += '</div>';
            return tooltipContent;
          }
        },
        grid: {
          left: '5%',
          right: '5%',
          bottom: '10%',
          top: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: timeData,
          axisLine: {
            lineStyle: {
              color: '#666666',
              width: 2
            }
          },
          axisTick: {
            lineStyle: {
              color: '#666666'
            }
          },
          axisLabel: {
            color: '#ffffff',
            fontSize: 12,
            rotate: 45
          }
        },
        yAxis: {
          type: 'value',
          name: '온도 (°C)',
          nameTextStyle: {
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 'bold'
          },
          axisLine: {
            lineStyle: {
              color: '#666666',
              width: 2
            }
          },
          axisTick: {
            lineStyle: {
              color: '#666666'
            }
          },
          axisLabel: {
            color: '#ffffff',
            fontSize: 12
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(255, 255, 255, 0.1)',
              type: 'dashed'
            }
          }
        },
        legend: {
          data: ['최대온도', '평균온도', '최소온도'],
          textStyle: {
            color: '#ffffff',
            fontSize: 12
          },
          top: 40
        },
        series: [
          {
            name: '최대온도',
            type: 'line',
            data: maxTempData,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: {
              color: '#ff4444',
              width: 3,
              shadowColor: 'rgba(255, 68, 68, 0.3)',
              shadowBlur: 8
            },
            itemStyle: {
              color: '#ff4444',
              borderColor: '#ffffff',
              borderWidth: 2
            }
          },
          {
            name: '평균온도',
            type: 'line',
            data: avgTempData,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: {
              color: '#ff6b6b',
              width: 4,
              shadowColor: 'rgba(255, 107, 107, 0.3)',
              shadowBlur: 10
            },
            itemStyle: {
              color: '#ff6b6b',
              borderColor: '#ffffff',
              borderWidth: 2
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(255, 107, 107, 0.4)' },
                { offset: 0.5, color: 'rgba(255, 107, 107, 0.2)' },
                { offset: 1, color: 'rgba(255, 107, 107, 0.05)' }
              ])
            }
          },
          {
            name: '최소온도',
            type: 'line',
            data: minTempData,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: {
              color: '#44aaff',
              width: 3,
              shadowColor: 'rgba(68, 170, 255, 0.3)',
              shadowBlur: 8
            },
            itemStyle: {
              color: '#44aaff',
              borderColor: '#ffffff',
              borderWidth: 2
            }
          }
        ]
      };
      
      this.roiTimeSeriesChart.setOption(option);
    },

    // ROI 데이터 다이얼로그 닫기
    closeRoiDataDialog() {
      this.showRoiDataDialog = false;
      this.selectedRoiNumber = null;
      this.roiTimeSeriesData = [];
      
      if (this.roiTimeSeriesChart) {
        this.roiTimeSeriesChart.dispose();
        this.roiTimeSeriesChart = null;
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
  gap: 8px;
  padding: 8px;
  overflow: hidden;
}

.left-sidebar {
  width: 25%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  min-width: 250px;
}

.center-content {
  width: 50%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}

.right-sidebar {
  width: 25%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  min-width: 250px;
}

// Time Layer
.time-layer {
  background: #3659e2;
  color: white;
  padding: 10px;
  text-align: center;
  border-radius: 8px;
  height: 80px;
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
            display: flex;
            
            &:hover {
              background: #2a2a2a;
              transform: translateY(-1px);
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            
            .roi-number {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              background: transparent !important;
              border-right: 1px solid #2d2d2d;
              
              .roi-label {
                color: #ffffff;
                font-size: 14px;
                font-weight: bold;
              }
            }
            
            .data-table {
              flex: 3;
              display: flex;
              flex-direction: column;
              
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
                  flex: 1;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                
                .item-value {
                  background: #3659e2;
                  color: #ffffff;
                  font-size: 12px;
                  padding: 8px 12px;
                  flex: 3;
                  display: flex;
                  align-items: center;
                  justify-content: flex-start;
                }
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
          background: #2a3042 !important;
          border: 2px solid #fff;
          box-shadow: 0 0 10px rgba(54, 89, 226, 0.5);
          
          .roi-number {
            background: #2a3042;
            
            .roi-label {
              color: #ffffff !important;
            }
          }
          
          .data-table {
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
  position: relative;
  z-index: 1;
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
  position: relative;
  z-index: 2;
}

.image-container {
  flex: 1;
  position: relative;
  background: #000;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  z-index: 0;
}

.thermal-image {
  width: 640px;
  height: 480px;
  object-fit: fill;
  border-radius: 8px;
  background: #000;
}

.visual-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  background: #000;
}

.zone-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 640px;
  height: 480px;
  pointer-events: none;
  z-index: 5;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.zone-box {
  position: absolute;
  border: 2px solid #00ff00;
  background-color: transparent;
  pointer-events: auto;
  cursor: pointer;
  z-index: 6;
  transition: all 0.3s ease;
  
  &:hover {
    border-color: #ffff00;
    background-color: rgba(255, 255, 0, 0.2);
    box-shadow: 0 0 8px rgba(255, 255, 0, 0.4);
  }
  
  &.active-zone {
    border-color: #ff0000;
    background-color: rgba(255, 0, 0, 0.3);
    box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
    
    &:hover {
      border-color: #ff6666;
      background-color: rgba(255, 102, 102, 0.4);
      box-shadow: 0 0 12px rgba(255, 102, 102, 0.6);
    }
  }
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
  height: 280px;
}

.chart-box {
  height: 220px;
}

.history-box {
  flex: 1;
}

.gauge-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
}

.gauge-meter {
  width: 100%;
  height: 220px;
  min-width: 160px;
  min-height: 160px;
}

.chart-container {
  flex: 1;
  padding: 8px;
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
    gap: 4px;
  }
  
  .left-sidebar, .right-sidebar {
    width: 100%;
  }
  
  .center-content {
    min-height: 400px;
  }
}

// ROI 데이터 팝업 스타일
.roi-dialog-card {
  background: #2a3042 !important;
  border-radius: 12px;
  overflow: hidden;
  
  .roi-dialog-title {
    background: linear-gradient(135deg, #3659e2 0%, #764ba2 100%);
    color: white;
    padding: 20px 24px;
    border-bottom: 1px solid #444;
    
    .title-content {
      .main-title {
        font-size: 20px;
        font-weight: bold;
        margin-bottom: 4px;
      }
      
      .sub-title {
        font-size: 14px;
        opacity: 0.8;
      }
    }
    
    .close-btn {
      color: white;
      
      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    }
  }
  
  .roi-dialog-content {
    padding: 24px;
    background: #2a3042;
    
    .roi-data-container {
      .temperature-summary {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
        padding: 16px;
        background: #1e1e1e;
        border-radius: 8px;
        border: 1px solid #444;
        
        .summary-item {
          flex: 1;
          text-align: center;
          padding: 12px;
          background: #2a3042;
          border-radius: 6px;
          border: 1px solid #555;
          
          .item-label {
            font-size: 12px;
            color: #888;
            margin-bottom: 4px;
            font-weight: 500;
          }
          
          .item-value {
            font-size: 18px;
            color: #ff6b6b;
            font-weight: bold;
          }
        }
      }
      
      .chart-container {
        background: #1e1e1e;
        border-radius: 12px;
        padding: 20px;
        border: 1px solid #444;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      
      .no-data {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        background: #1e1e1e;
        border-radius: 8px;
        border: 1px solid #444;
        
        .no-data-text {
          color: #888;
          font-size: 16px;
        }
      }
    }
  }
  
  .roi-dialog-actions {
    padding: 16px 24px;
    background: #2a3042;
    border-top: 1px solid #444;
    
    .close-action-btn {
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
      color: white;
      border-radius: 6px;
      padding: 8px 24px;
      font-weight: 500;
      
      &:hover {
        background: linear-gradient(135deg, #ff5252 0%, #d32f2f 100%);
      }
    }
  }
}
</style>
