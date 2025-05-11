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
            @click="customizing = false"
          )
          .video-container
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
              class="video-card"
            )
            Playground(
              v-if="selectedCamera && customizing"
              :width="videoContainerWidth"
              :height="videoContainerHeight"
              :regions="regions"
              :customizing="customizing"
              :options="playgroundOptions"
              @addHandle="addHandle"
              @updateHandle="updateHandle"
              class="playground-overlay"
            )
          .options-panel
            v-row
              v-col(cols="6")
                .option-item
                  v-row(align="center" no-gutters)
                    v-col(cols="5")
                      span.option-label Force Close Timer
                    v-col(cols="5")
                      v-slider(
                        v-model="options.forceCloseTimer.value"
                        :min="1"
                        :max="100"
                        @input="updateOptions"
                        color="primary"
                        hide-details
                        class="mt-0"
                      )
                    v-col(cols="2")
                      span.option-value {{ options.forceCloseTimer.value }}
              v-col(cols="6")
                .option-item
                  v-row(align="center" no-gutters)
                    v-col(cols="5")
                      span.option-label Dwell Timer
                    v-col(cols="5")
                      v-slider(
                        v-model="options.dwellTimer.value"
                        :min="1"
                        :max="100"
                        @input="updateOptions"
                        color="primary"
                        hide-details
                        class="mt-0"
                      )
                    v-col(cols="2")
                      span.option-value {{ options.dwellTimer.value }}
            v-row
              v-col(cols="6")
                .option-item
                  v-row(align="center" no-gutters)
                    v-col(cols="5")
                      span.option-label Sensitivity
                    v-col(cols="5")
                      v-slider(
                        v-model="options.sensitivity.value"
                        :min="1"
                        :max="100"
                        @input="updateOptions"
                        color="primary"
                        hide-details
                        class="mt-0"
                      )
                    v-col(cols="2")
                      span.option-value {{ options.sensitivity.value }}
              v-col(cols="6")
                .option-item
                  v-row(align="center" no-gutters)
                    v-col(cols="5")
                      span.option-label Difference
                    v-col(cols="5")
                      v-slider(
                        v-model="options.difference.value"
                        :min="1"
                        :max="100"
                        @input="updateOptions"
                        color="primary"
                        hide-details
                        class="mt-0"
                      )
                    v-col(cols="2")
                      span.option-value {{ options.difference.value }}
            v-row.mt-4
              v-col(cols="6")
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
              v-col(cols="3")
                v-select(
                  v-model="detectionZoneType"
                  :items="detectionZoneTypes"
                  label="Type"
                  outlined
                  dense
                  hide-details
                  dark
                  background-color="#2a2a2a"
                  color="primary"
                )
              v-col(cols="3")
                v-switch(
                  v-model="detectionZoneActive"
                  label="Active"
                  color="primary"
                  hide-details
                  dark
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
              v-icon {{ editId ? icons.mdiPencil : icons.mdiPlus }}
              span {{ editId ? 'Modify' : 'Add' }}
        v-col(cols="6")
          v-data-table(
            :headers="tableHeaders"
            :items="eventDetectionZoneList"
            item-key="id"
            class="elevation-1"
          )
            template(#[`item.no`]="{ index }")
              span {{ index + 1 }}
            template(#[`item.cameraName`]="{ item }")
              span {{ getCameraName(item.cameraId) }}
            template(#[`item.description`]="{ item }")
              span {{ item.description }}
            template(#[`item.type`]="{ item }")
              span {{ getTypeText(item.type) }}
            template(#[`item.active`]="{ item }")
              v-switch(
                v-model="item.active"
                color="primary"
                hide-details
                dense
                disabled
              )
            template(v-slot:item.actions="{ item }")
              .tw-flex.tw-items-center.tw-gap-2
                v-btn.edit-btn(
                  color="white"
                  @click.stop="onRowClick(item)"
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
import { addEventDetectionZone, getEventDetectionZone, updateEventDetectionZone, deleteEventDetectionZone } from '@/api/eventDetectionZone.api';

export default {
  name: 'EventDetectionZone',

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
      videoContainerWidth: 0,
      videoContainerHeight: 0,
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
      eventDetectionZoneList: [],
      tableHeaders: [
        { text: 'No', value: 'no', sortable: false },
        { text: '카메라', value: 'cameraName' },
        { text: 'Description', value: 'description' },
        { text: 'Type', value: 'type' },
        { text: 'Active', value: 'active' },
        { text: '작업', value: 'actions', sortable: false, align: 'center' }
      ],
      deleteDialog: false,
      rowToDelete: null,
      editId: null,
      detectionZoneType: 'Z001',
      detectionZoneActive: true,
      detectionZoneTypes: [
        { text: '객체', value: 'Z001' },
        { text: '온도', value: 'Z002' }
      ],
    };
  },
  watch: {
    selectedCameraName(newName, oldName) {
      if (newName !== oldName) {
        if (!this.editId) {  // 수정 모드가 아닐 때만 초기화
          this.customizing = false;
          this.regions = [];
          this.description = '';
          this.options = {
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
          };
        }
      }
      this.updateSelectedCamera(newName);
    }
  },
  methods: {
    async updateSelectedCamera(name) {
      const camera = this.cameraList.find(cam => cam.name === name);
      if (camera) {
        this.selectedCamera = { ...camera };
        this.videoKey = camera.name + '_' + Date.now();
        this.$nextTick(() => {
          this.updateVideoContainerSize();
        });
      }
    },

    updateVideoContainerSize() {
      const container = this.$el.querySelector('.video-container');
      if (container) {
        this.videoContainerWidth = container.offsetWidth;
        this.videoContainerHeight = container.offsetHeight;
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
      const x = Math.round((e.offsetX / this.videoContainerWidth) * 100);
      const y = Math.round((e.offsetY / this.videoContainerHeight) * 100);
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
    },

    updateHandle(payload) {
      const x = Math.round((payload.x / this.videoContainerWidth) * 100);
      const y = Math.round((payload.y / this.videoContainerHeight) * 100);
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
      this.editId = null;
      this.regions = [];
      this.description = '';
      this.detectionZoneType = 'Z001';
      this.detectionZoneActive = true;
      this.options = {
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
      };
    },

    finishCustom() {
      this.customizing = false;
      this.editId = null;
      this.regions = [];
      this.description = '';
      this.detectionZoneType = 'Z001';
      this.detectionZoneActive = true;
      this.options = {
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
      };
    },

    updateOptions() {
      this.$emit('options-updated', {
        forceCloseTimer: this.options.forceCloseTimer.value,
        dwellTimer: this.options.dwellTimer.value,
        sensitivity: this.options.sensitivity.value,
        difference: this.options.difference.value,
        description: this.description,
        type: this.detectionZoneType,
        active: this.detectionZoneActive
      });
    },

    async add() {
      if (!this.selectedCamera) {
        this.$toast.error('카메라를 선택해주세요.');
        return;
      }

      if (!this.regions || this.regions.length === 0) {
        this.$toast.error('감지 영역을 설정해주세요.');
        return;
      }

      if (!this.description || this.description.trim() === '') {
        this.$toast.error('설명을 입력해주세요.');
        return;
      }

      const cameraId = this.cameraList.findIndex(cam => cam.name === this.selectedCamera.name);
      const exist = this.eventDetectionZoneList.find(e => e.id === this.editId);
      const eventDetectionZoneData = {
        cameraId,
        options: {
          forceCloseTimer: this.options.forceCloseTimer.value,
          dwellTimer: this.options.dwellTimer.value,
          sensitivity: this.options.sensitivity.value,
          difference: this.options.difference.value
        },
        regions: this.regions,
        description: this.description,
        type: this.detectionZoneType,
        active: this.detectionZoneActive
      };
      if (exist) {
        // 수정
        await updateEventDetectionZone(exist.id, eventDetectionZoneData);
        this.$toast.success('수정되었습니다.');
      } else {
        // 추가
        await addEventDetectionZone(eventDetectionZoneData);
        this.$toast.success('이벤트 감지 영역이 저장되었습니다.');
      }
      this.clear();
      this.description = '';
      this.editId = null;
      this.detectionZoneType = '';
      this.detectionZoneActive = true;
      await this.loadEventDetectionZone();
    },
  
    async loadEventDetectionZone() {
      try {
        const res = await getEventDetectionZone();
        this.eventDetectionZoneList = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      } catch (e) {
        console.error('eventDetectionZone API error:', e);
        this.eventDetectionZoneList = [];
      }
    },

    getCameraName(cameraId) {
      return this.cameraList[cameraId]?.name || '';
    },

    onRowClick(item) {
      this.editId = item.id;
      this.selectedCameraName = this.getCameraName(item.cameraId);
      this.options.forceCloseTimer.value = item.options.forceCloseTimer;
      this.options.dwellTimer.value = item.options.dwellTimer;
      this.options.sensitivity.value = item.options.sensitivity;
      this.options.difference.value = item.options.difference;
      this.regions = JSON.parse(JSON.stringify(item.regions));
      this.description = item.description;
      this.detectionZoneType = item.type || 'Z001';
      this.detectionZoneActive = item.active;
      this.customizing = true;
    },

    async editRow(item) {
      // 현재 폼의 값으로 update
      const cameraId = this.cameraList.findIndex(cam => cam.name === this.selectedCameraName);
      const eventDetectionZoneData = {
        cameraId,
        options: {
          forceCloseTimer: this.options.forceCloseTimer.value,
          dwellTimer: this.options.dwellTimer.value,
          sensitivity: this.options.sensitivity.value,
          difference: this.options.difference.value
        },
        regions: this.regions,
        description: this.description,
        type: this.detectionZoneType,
        active: this.detectionZoneActive
      };
      await updateEventDetectionZone(item.id, eventDetectionZoneData);
      this.$toast.success('수정되었습니다.');
      this.customizing = false;
      this.editId = null;
      await this.loadEventDetectionZone();
    },

    confirmDelete(item) {
      this.rowToDelete = item;
      this.deleteDialog = true;
    },

    async deleteRow() {
      if (this.rowToDelete) {
        await deleteEventDetectionZone(this.rowToDelete.id);
        this.$toast.success('삭제되었습니다.');
        this.deleteDialog = false;
        this.rowToDelete = null;
        await this.loadEventDetectionZone();
      }
    },

    getTypeText(type) {
      const typeItem = this.detectionZoneTypes.find(t => t.value === type);
      return typeItem ? typeItem.text : type;
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
    window.cleanupEventDetectionZone = () => {
      this.cleanupResources();
    };
    await this.loadEventDetectionZone();
    window.addEventListener('resize', this.updateVideoContainerSize);
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.updateVideoContainerSize);
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

  .video-card {
    width: 100%;
    height: 100%;
  }

  .playground-overlay {
    position: absolute;
    top: -10px;
    left: -10px;
    width: 100%;
    height: 100%;
    pointer-events: all;
    z-index: 10;

    ::v-deep .handle {
      width: 10px !important;
      height: 10px !important;
      background-color: #FFD700 !important;
      border: 2px solid #FFD700 !important;
      box-shadow: none !important;
    }
  }

  .options-panel {
    margin-top: 10px;
    padding: 10px;
    background-color: #1e1e20;
    border-radius: 8px;
  }

  .option-item {
    margin-bottom: 5px;
  }

  .option-label {
    color: #fff;
    font-size: 14px;
  }

  .option-value {
    color: #fff;
    font-size: 14px;
    text-align: right;
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
