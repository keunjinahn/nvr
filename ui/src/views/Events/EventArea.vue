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
          .options-panel(style="margin-top: 10px; padding: 10px; background-color: #1e1e20; border-radius: 8px;")
            .option-item(v-for="(option, key) in options" :key="key" style="margin-bottom: 5px;")
              v-row(align="center" no-gutters)
                v-col(cols="3")
                  span(style="color: #fff; font-size: 14px;") {{ option.label }}
                v-col(cols="8")
                  v-slider(
                    v-model="option.value"
                    :min="1"
                    :max="100"
                    @input="updateOptions"
                    color="primary"
                    hide-details
                    class="mt-0"
                  )
                v-col(cols="1")
                  span.text-right(style="color: #fff; font-size: 14px;") {{ option.value }}
            .description-field(style="margin-top: 10px;")
              v-text-field(
                v-model="description"
                label="Description"
                outlined
                dense
                hide-details
                dark
                background-color="#2a2a2a"
                color="primary"
              )
          .tw-flex.tw-justify-center.tw-mt-4
          .button-box.button-box-dark.tw-flex.tw-flex-row.tw-gap-4
            v-btn(@click="customizing ? finishCustom() : startCustom()")
              v-icon {{ customizing ? icons.mdiCheckboxMarkedCircle : icons.mdiMapMarkerRadius }}
            v-btn(@click="undo")
              v-icon {{ icons.mdiUndo }}
            v-btn(@click="clear")
              v-icon {{ icons.mdiRefresh }}
            v-btn(@click="add")
              v-icon {{ icons.mdiPlus }}
        v-col(cols="6")
          v-data-table(
            :headers="tableHeaders"
            :items="eventAreaList"
            item-key="id"
            class="elevation-1"
            @click:row="onRowClick"
          )
            template(#[`item.no`]="{ index }")
              span {{ index + 1 }}
            template(#[`item.cameraName`]="{ item }")
              span {{ getCameraName(item.cameraId) }}
            template(#[`item.description`]="{ item }")
              span {{ item.description }}
            template(v-slot:item.actions="{ item }")
              .tw-flex.tw-items-center.tw-gap-2
                v-btn.edit-btn(
                  color="white"
                  @click.stop="editRow(item)"
                  outlined
                )
                  v-icon(left size="20" ) {{ icons['mdiPencil'] }}
                  span 수정
                v-btn.delete-btn(
                  color="error"
                  @click.stop="confirmDelete(item)"
                  outlined
                )
                  v-icon(left size="20") {{ icons['mdiDelete'] }}
                  span 삭제              

          v-dialog(v-model="deleteDialog" max-width="400px")
            v-card
              v-card-title.error--text 삭제 확인
              v-card-text 정말 삭제하시겠습니까?
              v-card-actions
                v-btn(@click="deleteDialog = false") 취소
                v-btn(color="error" @click="deleteRow") 삭제
</template>

<script>
import { getCameras, getCameraSettings } from '@/api/cameras.api';
import { getNotifications } from '@/api/notifications.api';
import VideoCard from '@/components/camera-card.vue';
import { mdiRefresh, mdiMapMarkerRadius, mdiCheckboxMarkedCircle, mdiUndo, mdiPlus, mdiPencil, mdiDelete } from '@mdi/js';
import Playground from '@/components/playground.vue';
import { addEventArea, getEventAreas, updateEventArea, deleteEventArea } from '@/api/eventArea.api';

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
      description: '',
      icons: {
        mdiMapMarkerRadius,
        mdiCheckboxMarkedCircle,
        mdiUndo,
        mdiRefresh,
        mdiPlus,
        mdiPencil,
        mdiDelete
      },
      playgroundOptions: {},
      playgroundWidth: 740,
      playgroundHeight: 480,
      regions: [],
      customizing: false,
      options: {
        forceCloseTimer: {
          label: 'Force Close Timer',
          value: 30
        },
        dwellTimer: {
          label: 'Dwell Timer',
          value: 50
        },
        sensitivity: {
          label: 'Sensitivity',
          value: 75
        },
        difference: {
          label: 'Difference',
          value: 50
        }
      },
      eventAreaList: [],
      tableHeaders: [
        { text: 'No', value: 'no', sortable: false },
        { text: '카메라', value: 'cameraName' },
        { text: 'Description', value: 'description' },
        { text: '작업', value: 'actions', sortable: false, align: 'center' }
      ],
      deleteDialog: false,
      rowToDelete: null,
      editId: null,
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

    updateOptions() {
      this.$emit('options-updated', {
        forceCloseTimer: this.options.forceCloseTimer.value,
        dwellTimer: this.options.dwellTimer.value,
        sensitivity: this.options.sensitivity.value,
        difference: this.options.difference.value,
        description: this.description
      });
    },

    async add() {
      if (!this.selectedCamera) {
        this.$toast.error('카메라를 선택해주세요.');
        return;
      }
      const cameraId = this.cameraList.findIndex(cam => cam.name === this.selectedCamera.name);
      const exist = this.eventAreaList.find(e => e.cameraId === cameraId && e.description === this.description);
      const eventAreaData = {
        cameraId,
        options: {
          forceCloseTimer: this.options.forceCloseTimer.value,
          dwellTimer: this.options.dwellTimer.value,
          sensitivity: this.options.sensitivity.value,
          difference: this.options.difference.value
        },
        regions: this.regions,
        description: this.description
      };
      if (exist) {
        // 수정
        await updateEventArea(exist.id, eventAreaData);
        this.$toast.success('수정되었습니다.');
      } else {
        // 추가
        await addEventArea(eventAreaData);
        this.$toast.success('이벤트 영역이 저장되었습니다.');
      }
      this.clear();
      this.description = '';
      this.editId = null;
      await this.loadEventAreas();
    },

    async loadEventAreas() {
      try {
        const res = await getEventAreas();
        this.eventAreaList = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      } catch (e) {
        console.error('eventArea API error:', e);
        this.eventAreaList = [];
      }
    },

    getCameraName(cameraId) {
      return this.cameraList[cameraId]?.name || '';
    },

    onRowClick(item) {
      // row 클릭 시 왼쪽 폼/비디오/영역 값 세팅
      this.editId = item.id;
      this.selectedCameraName = this.getCameraName(item.cameraId);
      this.options.forceCloseTimer.value = item.options.forceCloseTimer;
      this.options.dwellTimer.value = item.options.dwellTimer;
      this.options.sensitivity.value = item.options.sensitivity;
      this.options.difference.value = item.options.difference;
      this.regions = JSON.parse(JSON.stringify(item.regions));
      this.description = item.description;
      this.customizing = true;
    },

    async editRow(item) {
      // 현재 폼의 값으로 update
      const cameraId = this.cameraList.findIndex(cam => cam.name === this.selectedCameraName);
      const eventAreaData = {
        cameraId,
        options: {
          forceCloseTimer: this.options.forceCloseTimer.value,
          dwellTimer: this.options.dwellTimer.value,
          sensitivity: this.options.sensitivity.value,
          difference: this.options.difference.value
        },
        regions: this.regions,
        description: this.description
      };
      await updateEventArea(item.id, eventAreaData);
      this.$toast.success('수정되었습니다.');
      this.customizing = false;
      this.editId = null;
      await this.loadEventAreas();
    },

    confirmDelete(item) {
      this.rowToDelete = item;
      this.deleteDialog = true;
    },

    async deleteRow() {
      if (this.rowToDelete) {
        await deleteEventArea(this.rowToDelete.id);
        this.$toast.success('삭제되었습니다.');
        this.deleteDialog = false;
        this.rowToDelete = null;
        await this.loadEventAreas();
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
    // 전역 cleanup 함수 등록
    window.cleanupEventArea = () => {
      this.cleanupResources();
    };
    await this.loadEventAreas();
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
