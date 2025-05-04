<!-- eslint-disable vue/multi-word-component-names -->
<template lang="pug">
.event-area
  v-container(fluid)
    v-row
      v-col(cols="6")
        .tw-flex.tw-flex-col.tw-items-center
          .video-container.tw-flex.tw-gap-4(style="position:relative;")
            .video-player.tw-flex-1
              v-select(
                v-model="selectedCamera"
                :items="cameras"
                item-text="name"
                label="카메라 선택"
                @change="onCameraChange"
                class="tw-mb-4"
                outlined
                dense
                return-object
                :loading="loading"
                :menu-props="{ closeOnClick: true }"
                :rules="[v => !!v || '카메라를 선택해주세요']"
              )
              .video-overlay-container(style="position:relative;width:600px;height:480px;")
                vue-aspect-ratio(ar="16:9" :style="'width:600px;height:480px;'")
                  VideoCard(
                    ref="videoCard"
                    v-if="selectedCamera && selectedCamera.url"
                    :camera="selectedCamera"
                    stream
                    noLink
                    hideNotifications
                    hideIndicatorFullscreen
                    style="width:100%;height:100%;"
                  )
                  div(v-else class="tw-text-center tw-text-red-500 tw-mt-4")
                    | 카메라 영상 소스가 없습니다.
                Playground(
                  v-if="selectedCamera"
                  :width="playgroundWidth"
                  :height="playgroundHeight"
                  :regions="regions"
                  :customizing="customizing"
                  :options="playgroundOptions"
                  @addHandle="addHandle"
                  @updateHandle="updateHandle"
                  style="position:absolute;top:0;left:0;pointer-events:all;z-index:10;"
                )
          .tw-flex.tw-justify-center.tw-mt-4
            .button-box.button-box-dark.tw-flex.tw-flex-row.tw-gap-4
              v-btn(@click="customizing ? finishCustom() : startCustom()")
                v-icon {{ customizing ? icons.mdiCheckboxMarkedCircle : icons.mdiMapMarkerRadius }}
              v-btn(@click="undo")
                v-icon {{ icons.mdiUndo }}
              v-btn(@click="clear")
                v-icon {{ icons.mdiRefresh }}
      v-col(cols="6")
        v-card.mt-0
          v-data-table(
            :headers="headers"
            :items="detectionZones"
            :loading="loading"
            :items-per-page="10"
            class="elevation-1"
          )
            template(#item.zoneName="{ item }")
              span {{ item.zoneName }}
            
            template(#item.zoneType="{ item }")
              v-chip(
                :color="getZoneTypeColor(item.zoneType)"
                small
                label
              ) {{ getZoneTypeText(item.zoneType) }}
            
            template(#item.activeStatus="{ item }")
              v-chip(
                :color="getStatusColor(item.activeStatus)"
                small
                label
              ) {{ getStatusText(item.activeStatus) }}
            
            template(#item.description="{ item }")
              span {{ item.description }}
            
            template(#item.createDate="{ item }")
              span {{ item.createDate }}
            
            template(#no-data)
              .text-center.pa-4
                v-icon(color="grey" size="40") {{ icons.mdiMapMarkerRadius }}
                .mt-2 감시영역이 없습니다.

</template>

<script>
import { 
  mdiMapMarkerRadius,
  mdiCheckboxMarkedCircle,
  mdiUndo,
  mdiRefresh
} from '@mdi/js'
import { getCameras, getCameraSettings } from '@/api/cameras.api';
import { getNotifications } from '@/api/notifications.api';
import VideoCard from '@/components/camera-card.vue';
import Playground from '@/components/playground.vue';
import VueAspectRatio from 'vue-aspect-ratio';
export default {
  name: 'EventArea',

  components: { VideoCard, Playground, 'vue-aspect-ratio': VueAspectRatio },

  props: {},

  data: () => ({
    icons: {
      mdiMapMarkerRadius,
      mdiCheckboxMarkedCircle,
      mdiUndo,
      mdiRefresh
    },
    loading: true,
    cameras: [],
    selectedCamera: null,
    cameraSettings: null,
    headers: [
      { text: '영역명', value: 'zoneName', sortable: true },
      { text: '영역유형', value: 'zoneType', sortable: true },
      { text: '상태', value: 'activeStatus', sortable: true },
      { text: '설명', value: 'description', sortable: true },
      { text: '생성일', value: 'createDate', sortable: true }
    ],
    detectionZones: [
      {
        zoneName: '수문',
        zoneType: 'gate',
        activeStatus: true,
        description: '수문의 개폐 상태 감시',
        createDate: '2024-05-01',
      },
      {
        zoneName: '발전기실',
        zoneType: 'generator',
        activeStatus: true,
        description: '발전기실 내부 감시',
        createDate: '2024-05-02',
      },
      {
        zoneName: '제방',
        zoneType: 'levee',
        activeStatus: true,
        description: '제방 붕괴 및 침수 감시',
        createDate: '2024-05-03',
      },
      {
        zoneName: '출입구',
        zoneType: 'entrance',
        activeStatus: false,
        description: '댐 출입구 감시',
        createDate: '2024-05-04',
      },
      {
        zoneName: '제어실',
        zoneType: 'control',
        activeStatus: true,
        description: '제어실 출입 및 내부 감시',
        createDate: '2024-05-05',
      },
      {
        zoneName: '수로',
        zoneType: 'waterway',
        activeStatus: true,
        description: '수로 유입/유출 감시',
        createDate: '2024-05-06',
      },
      {
        zoneName: '주차장',
        zoneType: 'parking',
        activeStatus: false,
        description: '댐 내 주차장 감시',
        createDate: '2024-05-07',
      },
      {
        zoneName: '외곽 울타리',
        zoneType: 'fence',
        activeStatus: true,
        description: '외곽 울타리 침입 감시',
        createDate: '2024-05-08',
      },
      {
        zoneName: '비상 대피로',
        zoneType: 'emergency_exit',
        activeStatus: true,
        description: '비상 대피로 감시',
        createDate: '2024-05-09',
      },
      {
        zoneName: '펌프실',
        zoneType: 'pump',
        activeStatus: false,
        description: '펌프실 내부 감시',
        createDate: '2024-05-10',
      },
    ],
    videoError: null,
    regions: [],
    playgroundOptions: {},
    playgroundWidth: 600,
    playgroundHeight: 480,
    refreshing: false,
    videoKey: '',
  }),

  watch: {
    cameraList: {
      handler(newVal) {
        console.log('cameraList changed:', newVal);
      },
      deep: true
    },
  },

  async mounted() {
    this.loading = true;
    try {
      const response = await getCameras();
      for (const camera of response.data.result) {
        const settings = await getCameraSettings(camera.name);
        camera.settings = settings.data;
        camera.favourite = camera.settings.camview.favourite;
        camera.live = camera.settings.camview.live || false;
        camera.refreshTimer = camera.settings.camview.refreshTimer || 60;
        const lastNotification = await getNotifications(`?cameras=${camera.name}&pageSize=5`);
        camera.lastNotification = lastNotification.data.result.length > 0 ? lastNotification.data.result[0] : false;
        camera.url = camera.videoConfig.source.replace(/\u00A0/g, ' ').split('-i ')[1];
        if (!camera.url.startsWith('/')) {
          const protocol = camera.url.split('://')[0];
          const url = new URL(camera.url.replace(protocol, 'http'));
          camera.url = `${protocol}://${url.hostname}:${url.port || 80}${url.pathname}`;
        }
      }
      this.cameras = response.data.result;
      if (this.cameras.length > 0) {
        this.videoKey = this.cameras[0].name + '_' + Date.now();
      }
      this.selectedCamera = this.cameras.find(cam => cam.url) || null;
    } catch (e) {
      this.$toast.error('카메라 목록을 불러오지 못했습니다.');
      this.selectedCamera = null;
    } finally {
      this.loading = false;
    }
    this.updatePlaygroundSize();
    window.addEventListener('resize', this.updatePlaygroundSize);
    // 전역 cleanup 함수 등록
    window.cleanupEventArea = () => {
      this.cleanupResources();
    };
    // F5 refresh 감지
    window.addEventListener('beforeunload', window.cleanupEventArea);
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.updatePlaygroundSize);
    this.cleanupResources();
  },

  methods: {
    onCameraChange(camera) {
      this.selectedCamera = camera && camera.url ? camera : null;
      this.playgroundOptions = { background: '' };
      this.regions = [];
    },

    addHandle(e) {
      const x = Math.round((e.offsetX / this.playgroundWidth) * 100);
      const y = Math.round((e.offsetY / this.playgroundHeight) * 100);
      let regionIndex = this.regions.length - 1;
      if (
        !this.regions.length ||
        (this.regions[regionIndex] && this.regions[regionIndex].finished)
      ) {
        this.regions.push({
          finished: false,
          coords: [],
        });
        regionIndex = this.regions.length - 1;
      }
      this.regions[regionIndex].coords.push([x, y]);
      // 마지막 region의 coords만 출력
      if (this.regions[regionIndex]) {
        console.log('current region coords:', JSON.parse(JSON.stringify(this.regions[regionIndex].coords)));
      }
    },

    updateHandle(payload) {
      const x = Math.round((payload.x / 600) * 100);
      const y = Math.round((payload.y / 480) * 100);
      this.$set(this.regions[payload.regionIndex].coords, payload.coordIndex, [x, y]);
    },

    undo() {
      if (!this.regions.length) return;
      const rIndex = this.regions.length - 1;
      this.regions[rIndex].coords.pop();
      if (!this.regions[rIndex].coords.length) {
        this.regions.splice(rIndex, 1);
      }
    },

    clear() {
      this.regions = [];
    },

    startCustom() {
      this.customizing = true;
    },

    finishCustom() {
      this.customizing = false;
      if (!this.regions.length) return;
      const rIndex = this.regions.length - 1;
      if (this.regions[rIndex].coords.length < 3) {
        this.regions.splice(rIndex, 1);
      } else {
        this.regions[rIndex].finished = true;
      }
    },

    getZoneTypeColor(type) {
      const typeMap = {
        entrance: 'blue',
        parking: 'green',
        security: 'red',
        passage: 'purple',
        emergency: 'orange',
        warehouse: 'brown',
        office: 'grey',
        rest: 'pink',
        machine: 'cyan'
      };
      return typeMap[type] || 'grey';
    },

    getZoneTypeText(type) {
      const typeMap = {
        entrance: '출입구',
        parking: '주차장',
        security: '보안구역',
        passage: '통로',
        emergency: '비상구',
        warehouse: '창고',
        office: '사무실',
        rest: '휴게실',
        machine: '기계실'
      };
      return typeMap[type] || type;
    },

    getStatusColor(status) {
      return status ? 'green' : 'grey';
    },

    getStatusText(status) {
      return status ? '활성' : '비활성';
    },

    handleVideoError(event) {
      console.error('Video error:', event);
      this.$toast.error('비디오를 재생할 수 없습니다.');
    },

    handleKeyDown(event) {
      if (event.key === 'Escape' || event.keyCode === 27) {
        this.customizing = false;
      }
    },

    handleOrientationChange() {
      this.updatePlaygroundSize();
    },

    updatePlaygroundSize() {
      this.$nextTick(() => {
        const el = this.$el.querySelector('.video-overlay-container');
        if (el) {
          this.playgroundWidth = el.offsetWidth;
          this.playgroundHeight = el.offsetHeight;
        }
      });
    },

    handleVisibilityChange() {
      if (document.hidden) {
        this.cleanupResources();
      }
    },

    handlePageHide() {
      this.cleanupResources();
    },

    cleanupResources() {
      try {
        console.log('Cleaning up resources...');
        
        // Video 관련 리소스 정리
        if (this.selectedCamera) {
          // VideoCard 컴포넌트의 video 요소 정리
          const videoElement = this.$el.querySelector('video');
          if (videoElement) {
            videoElement.pause();
            videoElement.src = '';
            videoElement.load();
          }

          // VideoCard 컴포넌트의 canvas 요소 정리
          const canvasElement = this.$el.querySelector('canvas');
          if (canvasElement) {
            const context = canvasElement.getContext('2d');
            if (context) {
              context.clearRect(0, 0, canvasElement.width, canvasElement.height);
            }
          }
          
          // VideoCard 컴포넌트의 스트림 정리
          if (this.selectedCamera.videoConfig && this.selectedCamera.videoConfig.source) {
            this.selectedCamera.videoConfig.source = '';
          }

          // JSMpeg 플레이어 정리
          const videoCard = this.$refs.videoCard;
          if (videoCard && videoCard.player) {
            try {
              videoCard.player.destroy();
              videoCard.player = null;
            } catch (error) {
              console.warn('Error destroying JSMpeg player:', error);
            }
          }

          // 소켓 연결 해제
          this.$socket.client.emit('leave_stream', {
            feed: this.selectedCamera.name,
          });
          
          // selectedCamera 초기화
          this.selectedCamera = null;
        }
        
        // regions 초기화
        this.regions = [];
        this.customizing = false;

        // 이벤트 리스너 정리
        document.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('orientationchange', this.handleOrientationChange);
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    },

    async cleanupVideoResources(videoCard, cameraName) {
      this.$socket.client.emit('leave_stream', { feed: cameraName });
      if (videoCard.player) {
        try {
          videoCard.player.destroy();
          videoCard.player = null;
        } catch (error) {
          console.warn('Error destroying player:', error);
        }
      }
      this.$socket.client.off(cameraName);
      videoCard.loading = true;
      videoCard.offline = false;
      videoCard.play = false;
    },

    async refreshVideo() {
      if (this.refreshing) return;
      this.refreshing = true;
      try {
        const currentCameraName = this.cameras[0]?.name;
        const videoCard = this.$refs[currentCameraName];
        if (videoCard) {
          await this.cleanupVideoResources(videoCard, currentCameraName);
        }
        const response = await getCameras();
        const camera = response.data.result.find(cam => cam.name === currentCameraName);
        if (camera) {
          const settings = await getCameraSettings(camera.name);
          camera.settings = settings.data;
          camera.favourite = camera.settings.camview.favourite;
          camera.live = camera.settings.camview.live || false;
          camera.refreshTimer = camera.settings.camview.refreshTimer || 60;
          const lastNotification = await getNotifications(`?cameras=${camera.name}&pageSize=5`);
          camera.lastNotification = lastNotification.data.result.length > 0 ? lastNotification.data.result[0] : false;
          if (!camera.videoConfig || !camera.videoConfig.source) {
            this.$toast.error(`${camera.name} 영상 소스가 없습니다.`);
            this.refreshing = false;
            return;
          }
          camera.url = camera.videoConfig.source.replace(/\u00A0/g, ' ').split('-i ')[1];
          if (!camera.url.startsWith('/')) {
            const protocol = camera.url.split('://')[0];
            const url = new URL(camera.url.replace(protocol, 'http'));
            camera.url = `${protocol}://${url.hostname}:${url.port || 80}${url.pathname}`;
          }
          this.cameras[0] = { ...camera };
          this.videoKey = camera.name + '_' + Date.now();
        }
      } catch (err) {
        console.log(err);
        this.$toast.error(err.message);
      } finally {
        this.refreshing = false;
      }
    }
  },

  beforeRouteLeave(to, from, next) {
    this.cleanupResources();
    next();
  },
};
</script>

<style lang="scss">
.event-area {
  padding: 20px;

  .video-container {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
  }

  .video-player {
    flex: 1;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.3s;

    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  .button-box-dark {
    border-radius: 12px;
    background: #1e1e20;
    padding: 24px 0 16px 0;
    margin: 32px 0 16px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 24px rgba(0,0,0,0.25);
    min-width: 200px;
    max-height: 200px;
  }

  .v-card-title {
    color: var(--cui-text-default) !important;
    font-size: 1.25rem;
    font-weight: 500;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(var(--cui-bg-nav-border-rgb));
  }

  .v-data-table ::v-deep {
    .v-data-table__wrapper {
      overflow-x: auto;
    }

    tbody tr {
      cursor: pointer;

      &:hover {
        background-color: rgba(0, 0, 0, 0.03);
      }
    }
  }
}
</style> 
