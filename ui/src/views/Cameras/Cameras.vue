<template lang="pug">
.tw-flex.tw-justify-center.tw-items-center.page-loading(v-if="loading")
  v-progress-circular(indeterminate color="var(--cui-primary)")
.tw-py-6.tw-px-4(v-else)
  .pl-safe.pr-safe
    
    .tw-flex.tw-justify-between.tw-items-center
      .tab-bar-container.tw-flex.tw-rounded-lg.tw-bg-gray-800.tw-p-1(v-if="showListOptions")
        .tab-item.tw-px-4.tw-py-2.tw-cursor-pointer.tw-flex.tw-items-center.tw-transition-all(
          :class="listMode ? 'tw-bg-gray-700 tw-shadow-sm tw-text-primary' : 'tw-text-gray-400'"
          @click="goToVideoView"
        )
          v-icon.tw-mr-2(size="50") {{ icons['mdiViewModule'] }}
          span 영상조회        
        .tab-item.tw-px-4.tw-py-2.tw-cursor-pointer.tw-flex.tw-items-center.tw-transition-all(
          :class="!listMode ? 'tw-bg-gray-700 tw-shadow-sm tw-text-primary' : 'tw-text-gray-400'"
          @click="goToMonitoring"
        )
          v-icon.tw-mr-2(size="50") {{ icons['mdiFormatListBulleted'] }}
          span 영상모니터링
      
      v-btn.add-video-btn(
        elevation="1"
        @click="showAddVideoDialog"
        :ripple="false"
        v-if="listMode"
      )
        v-icon.tw-mr-2(size="22" color="white") {{ icons['mdiPlus'] }}
        span.tw-font-semibold.tw-text-slate-800 영상추가

    .tw-mt-5
      v-data-table.tw-w-full(
        v-if="listMode && cameras.length"
        @click:row="clickRow"
        :items-per-page="-1"
        calculate-widths
        disable-pagination
        hide-default-footer
        :loading="loading"
        :headers="headers"
        :items="cameras"
        :no-data-text="$t('no_data_available')"
        item-key="name"
        class="elevation-1"
        mobile-breakpoint="0"
      )
        template(v-slot:item.status="{ item }")
          .tw-w-full.tw-text-center  
            v-icon(size="10" :color="camStates.some((cam) => cam.name === item.name && cam.status === 'ONLINE') ? 'success' : 'error'") {{ icons['mdiCircle'] }}
        template(v-slot:item.preview="{ item }")
          vue-aspect-ratio.tw-m-3(ar="16:9" width="100px")
            VideoCard(:camera="item" snapshot @cameraStatus="cameraStatus")
        template(v-slot:item.name="{ item }")
          b {{ item.name }}
        template(v-slot:item.model="{ item }")
          .text-font-disabled {{ item.model || 'IP Camera' }}
        template(v-slot:item.address="{ item }")
          .text-font-disabled {{ item.url }}
        template(v-slot:item.lastNotification="{ item }")
          .text-font-disabled {{ item.lastNotification ? item.lastNotification.time : $t('no_data') }}
        template(v-slot:item.liveFeed="{ item }")
          v-chip(color="var(--cui-primary)" dark small style="cursor: pointer" @click="$router.push(`/cameras/${item.name}`)") {{ camStates.some((cam) => cam.name === item.name && cam.status === 'ONLINE') ? $t('live') : $t('offline') }}
        template(v-slot:item.actions="{ item }")
          .tw-flex.tw-items-center.tw-gap-2
            v-btn.edit-btn(
              color="error"
              @click.stop="showEditVideoDialog(item)"
              outlined
            )
              v-icon(left size="20") {{ icons['mdiPencil'] }}
              span 수정
            v-btn.delete-btn(
              color="primary"
              @click.stop="showDeleteVideoDialog(item)"
              outlined
            )
              v-icon(left size="20") {{ icons['mdiDelete'] }}
              span 삭제

      div(v-for="room in rooms" :key="room" v-if="!listMode && ((room === 'Standard' && cameras.find((cam) => cam.settings.room === room)) || room !== 'Standard')")
        .tw-mt-7(v-if="room !== 'Standard'")
        
        v-divider.tw-mt-3

        v-layout.tw-mt-5(
          row 
          wrap
          :style="cameras.length === 4 ? 'margin-left: 10%; margin-right: 10%; width: 80%;' : ''"
        )
          v-flex.tw-mb-3.tw-px-2(
            v-if="!listMode && camera.settings.room === room" 
            v-for="camera in cameras" 
            :key="camera.name"
            :class="cameras.length === 4 ? 'xs12 sm6 md6 lg6' : 'xs12 sm6 md4 lg3'"
            :style="cameras.length === 4 ? 'max-width: 50%; flex-basis: 50%;' : ''"
          )
            .video-container(
              :style="cameras.length === 4 ? 'padding: 10px;' : ''"
            )
              vue-aspect-ratio(
                ar="16:9"
                :style="cameras.length === 4 ? 'max-width: 100%;' : ''"
              )
                VideoCard(
                  :camera="camera" 
                  title 
                  titlePosition="bottom"
                  stream
                  :style="'width: 100%; height: 100%; min-height: 0;'"
                )

    infinite-loading(:identifier="infiniteId", @infinite="infiniteHandler")
      div(slot="spinner")
        v-progress-circular(indeterminate color="var(--cui-primary)")
      .tw-mt-10.tw-text-sm.text-muted(slot="no-more") {{ $t("no_more_cameras") }}
      .tw-mt-10.tw-text-sm.text-muted(slot="no-results") {{ $t("no_cameras") }} :(

  LightBox(
    ref="lightboxBanner"
    :media="notImages"
    :showLightBox="false"
    :showThumbs="false"
    showCaption
    disableScroll
  )

  // 영상 추가/수정 다이얼로그
  v-dialog(
    v-model="addVideoDialog"
    max-width="800"
    persistent
  )
    v-card.add-video-dialog
      v-card-title.dialog-title
        .tw-flex.tw-items-center.tw-w-full
          v-icon.tw-mr-3(color="var(--cui-primary)" size="32") {{ icons['mdiVideo'] }}
          .tw-flex.tw-flex-col
            .title-text {{ isEditMode ? '열화상 영상 수정' : '열화상 영상 추가' }}
            .subtitle-text.tw-mt-1 {{ isEditMode ? '열화상 카메라 정보를 수정합니다' : '새로운 열화상 카메라를 추가합니다' }}
      v-card-text.dialog-content
        .tw-flex.tw-items-center.tw-justify-center.tw-absolute.tw-inset-0.tw-z-10.tw-bg-white.tw-bg-opacity-80(v-if="isProcessing")
          v-progress-circular(indeterminate color="var(--cui-primary)")
        v-form(ref="form" v-model="valid")
          .form-group
            .input-label 영상 제목
            v-text-field(
              v-model="videoTitle"
              placeholder="영상의 제목을 입력해주세요"
              :rules="[v => !!v || '영상 제목을 입력해주세요']"
              outlined
              hide-details="auto"
              class="url-input"
              :disabled="isProcessing"
            )
          .form-group
            .input-label 열화상 주소
            v-text-field(
              v-model="videoUrl"
              placeholder="rtsp://username:password@camera-ip:port/stream"
              :rules="[v => !!v || '열화상 주소를 입력해주세요']"
              outlined
              hide-details="auto"
              class="url-input"
              :disabled="isProcessing"
            )
            .input-helper.tw-mt-2 RTSP 스트리밍 주소를 입력해주세요
      v-card-actions.dialog-actions
        v-spacer
        v-btn.cancel-btn(
          outlined
          @click="closeAddVideoDialog"
          :disabled="isProcessing"
        ) 취소
        v-btn.confirm-btn(
          color="var(--cui-primary)"
          :disabled="!valid || isProcessing"
          @click="addVideo"
        ) 
          v-progress-circular.tw-mr-2(
            v-if="isProcessing"
            indeterminate
            size="20"
            width="2"
            color="white"
          )
          v-icon.tw-mr-2(v-else size="20") {{ isEditMode ? icons['mdiContentSave'] : icons['mdiPlus'] }}
          span {{ isEditMode ? '수정하기' : '추가하기' }}

  // 영상 삭제 다이얼로그
  v-dialog(
    v-model="deleteVideoDialog"
    max-width="800"
    persistent
  )
    v-card.add-video-dialog
      v-card-title.dialog-title
        .tw-flex.tw-items-center.tw-w-full
          v-icon.tw-mr-3(color="var(--cui-primary)" size="32") {{ icons['mdiVideo'] }}
          .tw-flex.tw-flex-col
            .title-text 열화상 영상 삭제
      v-card-text.dialog-content
        .tw-flex.tw-items-center.tw-justify-center.tw-absolute.tw-inset-0.tw-z-10.tw-bg-white.tw-bg-opacity-80(v-if="isProcessing")
          v-progress-circular(indeterminate color="var(--cui-primary)")
        .tw-text-lg.tw-text-gray-700 {{ selectedCamera ? selectedCamera.name : '' }} 열화상 영상을 삭제 하시겠습니까?
      v-card-actions.dialog-actions
        v-spacer
        v-btn.cancel-btn(
          outlined
          @click="closeDeleteVideoDialog"
          :disabled="isProcessing"
        ) 취소
        v-btn.confirm-btn(
          color="error"
          @click="deleteVideo"
          :disabled="isProcessing"
        ) 
          v-progress-circular.tw-mr-2(
            v-if="isProcessing"
            indeterminate
            size="20"
            width="2"
            color="white"
          )
          span(v-else) 삭제
</template>

<script>
import LightBox from 'vue-it-bigger';
import 'vue-it-bigger/dist/vue-it-bigger.min.css';
import InfiniteLoading from 'vue-infinite-loading';
import { mdiCircle, mdiPlus, mdiFormatListBulleted, mdiViewModule, mdiVideo, mdiDelete, mdiPencil, mdiContentSave } from '@mdi/js';
import VueAspectRatio from 'vue-aspect-ratio';

import { getSetting } from '@/api/settings.api';
import { getCameras, getCameraSettings, addCamera, removeCamera } from '@/api/cameras.api';
import { getNotifications } from '@/api/notifications.api';

import FilterCard from '@/components/filter.vue';
import VideoCard from '@/components/camera-card.vue';

import socket from '@/mixins/socket';

export default {
  name: 'Cameras',

  components: {
    LightBox,
    FilterCard,
    InfiniteLoading,
    VideoCard,
    'vue-aspect-ratio': VueAspectRatio,
  },

  mixins: [socket],

  beforeRouteLeave(to, from, next) {
    this.loading = true;
    next();
  },

  data: () => ({
    icons: {
      mdiCircle,
      mdiPlus,
      mdiFormatListBulleted,
      mdiViewModule,
      mdiVideo,
      mdiDelete,
      mdiPencil,
      mdiContentSave,
    },

    cameras: [],
    loading: false,
    infiniteId: Date.now(),
    page: 1,
    query: '',

    rooms: [],
    camStates: [],

    backupHeaders: [],
    headers: [
      {
        text: '상태',
        value: 'status',
        align: 'center',
        sortable: false,
        class: 'tw-py-3',
        cellClass: 'tw-py-3',
        width: '60px',
      },
      {
        text: '스냅샷',
        value: 'preview',
        align: 'center',
        sortable: false,
        width: '100px',
        class: 'tw-px-1',
        cellClass: 'tw-px-0',
      },
      {
        text: '카메라이름',
        value: 'name',
        align: 'center',
        sortable: true,
        class: 'tw-pl-3 tw-pr-1',
        cellClass: 'tw-pl-3 tw-pr-1',
      },
      {
        text: '장비모델',
        value: 'model',
        align: 'center',
        sortable: true,
        class: 'tw-pl-3 tw-pr-1',
        cellClass: 'tw-pl-3 tw-pr-1',
      },
      {
        text: 'RTSP 주소',
        value: 'address',
        align: 'center',
        sortable: false,
        class: 'tw-pl-3 tw-pr-1',
        cellClass: 'tw-pl-3 tw-pr-1',
      },
      // {
      //   text: 'Last Motion',
      //   value: 'lastNotification',
      //   align: 'start',
      //   sortable: true,
      //   class: 'tw-pl-3 tw-pr-1',
      //   cellClass: 'tw-pl-3 tw-pr-1',
      // },
      {
        text: '온라인/오프라인',
        value: 'liveFeed',
        align: 'center',
        sortable: false,
        class: 'tw-pl-3 tw-pr-1',
        cellClass: 'tw-pl-3 tw-pr-1',
      },
      {
        text: '수정/삭제',
        value: 'actions',
        align: 'center',
        sortable: false,
        width: '100px',
      },
    ],

    oldSelected: false,
    listMode: false,
    showListOptions: true,

    addVideoDialog: false,
    deleteVideoDialog: false,
    selectedCamera: null,
    videoUrl: '',
    videoTitle: '',
    valid: true,
    isEditMode: false,
    originalName: '',
    isProcessing: false,
    cam: {
        name: '',
        motionTimeout: 15,
        recordOnMovement: false,
        prebuffering: false,
        videoConfig: {
          source: '',
          stillImageSource: '',
          stimeout: 10,
          audio: false,
          debug: false,
        },
        mqtt: {},
        smtp: {
          email: '',
        },
        videoanalysis: {
          active: false,
        },
      },
  }),

  beforeDestroy() {
    ['resize', 'orientationchange'].forEach((event) => {
      window.removeEventListener(event, this.onResize);
    });
  },

  async mounted() {
    localStorage.setItem('listModeCameras', '2');
    const response = await getSetting('general');
    this.rooms = response.data.rooms;
    this.listMode = this.oldSelected = localStorage.getItem('listModeCameras') === '1';
    this.backupHeaders = [...this.headers];

    this.loading = false;

    ['resize', 'orientationchange'].forEach((event) => {
      window.addEventListener(event, this.onResize);
    });

    this.onResize();
  },

  methods: {
    cameraStatus(data) {
      if (!this.camStates.some((cam) => cam.name === data.name)) {
        this.camStates.push(data);
      }
    },
    clickRow(item) {
      this.$router.push(`/cameras/${item.name}`);
    },
    changeListView(view) {
      localStorage.setItem('listModeCameras', view);
      this.listMode = this.oldSelected = view === 1;
    },
    filter(filterQuery) {
      this.loading = true;
      this.cameras = [];
      this.page = 1;
      this.query = filterQuery;
      this.infiniteId = Date.now();
      this.loading = false;
    },
    async infiniteHandler($state) {
      try {
        const response = await getCameras(`?pageSize=5&page=${this.page || 1}` + this.query);

        for (const camera of response.data.result) {
          const settings = await getCameraSettings(camera.name);
          camera.settings = settings.data;

          const lastNotification = await getNotifications(`?cameras=${camera.name}&pageSize=5`);
          camera.lastNotification = lastNotification.data.result.length > 0 ? lastNotification.data.result[0] : false;

          camera.url = camera.videoConfig.source.replace(/\u00A0/g, ' ').split('-i ')[1];

          if (!camera.url.startsWith('/')) {
            const protocol = camera.url.split('://')[0];
            const url = new URL(camera.url.replace(protocol, 'http'));
            camera.url = `${protocol}://${url.hostname}:${url.port || 80}${url.pathname}`;
          }
        }

        if (response.data.result.length > 0) {
          this.page += 1;
          this.cameras.push(...response.data.result);

          $state.loaded();
        } else {
          $state.complete();
        }
      } catch (err) {
        console.log(err);
        this.$toast.error(err.message);
      }
    },
    onResize() {
      const removeHeaders = [];

      if (this.windowWidth() < 415) {
        removeHeaders.push('model', 'address', 'lastNotification', 'liveFeed');
      } else if (this.windowWidth() < 650) {
        removeHeaders.push('model', 'address', 'lastNotification');
      } else if (this.windowWidth() <= 800) {
        removeHeaders.push('model', 'lastNotification');
      } else if (this.windowWidth() < 900) {
        removeHeaders.push('model');

        /*if (!this.toggleView) {
          this.toggleView = true;
          this.oldSelected = this.listMode;
        }

        this.showListOptions = false;
        this.listMode = false;*/
      } else {
        /*this.showListOptions = true;

        if (this.toggleView) {
          this.listMode = this.oldSelected;
          this.toggleView = false;
        }*/
      }

      let headers = [...this.backupHeaders];

      if (removeHeaders.length) {
        headers = headers.filter((header) => !removeHeaders.some((val) => header.value === val));
      }

      this.headers = headers;
    },
    windowWidth() {
      return window.innerWidth && document.documentElement.clientWidth
        ? Math.min(window.innerWidth, document.documentElement.clientWidth)
        : window.innerWidth ||
            document.documentElement.clientWidth ||
            document.getElementsByTagName('body')[0].clientWidth;
    },
    showAddVideoDialog() {
      this.isEditMode = false;
      this.videoTitle = '';
      this.videoUrl = '';
      this.addVideoDialog = true;
    },
    showEditVideoDialog(camera) {
      this.isEditMode = true;
      this.originalName = camera.name;
      this.videoTitle = camera.name;
      this.videoUrl = camera.videoConfig.source.split('-i ')[1];
      this.addVideoDialog = true;
    },
    closeAddVideoDialog() {
      if (!this.isProcessing) {
        this.addVideoDialog = false;
        this.videoUrl = '';
        this.videoTitle = '';
        this.valid = true;
        this.isEditMode = false;
        this.originalName = '';
      }
    },
    async addVideo() {
      if (this.valid && this.$refs.form.validate()) {
        try {
          this.isProcessing = true;  // 로딩 시작
          
          // 입력값 검증
          if (!this.videoTitle || !this.videoTitle.trim()) {
            throw new Error('영상 제목을 입력해주세요');
          }
          if (!this.videoUrl || !this.videoUrl.trim()) {
            throw new Error('영상 주소를 입력해주세요');
          }

          const camera = {
            name: this.videoTitle.trim(),
            motionTimeout: 15,
            recordOnMovement: false,
            prebuffering: false,
            videoConfig: {
              source: `-i ${this.videoUrl.trim()}`,
              subSource: `-i ${this.videoUrl.trim()}`,
              stillImageSource: `-i ${this.videoUrl.trim()}`,
              stimeout: 10,
              audio: null,
              debug: null,
              rtspTransport: 'tcp',
              vcodec: 'mp4',
              acodec: null
            },
            mqtt: {},
            smtp: {
              email: this.videoTitle.trim()
            },
            videoanalysis: {
              active: false
            }
          };

          if (this.isEditMode) {
            // 기존 카메라 삭제 후 새로운 정보로 추가
            await removeCamera(this.originalName);
            await addCamera(camera);
            this.$toast.success('카메라가 성공적으로 수정되었습니다.');
          } else {
            await addCamera(camera);
            this.$toast.success('카메라가 성공적으로 추가되었습니다.');
          }
          
          // 카메라 리스트 새로고침
          this.cameras = [];
          this.page = 1;
          this.infiniteId = Date.now();
          
          this.closeAddVideoDialog();
        } catch (err) {
          console.log(err);
          this.$toast.error(err.message || (this.isEditMode ? '카메라 수정 중 오류가 발생했습니다.' : '카메라 추가 중 오류가 발생했습니다.'));
        } finally {
          this.isProcessing = false;  // 로딩 종료
        }
      }
    },
    goToVideoView() {
      this.changeListView(2);
    },
    goToMonitoring() {
      this.changeListView(1);
    },
    showDeleteVideoDialog(camera) {
      this.selectedCamera = camera;
      this.deleteVideoDialog = true;
    },
    closeDeleteVideoDialog() {
      if (!this.isProcessing) {
        this.deleteVideoDialog = false;
        this.selectedCamera = null;
      }
    },
    async deleteVideo() {
      try {
        this.isProcessing = true;  // 로딩 시작
        await removeCamera(this.selectedCamera.name);
        this.$toast.success('카메라가 성공적으로 삭제되었습니다.');
        
        // 카메라 리스트 새로고침
        this.cameras = [];
        this.page = 1;
        this.infiniteId = Date.now();
        
        this.closeDeleteVideoDialog();
      } catch (err) {
        console.log(err);
        this.$toast.error(err.message || '카메라 삭제 중 오류가 발생했습니다.');
      } finally {
        this.isProcessing = false;  // 로딩 종료
      }
    },
  },
};
</script>

<style scoped>
.page-title {
  font-size: 1.3rem !important;
  letter-spacing: -0.025em !important;
  font-weight: 700 !important;
  line-height: 1.5 !important;
}

.add-video-btn {
  height: 48px !important;
  font-weight: 600 !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  border-radius: 12px !important;
  background: var(--cui-bg-card) !important;
  border: 2px solid var(--cui-border-color) !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
  transition: all 0.2s ease !important;
  padding: 0 32px !important;
  min-width: 280px !important;
  margin-right: 20px !important;
}

.add-video-btn:hover {
  transform: translateY(-1px);
  background: var(--cui-bg-card) !important;
  border-color: var(--cui-primary) !important;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15) !important;
}

.add-video-btn:active {
  transform: translateY(0px);
  background: var(--cui-bg-card-hover) !important;
  border-color: var(--cui-primary) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1) !important;
}

.add-video-btn .v-icon {
  transition: transform 0.2s ease;
  color: var(--cui-text-muted) !important;
}

.add-video-btn:hover .v-icon {
  transform: rotate(90deg);
  color: var(--cui-primary) !important;
}

.add-video-btn span {
  font-size: 0.95rem !important;
  color: var(--cui-text-default) !important;
}

.add-video-btn:hover span {
  color: var(--cui-primary) !important;
}

.add-video-dialog {
  border-radius: 16px !important;
  overflow: hidden !important;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2) !important;
  background: var(--cui-bg-card) !important;
  border: 1px solid var(--cui-border-color) !important;
}

.dialog-title {
  background-color: var(--cui-bg-card) !important;
  padding: 32px !important;
  border-bottom: 1px solid var(--cui-border-color) !important;
}

.title-text {
  font-size: 1.5rem !important;
  font-weight: 700 !important;
  color: var(--cui-text-default) !important;
  line-height: 1.2;
  filter: brightness(1.2);
}

.subtitle-text {
  font-size: 1rem !important;
  color: var(--cui-text-default) !important;
  opacity: 0.9;
}

.dialog-content {
  padding: 32px !important;
  background-color: var(--cui-bg-card) !important;
}

.form-group {
  margin-bottom: 24px;
}

.input-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--cui-text-default) !important;
  margin-bottom: 8px;
  filter: brightness(1.1);
}

.input-helper {
  font-size: 0.875rem;
  color: var(--cui-text-default) !important;
  opacity: 0.8;
}

.url-input {
  margin-top: 4px !important;
}

.url-input >>> .v-input__slot {
  min-height: 52px !important;
  border-color: var(--cui-border-color) !important;
  background-color: var(--cui-bg-card) !important;
}

.url-input >>> .v-input__slot:hover {
  border-color: var(--cui-primary) !important;
}

.url-input >>> .v-text-field__slot input {
  color: var(--cui-text-default) !important;
  filter: brightness(1.1);
}

.url-input >>> .v-label {
  color: var(--cui-text-default) !important;
  opacity: 0.9;
}

.url-input >>> .v-text-field__slot input::placeholder {
  color: var(--cui-text-muted) !important;
  opacity: 0.7;
}

.dialog-actions {
  padding: 24px 32px !important;
  border-top: 1px solid var(--cui-border-color) !important;
  background-color: var(--cui-bg-card) !important;
}

.cancel-btn {
  height: 44px !important;
  min-width: 120px !important;
  margin-right: 12px !important;
  border: 2px solid var(--cui-border-color) !important;
  color: var(--cui-text-default) !important;
  background: var(--cui-bg-card) !important;
}

.cancel-btn:hover {
  border-color: var(--cui-border-color-hover) !important;
  background-color: var(--cui-bg-card-hover) !important;
}

.confirm-btn {
  height: 44px !important;
  min-width: 140px !important;
  font-weight: 600 !important;
}

.confirm-btn:not(:disabled) {
  background: linear-gradient(45deg, var(--cui-primary), var(--cui-primary-dark)) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
}

.confirm-btn:disabled {
  opacity: 0.7;
  background: var(--cui-bg-card) !important;
  color: var(--cui-text-default) !important;
}

.header {
  display: flex;
}

div >>> .v-data-table-header__icon {
  display: none;
}

.tab-bar-container {
  border: 1px solid rgba(var(--cui-bg-nav-border-rgb));
  width: 600px;
}

.tab-item {
  border-radius: 6px;
  width: 300px;
  justify-content: center;
}

.tab-item.tw-bg-white {
  color: var(--cui-primary);
}

.text-primary {
  color: var(--cui-primary) !important;
}

.edit-btn {
  height: 36px !important;
  min-width: 90px !important;
  border: 2px solid var(--cui-border-color) !important;
  text-transform: none !important;
  font-weight: 600 !important;
  font-size: 0.9rem !important;
  letter-spacing: normal !important;
  border-radius: 8px !important;
  color: var(--cui-text-default) !important;
  background: var(--cui-bg-card) !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
}

.edit-btn:hover {
  background: var(--cui-bg-card-hover) !important;
  border-color: var(--cui-border-color-hover) !important;
  color: var(--cui-text-default) !important;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15) !important;
}

.edit-btn:hover .v-icon {
  color: var(--cui-text-default) !important;
}

.edit-btn:active {
  background: var(--cui-bg-card-hover) !important;
  transform: translateY(1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
}

.edit-btn .v-icon {
  margin-right: 4px !important;
  color: var(--cui-text-default) !important;
}

.delete-btn {
  height: 36px !important;
  min-width: 90px !important;
  border: 2px solid var(--cui-danger) !important;
  text-transform: none !important;
  font-weight: 600 !important;
  font-size: 0.9rem !important;
  letter-spacing: normal !important;
  border-radius: 8px !important;
  color: var(--cui-danger) !important;
  background: var(--cui-bg-card) !important;
  transition: all 0.2s ease !important;
}

.delete-btn:hover {
  background: var(--cui-bg-card-hover) !important;
  border-color: var(--cui-danger) !important;
  color: var(--cui-danger) !important;
}

.delete-btn:active {
  background: var(--cui-bg-card-hover) !important;
  transform: translateY(1px);
}

.delete-btn .v-icon {
  margin-right: 4px !important;
}

.video-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-container >>> .vue-aspect-ratio {
  width: 100%;
  max-width: 100%;
}

.video-container >>> .video-card {
  width: 100%;
  height: 100%;
  background: var(--cui-bg-card);
  border-radius: 8px;
  overflow: hidden;
}

@media (min-width: 1200px) {
  .video-container {
    padding: 15px;
  }
}

@media (max-width: 1199px) {
  .video-container {
    padding: 10px;
  }
}

@media (max-width: 960px) {
  .video-container {
    padding: 8px;
  }
}
</style>
