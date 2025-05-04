<!-- eslint-disable vue/multi-word-component-names -->
<template lang="pug">
  .event-area
    v-container(fluid)
      v-row
        v-col(cols="6")
          v-select(
            v-if="cameraList.length"
            :items="cameraList"
            item-text="name"
            item-value="name"
            v-model="selectedCameraName"
            label="카메라 선택"
            dense
            outlined
            class="mb-4"
          )
          .video-container(style="position:relative;width:100%;height:480px;overflow:hidden;")
            VideoCard(
              v-if="selectedCamera"
              :key="videoKey"
              :ref="selectedCamera.name"
              :camera="selectedCamera"
              title
              titlePosition="inner-top"
              status
              :stream="selectedCamera.live"
              :refreshSnapshot="!selectedCamera.live"
              :style="{width: '100%', height: '100%'}"
            )
            Playground(
              v-if="selectedCamera && customizing"
              :width="playgroundWidth"
              :height="playgroundHeight"
              :regions="regions"
              :customizing="customizing"
              :options="playgroundOptions"
              @addHandle="addHandle"
              @updateHandle="updateHandle"
              style="position:absolute;top:-10px;left:-10px;width:100%;height:100%;pointer-events:all;z-index:10;"
            )
          .tw-flex.tw-justify-center.tw-mt-4
          .button-box.button-box-dark.tw-flex.tw-flex-row.tw-gap-4
            v-btn(@click="customizing ? finishCustom() : startCustom()")
              v-icon {{ customizing ? icons.mdiCheckboxMarkedCircle : icons.mdiMapMarkerRadius }}
            v-btn(@click="undo")
              v-icon {{ icons.mdiUndo }}
            v-btn(@click="clear")
              v-icon {{ icons.mdiRefresh }}
            <!-- .refresh-button-container
              v-btn(
                fab
                small
                color="secondary"
                @click="refreshVideo"
                :loading="refreshing"
              )
                v-icon {{ icons.mdiRefresh }} -->
</template>

<script>
import { getCameras, getCameraSettings } from '@/api/cameras.api';
import { getNotifications } from '@/api/notifications.api';
import VideoCard from '@/components/camera-card.vue';
import { mdiRefresh, mdiMapMarkerRadius, mdiCheckboxMarkedCircle, mdiUndo } from '@mdi/js';
import Playground from '@/components/playground.vue';
export default {
  name: 'EventArea',

  components: {
    VideoCard,
    Playground
  },

  data() {
    return {
      cameraList: [],
      selectedCameraName: '',
      selectedCamera: null,
      videoKey: '',
      refreshing: false,
      icons: {
        mdiMapMarkerRadius,
        mdiCheckboxMarkedCircle,
        mdiUndo,
        mdiRefresh
      },
      playgroundOptions: {},
      playgroundWidth: 740,
      playgroundHeight: 480,
      regions: [],
      customizing: false,
      
    };
  },
  watch: {
    selectedCameraName(newName) {
      this.updateSelectedCamera(newName);
    }
  },
  methods: {
    async updateSelectedCamera(name) {
      const camera = this.cameraList.find(cam => cam.name === name);
      if (camera) {
        this.selectedCamera = { ...camera };
        this.videoKey = camera.name + '_' + Date.now();
      }
    },
    async refreshVideo() {
      if (this.refreshing || !this.selectedCamera) return;
      this.refreshing = true;
      try {
        const videoCard = this.$refs[this.selectedCamera.name];
        if (videoCard) {
          await this.cleanupVideoResources(videoCard, this.selectedCamera.name);
        }
        const response = await getCameras();
        const camera = response.data.result.find(cam => cam.name === this.selectedCamera.name);
        if (camera) {
          const settings = await getCameraSettings(camera.name);
          camera.settings = settings.data;
          camera.favourite = camera.settings.camview.favourite;
          camera.live = camera.settings.camview.live || false;
          camera.refreshTimer = camera.settings.camview.refreshTimer || 60;
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
          this.selectedCamera = { ...camera };
          this.videoKey = camera.name + '_' + Date.now();
        }
      } catch (err) {
        this.$toast.error(err.message);
      } finally {
        this.refreshing = false;
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
  },
  async mounted() {
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
      this.cameraList = response.data.result;
      if (this.cameraList.length > 0) {
        this.selectedCameraName = this.cameraList[0].name;
        this.updateSelectedCamera(this.selectedCameraName);
      }
    } catch (err) {
      this.$toast.error(err.message);
    }
    this.updatePlaygroundSize();
    window.addEventListener('resize', this.updatePlaygroundSize);
    // 전역 cleanup 함수 등록
    window.cleanupEventArea = () => {
      this.cleanupResources();
    };
  }
};
</script>

<style lang="scss">
.event-area {
  padding: 20px;

  .video-container {
    position: relative;
    width: 100%;
    height: 480px;
    overflow: hidden;
    margin-bottom: 20px;
  }

  .video-player {
    width: 160px;
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

  .refresh-button-container {
    margin-top: 10px;
    display: flex;
    justify-content: center;
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
