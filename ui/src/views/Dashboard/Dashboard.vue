<template lang="pug">
.sidebar-root
  .notification-status
    v-container(fluid)
      v-row
        v-col(cols="12")
          v-card.notification-card
            .camera-status
              .status-header
              .camera-list-container
                .camera-grid(v-if="cameras && cameras.length > 0")
                  .camera-box(
                    v-for="(camera, index) in cameras"
                    :key="`camera-${index}`"
                    :class="{ 'active': selectedCameraIndex === index }"
                    @click="selectCamera(index)"
                  )
                    .camera-thumbnail
                      VideoCard(
                        :ref="`thumbnail-${camera.name}`"
                        :camera="camera"
                        stream
                        noLink
                        hideNotifications
                        hideIndicatorFullscreen
                        :style="{ height: '120px' }"
                      )
                    .camera-info
                      .camera-name {{ camera.name }}
                .no-cameras(v-else)
                  span.no-cameras-text 카메라 목록이 없습니다. ({{ cameras.length }})
            .camera-display-area
              .display-box.left-box
                .alert-history
                  .alert-history-title 경보 이력
                  .alert-history-table
                    .table-row(v-for="alert in alertHistory" :key="alert.id")
                      .table-item
                        .item-label 경보시간
                        .item-value {{ alert.time }}
                      .table-item
                        .item-label 경보종류
                        .item-value {{ alert.type }}
                      .table-item
                        .item-label 경보단계
                        .item-value {{ alert.level }}
                      .table-item
                        .item-label 최고온도
                        .item-value {{ alert.maxTemp }}°C
                      .table-item
                        .item-label 최저온도
                        .item-value {{ alert.minTemp }}°C
              .display-box.center-box
                VideoCard(
                  v-if="selectedCamera"
                  :ref="`main-${selectedCamera.name}`"
                  :key="`video-${selectedCamera.name}-${videoKey}`"
                  :camera="selectedCamera"
                  stream
                  noLink
                  hideNotifications
                  hideIndicatorFullscreen
                  :style="{ height: '100%' }"
                )
                .no-video(v-else)
                  span.no-video-text 영상을 선택해주세요
              .display-box.right-box
                .right-box-content
                  .top-box
  
                    .gauge-container
                      .gauge-meter(ref="gaugeChart")
                  .center-box
                    .chart-title 최근 7일 경보건수
                    .chart-container
                      canvas(ref="alertChart")
                  .bottom-box
                    .table-title 경보 이력
                    .alert-table
                      .table-header
                        .header-cell 경보레벨
                        .header-cell 발생일자
                      .table-body
                        .table-row(v-for="alert in alertHistory" :key="alert.id")
                          .table-cell {{ alert.level }}
                          .table-cell {{ alert.time }}
</template>
  
<script>
import { 
  mdiRefresh
} from '@mdi/js';
import { getCameras, getCameraSettings } from '@/api/cameras.api';
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
    alertHistory: [
      {
        id: 1,
        time: '2024-03-19 14:30:00',
        type: '온도',
        level: '3단계',
        maxTemp: 85,
        minTemp: 25
      },
      {
        id: 2,
        time: '2024-03-19 14:25:00',
        type: '누수',
        level: '2단계',
        maxTemp: 75,
        minTemp: 22
      },
      {
        id: 3,
        time: '2024-03-19 14:20:00',
        type: '온도',
        level: '1단계',
        maxTemp: 65,
        minTemp: 20
      },
      // 더미 데이터 추가
      {
        id: 4,
        time: '2024-03-19 14:15:00',
        type: '온도',
        level: '4단계',
        maxTemp: 90,
        minTemp: 28
      },
      {
        id: 5,
        time: '2024-03-19 14:10:00',
        type: '누수',
        level: '3단계',
        maxTemp: 82,
        minTemp: 24
      }
    ],
    env: process.env.NODE_ENV
  }),

  computed: {
    selectedCamera() {
      return this.selectedCameraIndex !== null && this.cameras.length > 0 
        ? this.cameras[this.selectedCameraIndex] 
        : null;
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
    await this.initializeData();
  },

  mounted() {
    console.log('Component mounted, cameras:', this.cameras);
    this.$socket.client.on('connect', this.handleSocketConnect);
    this.$nextTick(() => {
      this.initAlertChart();
      this.initGaugeChart();
    });
  },

  beforeDestroy() {
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
  },

  methods: {
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
      if (this.selectedCameraIndex === index) return;
      
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
      this.alertChart = echarts.init(chartDom);
      
      const option = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'shadow'
          }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: ['6일전', '5일전', '4일전', '3일전', '2일전', '어제', '오늘'],
          axisLine: {
            lineStyle: {
              color: '#ffffff'
            }
          },
          axisLabel: {
            color: '#ffffff'
          }
        },
        yAxis: {
          type: 'value',
          axisLine: {
            lineStyle: {
              color: '#ffffff'
            }
          },
          axisLabel: {
            color: '#ffffff'
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        series: [
          {
            name: '경보건수',
            type: 'bar',
            data: [3, 5, 2, 4, 6, 3, 2],
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#83bff6' },
                { offset: 0.5, color: '#188df0' },
                { offset: 1, color: '#188df0' }
              ])
            },
            emphasis: {
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#2378f7' },
                  { offset: 0.7, color: '#2378f7' },
                  { offset: 1, color: '#83bff6' }
                ])
              }
            }
          }
        ]
      };

      this.alertChart.setOption(option);
      
      // Handle window resize
      window.addEventListener('resize', this.handleChartResize);
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
              if (value === 0) return '';
              if (value === 1) return '관심';
              if (value === 2) return '주의';
              if (value === 3) return '경계';
              if (value === 4) return '심각';
              return '';
            }
          },
          title: {
            offsetCenter: [0, '20%'],
            fontSize: 14,
            color: '#fff'
          },
          detail: {
            fontSize: 30,
            offsetCenter: [0, '60%'],
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
    }
  }
};
</script>

<style lang="scss" scoped>
.notification-status {
  height: 100vh;
  background-color: #1e1e1e;
  
  .notification-card {
    background-color: transparent !important;
    height: 100%;
    
    .camera-status {
      background-color: #2d2d2d;
      border-radius: 8px;
      margin-bottom: 10px;
      padding: 2px;
      
      .status-header {
        display: flex;
        flex-direction: row;
        align-items: center;
        margin-bottom: 10px;
        
        .status-title {
          font-size: 1.25rem;
          color: #ffffff;
          margin-right: auto;
        }
      }

      .camera-list-container {
        width: 100%;
        
        .camera-grid {
          display: flex;
          flex-direction: row;
          gap: 16px;
          overflow-x: auto;
          padding: 8px 0;
          width: 100%;
          
          &::-webkit-scrollbar {
            height: 8px;
          }
          
          &::-webkit-scrollbar-track {
            background: #1e1e1e;
            border-radius: 4px;
          }
          
          &::-webkit-scrollbar-thumb {
            background: #3d3d3d;
            border-radius: 4px;
            
            &:hover {
              background: #4d4d4d;
            }
          }
        }
        
        .camera-box {
          min-width: 250px;
          max-width: 350px;
          flex: 0 0 auto;
          background: #1e1e1e;
          border: 1px solid #3d3d3d;
          border-radius: 4px;
          padding: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s ease;
          
          &:hover {
            transform: scale(1.02);
          }
          
          &.active {
            background: #3d3d3d;
            border-color: var(--cui-primary);
          }
          
          .camera-thumbnail {
            width: 100px;
            height: 80px;
            margin-bottom: 8px;
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            
            :deep(.video-card) {
              width: 100px;
              height: 80px;
              background: transparent;
              display: flex;
              align-items: center;
              justify-content: center;
              
              .video-card-content {
                border-radius: 4px;
                width: 100px;
                height: 80px;
                display: flex;
                align-items: center;
                justify-content: center;

                video, img {
                  width: 100px;
                  height: 80px;
                  object-fit: contain;
                }
              }
            }
          }
          
          .camera-info {
            width: 100%;
            padding: 4px;
            cursor: pointer;
            transition: all 0.3s ease;
            text-align: center;
            
            &:hover {
              background: #3d3d3d;
              border-radius: 4px;
            }
            
            .camera-name {
              color: #ffffff;
              font-size: 0.7rem;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              text-align: center;
            }
          }
        }
      }
    }

    .camera-display-area {
      flex: 1;
      display: flex;
      gap: 16px;
      margin-top: auto;
      height: calc(100vh - 300px);
      
      .display-box {
        background-color: #2d2d2d;
        border: 1px solid #3d3d3d;
        border-radius: 4px;
        height: 100%;

        &.left-box {
          width: 15%;
          
          .alert-history {
            height: 100%;
            display: flex;
            flex-direction: column;
            
            .alert-history-title {
              padding: 12px;
              font-size: 0.95rem;
              color: #ffffff;
              border-bottom: 1px solid #3d3d3d;
              flex-shrink: 0;
            }
            
            .alert-history-table {
              flex: 1;
              overflow-y: auto;
              padding: 8px;
              min-height: 0;
              
              .table-row {
                background: #1e1e1e;
                border-radius: 4px;
                margin-bottom: 8px;
                
                .table-item {
                  display: flex;
                  justify-content: space-between;
                  padding: 6px 10px;
                  border-bottom: 1px solid #2d2d2d;
                  
                  .item-label {
                    color: #888888;
                    font-size: 0.8rem;
                  }
                  
                  .item-value {
                    color: #ffffff;
                    font-size: 0.8rem;
                  }
                }
              }
            }
          }
        }

        &.center-box {
          width: 60%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 8px;
          
          position: relative;
          height: 100%;
          min-height: 400px;
          
          :deep(.video-card) {
            width: 100%;
            height: 100%;
            background: transparent;
            
            .video-card-content {
              border-radius: 4px;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
          }
          
          .no-video {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #666;
          }
        }

        &.right-box {
          width: 25%;
          
          .right-box-content {
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 12px;

            .top-box, .center-box, .bottom-box {
              background: #1e1e1e;
              border-radius: 4px;
              padding: 12px;
              flex: 1;
              display: flex;
              flex-direction: column;
            }

            .gauge-title, .chart-title, .table-title {
              color: #ffffff;
              font-size: 0.45rem;
              margin-bottom: 10px;
              text-align: center;
            }

            .gauge-container {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;

              .gauge-meter {
                width: 100%;
                height: 200px;
              }
            }

            .chart-container {
              flex: 1;
              position: relative;
              height: 200px;
            }

            .alert-table {
              flex: 1;
              overflow-y: auto;
              min-height: 0;
              
              .table-header {
                display: flex;
                background: #2d2d2d;
                padding: 6px;
                border-radius: 4px 4px 0 0;
                margin-bottom: 1px;
                
                .header-cell {
                  flex: 1;
                  color: #ffffff;
                  font-size: 0.7rem;
                  text-align: center;
                  font-weight: 600;
                }
              }

              .table-body {
                overflow-y: auto;
                
                .table-row {
                  display: flex;
                  padding: 6px;
                  border-bottom: 1px solid #2d2d2d;
                  transition: background-color 0.2s;
                  
                  &:hover {
                    background: #2d2d2d;
                  }
                  
                  &:last-child {
                    border-bottom: none;
                  }

                  .table-cell {
                    flex: 1;
                    color: #ffffff;
                    font-size: 0.7rem;
                    text-align: center;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    padding: 0 4px;
                    
                    &:first-child {
                      color: #888888;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

.camera-box {
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    transform: scale(1.02);
  }
  
  &.active {
    border: 2px solid #4CAF50;
  }
}

.display-box.center-box {
  position: relative;
  height: 100%;
  min-height: 400px;
  
  .no-video {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: #666;
  }
}
</style>
