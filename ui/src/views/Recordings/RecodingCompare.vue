<!-- eslint-disable vue/multi-word-component-names -->
<template lang="pug">
.recording-compare
  v-container(fluid)
    v-row
      v-col(cols="12")
        .tw-flex.tw-gap-4
          // 첫 번째 비디오 플레이어
          .video-player.tw-flex-1(:class="{ expanded: expandedVideo === 1 }" @click="expandVideo(1)")
            video(
              ref="videoPlayer1"
              controls
              :src="selectedVideo1"
              @error="handleVideoError"
              crossorigin="anonymous"
              preload="metadata"
              controlsList="nodownload"
              :style="expandedVideo === 1 ? 'width: 1280px; height: 720px;' : 'width: 640px; height: 480px;'"
            )
          
          // 두 번째 비디오 플레이어
          .video-player.tw-flex-1(:class="{ expanded: expandedVideo === 2 }" @click="expandVideo(2)")
            video(
              ref="videoPlayer2"
              controls
              :src="selectedVideo2"
              @error="handleVideoError"
              crossorigin="anonymous"
              preload="metadata"
              controlsList="nodownload"
              :style="expandedVideo === 2 ? 'width: 1280px; height: 720px;' : 'width: 640px; height: 480px;'"
            )
          
          // 세 번째 박스 (컨트롤 + 카메라 목록 + 달력)
          .tw-flex-1.tw-flex
            // 왼쪽 박스 (컨트롤 + 카메라 목록)
            .tw-flex-1.tw-flex.tw-flex-col.tw-gap-4
              // 컨트롤 버튼 박스
              .button-box.button-box-dark.tw-p-4
                .tw-flex.tw-flex-col.tw-gap-2
                  v-btn.play-all-btn.common-dark-btn(color="gray" @click="playAllVideos")
                    v-icon(left class="common-dark-btn__icon") {{ icons.mdiPlay }}
                    span 모두 재생
                  v-btn.play-all-btn.common-dark-btn(color="gray" @click="togglePauseAllVideos")
                    v-icon(left class="common-dark-btn__icon") {{ isPaused ? icons.mdiPlay : icons.mdiPause }}
                    span {{ isPaused ? '재생' : '일시정지' }}
                  v-btn.play-all-btn.common-dark-btn(color="gray" @click="stopAllVideos")
                    v-icon(left class="common-dark-btn__icon") {{ icons.mdiStop }}
                    span 중지
              
              // 카메라 목록 테이블
              .button-box.button-box-dark.tw-p-4.tw-flex-1
                v-data-table(
                  :headers="cameraHeaders"
                  :items="cameras"
                  :loading="loading"
                  hide-default-header
                  hide-default-footer
                  :items-per-page="-1"
                  class="elevation-1"
                )
                  template(#item.selected="{ item }")
                    v-checkbox(
                      v-model="item.selected"
                      @change="handleCameraSelectionChange(item)"
                    )
                  template(#item.name="{ item }")
                    span {{ item.name }}
            
            // 오른쪽 박스 (달력)
            .tw-w-96.tw-ml-4
              .button-box.button-box-dark.tw-p-4.tw-h-full
                v-date-picker(
                  v-model="selectedDate"
                  :first-day-of-week="1"
                  locale="ko"
                  color="secondary"
                  elevation="0"
                  full-width
                  no-title
                  @change="handleDateChange"
                )
              // 달력 아래 버튼 박스
              .tw-mt-5-tw-w-full.tw-bg-gray-900.tw-rounded.tw-p-5
                v-btn.export-btn.tw-mb-2.tw-w-full(color="secondary" @click="onExportRecording") 녹화내보내기
                v-btn.snapshot-btn.tw-w-full(color="secondary" @click="onSaveSnapshot") 정지이미지 저장

        v-card.mt-4
          v-data-table(
            :headers="headers"
            :items="formattedRecordingHistory"
            :loading="loading"
            :items-per-page="10"
            class="elevation-1"
          )
            template(#item.selected="{ item }")
              v-checkbox(
                v-model="item.selected"
                @change="handleSelectionChange(item)"
              )
            
            template(#item.formattedStartTime="{ item }")
              span {{ formatTime(item.formattedStartTime) }}
            
            template(#item.formattedEndTime="{ item }")
              span {{ formatTime(item.formattedEndTime) }}
            
            template(#item.filename="{ item }")
              span {{ item.filename }}
            
            template(#item.status="{ item }")
              v-chip(
                :color="getStatusColor(item.status)"
                small
                label
              ) {{ getStatusText(item.status) }}
            
            template(#no-data)
              .text-center.pa-4
                v-icon(color="grey" size="40") {{ icons.mdiVideo }}
                .mt-2 녹화 기록이 없습니다.

        // 하단 전체 너비 NLE 타임라인 박스
        .tw-mt-4
          .nle-timeline-box.tw-bg-gray-800.tw-p-4.tw-rounded-lg.tw-flex.tw-items-center.tw-relative
            // 썸네일
            img.timeline-thumbnail(:src="thumbnailUrl" alt="thumbnail" class="tw-w-24 tw-h-16 tw-mr-4 tw-object-cover")
            // NLE 슬라이더
            .timeline-slider.tw-flex-1.tw-relative
              .timeline-hours.tw-flex.tw-justify-between.tw-text-xs.tw-text-gray-400.tw-mb-1
                span(v-for="h in 13" :key="h") {{ (h-1)*2 }}
              .timeline-videos
                .timeline-row(v-for="(video, idx) in selectedVideos || []" :key="video.id")
                  .timeline-label.tw-w-10.tw-text-xs.tw-text-gray-300 {{ video.name }}
                  .timeline-bar.tw-relative.tw-h-2.tw-bg-gray-700.tw-rounded.tw-ml-2
                    // 저장된 구간 표시
                    .timeline-segment.tw-bg-red-400.tw-absolute.tw-h-full.tw-rounded(
                      v-for="segment in video.segments || []"
                      :key="segment.start"
                      :style="segmentStyle(segment)"
                    )
            // 현재 시간 표시
            .current-time.tw-absolute.tw-top-2.tw-right-4.tw-text-white.tw-text-lg
              | {{ formattedPlayheadTime }}

</template>

<script>
import { 
  mdiVideo, 
  mdiCamera, 
  mdiFile, 
  mdiCalendar, 
  mdiMagnify, 
  mdiRefresh,
  mdiCheckboxMarkedCircle,
  mdiClose,
  mdiClockOutline,
  mdiDelete,
  mdiPlay,
  mdiStop,
  mdiPause
} from '@mdi/js'
import moment from 'moment';
import { getRecordingHistory} from '@/api/recordingService.api.js';
import { getCameras } from '@/api/cameras.api';

export default {
  name: 'RecodingCompare',

  components: {},

  props: {},

  data: () => ({
    icons: {
      mdiVideo,
      mdiCamera,
      mdiFile,
      mdiCalendar,
      mdiMagnify,
      mdiRefresh,
      mdiCheckboxMarkedCircle,
      mdiClose,
      mdiClockOutline,
      mdiDelete,
      mdiPlay,
      mdiStop,
      mdiPause
    },
    loading: false,
    recordingHistory: [],
    selectedVideo1: null,
    selectedVideo2: null,
    headers: [
      { text: '선택', value: 'selected', sortable: false, width: '80px' },
      { text: '카메라', value: 'cameraName', sortable: true },
      { text: '시작 시간', value: 'formattedStartTime', sortable: true },
      { text: '종료 시간', value: 'formattedEndTime', sortable: true },
      { text: '파일명', value: 'filename', sortable: true },
      { text: '상태', value: 'status', sortable: true }
    ],
    statusOptions: [
      { text: '녹화중', value: 'recording' },
      { text: '완료', value: 'completed' },
      { text: '오류', value: 'error' },
      { text: '중지됨', value: 'stopped' }
    ],
    videoDialog: false,
    selectedVideo: null,
    videoUrl: null,
    videoError: null,
    thumbnailErrors: {},
    imageData: new Map(),
    searchFilters: {
      dateRange: [],
      dateRangeText: '',
      camera: null,
      status: null
    },
    expandedVideo: 0,
    isPaused: false,
    cameraHeaders: [
      { text: '선택', value: 'selected', sortable: false, width: '80px' },
      { text: '카메라', value: 'name', sortable: true }
    ],
    cameras: [],
    selectedDate: new Date().toISOString().substr(0, 10),
    playhead: 0, // 0~1 (0=00:00, 1=24:00)
    dragging: false,
    selectedVideos: [],
    thumbnailUrl: '',
  }),

  computed: {
    formattedRecordingHistory() {
      if (!this.recordingHistory || this.recordingHistory.length === 0) {
        // 녹화 데이터가 없으면 비디오 화면 초기화
        this.$nextTick(() => {
          this.$refs.videoPlayer?.forEach(player => {
            if (player) {
              player.reset();
            }
          });
        });
        return [];
      }

      // 녹화 데이터가 있으면 자동으로 체크하여 비디오 화면에 표시
      const formattedData = this.recordingHistory.map((record) => ({
        ...record,
        formattedStartTime: this.formatTime(record.startTime),
        formattedEndTime: this.formatTime(record.endTime),
        selected: true  // 자동으로 체크
      }));

      // 비디오 플레이어 업데이트
      this.$nextTick(() => {
        formattedData.forEach((record, index) => {
          const player = this.$refs.videoPlayer?.[index];
          if (player && record.selected) {
            player.loadVideo(record);
          }
        });
      });

      return formattedData;
    },
    formattedPlayheadTime() {
      const hour = Math.floor(this.playhead * 24);
      const min = Math.floor((this.playhead * 24 - hour) * 60);
      return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    },
    playheadStyle() {
      return {
        left: `calc(${this.playhead * 100}% - 1px)`
      };
    }
  },

  watch: {
    'searchFilters.dateRange': {
      handler(newRange) {
        if (newRange.length === 2) {
          const [start, end] = newRange;
          this.searchFilters.dateRangeText = `${start} ~ ${end}`;
        } else {
          this.searchFilters.dateRangeText = '';
        }
      },
      deep: true
    }
  },

  created() {
    // this.loadRecordingHistory();
    this.loadCameras();
  },

  mounted() {
    //this.fetchRecordingHistory();
    document.addEventListener('mousemove', this.onDrag);
    document.addEventListener('mouseup', this.stopDrag);
  },

  beforeDestroy() {
    if (this.$refs.videoPlayer) {
      this.$refs.videoPlayer.pause();
    }
    // Cleanup thumbnail URLs
    Object.values(this.thumbnails).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    // 메모리 정리
    this.thumbnails = {};
    this.imageData.clear();
    // ImageBitmap 객체 정리
    Object.values(this.thumbnails).forEach(imageBitmap => {
      if (imageBitmap instanceof ImageBitmap) {
        imageBitmap.close();
      }
    });
    document.removeEventListener('mousemove', this.onDrag);
    document.removeEventListener('mouseup', this.stopDrag);
  },

  methods: {
    async loadRecordingHistory() {
      try {
        this.loading = true;
        const response = await getRecordingHistory();
        if (response && Array.isArray(response)) {
          this.recordingHistory = response.map(record => {
            const data = record.dataValues || record;
            return {
              ...data,
              id: data.id || '',
              cameraName: data.cameraName || data.camera_name || 'Unknown Camera',
              filename: data.filename || 'Unknown File',
              startTime: data.startTime || data.start_time || new Date().toISOString(),
              endTime: data.endTime || data.end_time || null,
              status: data.status || 'error',
            selected: false
            };
          });
        } else {
          this.recordingHistory = [];
          console.error('Invalid response format:', response);
        }
      } catch (error) {
        console.error('Error loading recording history:', error);
        this.recordingHistory = [];
      } finally {
        this.loading = false;
      }
    },

    async fetchRecordingHistory() {
      this.loading = true;
      try {
        const response = await getRecordingHistory();
        console.log('Recording history response:', response);
        
        if (Array.isArray(response)) {
          this.recordingHistory = response.map(record => {
            const data = record.dataValues || record;
            return {
              ...data,
              id: data.id || '',
              cameraName: data.cameraName || data.camera_name || 'Unknown Camera',
              filename: data.filename || 'Unknown File',
              startTime: data.startTime || data.start_time || new Date().toISOString(),
              endTime: data.endTime || data.end_time || null,
              status: data.status || 'error',
            selected: false
            };
          });
        } else {
          this.recordingHistory = [];
          console.error('Invalid response format:', response);
        }
      } catch (error) {
        console.error('Failed to fetch recording history:', error);
        this.recordingHistory = [];
      } finally {
        this.loading = false;
      }
    },

    handleSelectionChange(item) {
      const host = process.env.VUE_APP_STREAM_HOST;
      if (item.selected) {
        if (!this.selectedVideo1) {
          this.selectedVideo1 = `http://${host}:9091/api/recordings/stream/${item.id}`;
        } else if (!this.selectedVideo2) {
          this.selectedVideo2 = `http://${host}:9091/api/recordings/stream/${item.id}`;
        } else {
          item.selected = false;
          this.$toast.warning('최대 2개의 영상만 선택할 수 있습니다.');
        }
      } else {
        if (this.selectedVideo1 === `http://${host}:9091/api/recordings/stream/${item.id}`) {
          this.selectedVideo1 = null;
        } else if (this.selectedVideo2 === `http://${host}:9091/api/recordings/stream/${item.id}`) {
          this.selectedVideo2 = null;
        }
      }
    },

    playAllVideos() {
      if (this.$refs.videoPlayer1) {
        this.$refs.videoPlayer1.play();
      }
      if (this.$refs.videoPlayer2) {
        this.$refs.videoPlayer2.play();
      }
    },

    togglePauseAllVideos() {
      if (this.isPaused) {
        if (this.$refs.videoPlayer1) this.$refs.videoPlayer1.play();
        if (this.$refs.videoPlayer2) this.$refs.videoPlayer2.play();
      } else {
        if (this.$refs.videoPlayer1) this.$refs.videoPlayer1.pause();
        if (this.$refs.videoPlayer2) this.$refs.videoPlayer2.pause();
      }
      this.isPaused = !this.isPaused;
    },

    stopAllVideos() {
      if (this.$refs.videoPlayer1) {
        this.$refs.videoPlayer1.pause();
        this.$refs.videoPlayer1.currentTime = 0;
      }
      if (this.$refs.videoPlayer2) {
        this.$refs.videoPlayer2.pause();
        this.$refs.videoPlayer2.currentTime = 0;
      }
    },

    formatTime(date) {
      if (!date) return '';
      try {
        return moment(date).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
      } catch (error) {
        console.error('Error formatting date:', error);
        return date;
      }
    },

    getStatusColor(status) {
      const statusMap = {
        recording: 'blue',
        completed: 'green',
        error: 'red',
        stopped: 'grey'
      };
      return statusMap[status] || 'grey';
    },

    getStatusText(status) {
      const statusOption = this.statusOptions.find(opt => opt.value === status);
      return statusOption ? statusOption.text : status;
    },

    handleVideoError(event) {
      console.error('Video error:', event);
      this.$toast.error('비디오를 재생할 수 없습니다.');
    },

    handleThumbnailError(item) {
      console.warn(`Failed to load thumbnail for recording: ${item.id}`);
      this.$set(this.thumbnailErrors, item.id, true);
      this.$set(this.thumbnails, item.id, '/assets/images/no-thumbnail.jpg');
    },

    // 컴포넌트가 업데이트될 때 캔버스 다시 그리기
    updateCanvases() {
      this.$nextTick(() => {
        Object.entries(this.thumbnails).forEach(([recordId, imageBitmap]) => {
          if (imageBitmap instanceof ImageBitmap) {
            const canvas = document.getElementById(`thumbnail-${recordId}`);
            if (canvas) {
              const ctx = canvas.getContext('2d');
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              // 캔버스 크기에 맞게 이미지 그리기
              const scale = Math.min(
                canvas.width / imageBitmap.width,
                canvas.height / imageBitmap.height
              );
              
              const x = (canvas.width - imageBitmap.width * scale) / 2;
              const y = (canvas.height - imageBitmap.height * scale) / 2;
              
              ctx.drawImage(
                imageBitmap,
                x, y,
                imageBitmap.width * scale,
                imageBitmap.height * scale
              );
            }
          }
        });
      });
    },

    expandVideo(idx) {
      this.expandedVideo = this.expandedVideo === idx ? 0 : idx;
    },

    async loadCameras() {
      try {
        const response = await getCameras();
        if (response && response.data && response.data.result) {
          this.cameras = response.data.result.map(camera => ({
            ...camera,
            selected: false
          }));
        }
      } catch (error) {
        console.error('Error loading cameras:', error);
        this.cameras = [];
      }
    },

    handleCameraSelectionChange(item) {
      // 카메라 선택 변경 처리
      console.log('Selected cameras:', this.cameras.filter(cam => cam.selected),',item:',item);
      // 선택된 카메라가 있으면 현재 선택된 날짜에 대한 녹화 기록을 조회
      const selectedCameras = this.cameras.filter(cam => cam.selected);
      if (selectedCameras.length > 0 && this.selectedDate) {
        this.fetchRecordingHistoryForDate(this.selectedDate, selectedCameras);
      }
    },

    async handleDateChange(date) {
      // 날짜 변경 처리
      console.log('Selected date:', date);
      // 선택된 카메라가 있으면 해당 날짜에 대한 녹화 기록을 조회
      const selectedCameras = this.cameras.filter(cam => cam.selected);
      if (selectedCameras.length > 0) {
        await this.fetchRecordingHistoryForDate(date, selectedCameras);
      }
    },

    async fetchRecordingHistoryForDate(date, selectedCameras) {
      this.loading = true;
      try {
        // 선택된 카메라의 ID 목록
        const cameraIds = selectedCameras.map(cam => cam.id);
        // 날짜 범위 설정 (선택된 날짜의 시작부터 끝까지)
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        this.selectedVideo1 = null;
        this.selectedVideo2 = null;
        this.recordingHistory = [];
        this.$nextTick(() => {
          this.$refs.videoPlayer?.forEach(player => {
            if (player) {
              player.reset();
            }
          });
        });

        // 녹화 기록 조회
        const response = await getRecordingHistory({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          cameraIds: cameraIds
        });

        if (Array.isArray(response)) {
          this.recordingHistory = response.map(record => {
            const data = record.dataValues || record;
            return {
              ...data,
              id: data.id || '',
              cameraName: data.cameraName || data.camera_name || 'Unknown Camera',
              filename: data.filename || 'Unknown File',
              startTime: data.startTime || data.start_time || new Date().toISOString(),
              endTime: data.endTime || data.end_time || null,
              status: data.status || 'error',
              selected: false
            };
          });
          if(this.recordingHistory.length > 0) {
            this.recordingHistory.forEach(item => {
              item.selected = true;
              this.handleSelectionChange(item);
            });
          }else{
            this.selectedVideo1 = null;
            this.selectedVideo2 = null;
            const videoElements = document.querySelectorAll('video');
            videoElements.forEach(video => {
              video.src = '';      // 비디오 소스 제거
              video.load();        // 비디오 리로드
              video.poster = '';   // 섬네일 이미지 제거
            });
          }
        } else {
          this.recordingHistory = [];
          console.error('Invalid response format:', response);
        }
      } catch (error) {
        console.error('Failed to fetch recording history:', error);
        this.recordingHistory = [];
      } finally {
        this.loading = false;

      }
    },

    segmentStyle(segment) {
      if (!segment || typeof segment.start !== 'number' || typeof segment.end !== 'number') return {};
      const left = (segment.start / 86400) * 100;
      const width = ((segment.end - segment.start) / 86400) * 100;
      return {
        left: `${left}%`,
        width: `${width}%`
      };
    },

    startDrag(e) {
      console.log('startDrag :',e);
      this.dragging = true;
      document.addEventListener('mousemove', this.onDrag);
      document.addEventListener('mouseup', this.stopDrag);
    },

    onDrag(e) {
      if (!this.dragging) return;
      const slider = this.$el.querySelector('.timeline-slider');
      if (!slider) return;
      const rect = slider.getBoundingClientRect();
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(x, rect.width));
      this.playhead = x / rect.width;
      this.syncVideosToPlayhead();
    },

    stopDrag() {
      this.dragging = false;
      document.removeEventListener('mousemove', this.onDrag);
      document.removeEventListener('mouseup', this.stopDrag);
    },

    syncVideosToPlayhead() {
      // const seconds = this.playhead * 86400; // 사용하지 않으므로 제거
      // 실제 영상 컨트롤러와 연동 필요
      // 예: this.$refs.videoPlayer1.currentTime = seconds;
    },

    onExportRecording() {
      // 녹화 내보내기 로직 구현
      alert('녹화 내보내기 기능');
    },

    onSaveSnapshot() {
      // 정지이미지 저장 로직 구현
      alert('정지이미지 저장 기능');
    },

    async fetchRecordings() {
      if (!this.startDate || !this.endDate) {
        this.$toast.error('시작일과 종료일을 선택해주세요.');
        return;
      }

      this.loading = true;
      try {
        // 비디오 화면 완전 초기화
        this.selectedVideo1 = null;
        this.selectedVideo2 = null;
        this.recordingHistory = [];
        
        // 비디오 요소 직접 초기화
        this.$nextTick(() => {
          const videoElements = document.querySelectorAll('video');
          videoElements.forEach(video => {
            video.src = '';
            video.load();
            video.poster = '';
          });

          // 비디오 플레이어 컴포넌트 초기화
          if (this.$refs.videoPlayer1) {
            this.$refs.videoPlayer1.reset();
          }
          if (this.$refs.videoPlayer2) {
            this.$refs.videoPlayer2.reset();
          }
        });

        const date = this.startDate;
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        // 녹화 기록 조회
        const response = await getRecordingHistory({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          cameraIds: this.selectedCameras
        });

        if (response && response.data) {
          this.recordingHistory = response.data.map(record => {
            return {
              ...record,
              formattedStartTime: this.formatTime(record.startTime),
              formattedEndTime: this.formatTime(record.endTime),
              selected: false
            };
          });

          // 데이터가 있으면 자동으로 첫 번째 항목 선택
          if (this.recordingHistory.length > 0) {
            this.$nextTick(() => {
              this.recordingHistory.forEach(item => {
                item.selected = true;
                this.handleSelectionChange(item);
              });
            });
          }
        } else {
          this.recordingHistory = [];
        }
      } catch (error) {
        console.error('Error fetching recordings:', error);
        this.$toast.error('녹화 기록을 불러오는데 실패했습니다.');
        this.recordingHistory = [];
      } finally {
        this.loading = false;
      }
    },
  }
};
</script>

<style lang="scss">
.recording-compare {
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
    cursor: pointer;

    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  .video-player.expanded {
    z-index: 10;
    box-shadow: 0 4px 24px rgba(0,0,0,0.25);
    border: 2px solid #fff;
  }

  .play-all-btn {
    height: 36px !important;
    min-width: 120px !important;
    border: 2px solid white !important;
    text-transform: none !important;
    font-weight: 600 !important;
    font-size: 0.9rem !important;
    letter-spacing: normal !important;
    border-radius: 8px !important;
    color: white !important;
    background: var(--cui-bg-card) !important;
    transition: all 0.2s ease !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
  }

  .play-all-btn:hover {
    background: var(--cui-primary) !important;
    border-color: var(--cui-primary) !important;
    color: white !important;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2) !important;
  }

  .play-all-btn:hover .v-icon {
    color: white !important;
  }

  .play-all-btn:active {
    background: var(--cui-primary) !important;
    border-color: var(--cui-primary) !important;
    color: white !important;
    transform: translateY(1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
  }

  .play-all-btn .v-icon {
    margin-right: 4px !important;
    color: var(--cui-primary) !important;
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

  .video-player-card {
    background-color: var(--cui-bg-gray-800) !important;
    border: 1px solid rgba(var(--cui-bg-nav-border-rgb));
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;

    .v-card-title {
      color: var(--cui-text-default) !important;
      font-size: 1.25rem;
      font-weight: 500;
      padding: 16px 24px;
      border-bottom: 1px solid rgba(var(--cui-bg-nav-border-rgb));
      display: flex;
      align-items: center;

      .v-btn--icon {
        color: var(--cui-text-default) !important;
      }
    }

    .video-container {
      background-color: var(--cui-bg-gray-800);
      border-radius: 4px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;

      .video-wrapper {
        position: relative;
        width: 100%;
        max-width: 900px;
        margin: 0 auto;
        background-color: #000;
        border-radius: 4px;
        overflow: hidden;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);

        .video-player {
          width: 100%;
          max-height: 600px;
          background-color: #000;
          display: block;
          margin: 0 auto;
        }
      }

      .video-info {
        width: 100%;
        max-width: 900px;
        margin: 24px auto 0;
        background-color: var(--cui-bg-gray-700);
        border-radius: 4px;
        padding: 16px;

        .v-list-item {
          padding: 8px 16px;

          .v-list-item-icon {
            .v-icon {
              color: var(--cui-text-default) !important;
            }
          }

          .v-list-item-content {
            .v-list-item-title {
              color: var(--cui-text-default) !important;
              font-weight: 500;
              opacity: 0.9;
            }

            .v-list-item-subtitle {
              color: var(--cui-text-default) !important;
              opacity: 0.7;
            }
          }
        }
      }
    }

    .v-card-actions {
      padding: 16px 24px;
      border-top: 1px solid rgba(var(--cui-bg-nav-border-rgb));

      .v-btn {
        &.close-btn {
          background-color: var(--cui-text-default) !important;
          color: var(--cui-bg-gray-800) !important;
          padding: 0 24px;
          height: 36px;
          font-weight: 500;
        }
      }
    }

    .error-container {
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--cui-bg-gray-700);
      border-radius: 4px;
      margin: 20px;
    }
  }

  .v-dialog {
    max-width: 1200px;
    width: 95%;
    margin: 0 auto;
  }

  .v-data-table ::v-deep .actions-column {
    width: 100px;
    text-align: center;
  }

  .thumbnail-container {
    position: relative;
    width: 120px;
    height: 68px;
    background: #000;
    border-radius: 4px;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: opacity 0.2s ease;
    }

    .error-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
    }
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
    color: red !important;
    background: var(--cui-bg-card) !important;
    transition: all 0.2s ease !important;
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.1) !important;
  }

  .delete-btn:hover {
    background: var(--cui-danger) !important;
    border-color: var(--cui-danger) !important;
    color: white !important;
    box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2) !important;
  }

  .delete-btn:hover .v-icon {
    color: white !important;
  }

  .delete-btn:active {
    background: var(--cui-danger) !important;
    border-color: var(--cui-danger) !important;
    color: white !important;
    transform: translateY(1px);
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.1) !important;
  }

  .delete-btn .v-icon {
    margin-right: 4px !important;
    color: var(--cui-danger) !important;
  }
}

.common-dark-btn {
  background: #444857 !important;
  color: #fff !important;
  border: none !important;
  font-weight: bold !important;
  width: 132px !important;
  margin-bottom: 14px !important;
  margin-left:10px;
  margin-right:10px;
  font-size: 1rem !important;
  box-shadow: 0 2px 8px rgba(79,140,255,0.10) !important;
  border-radius: 8px !important;
  letter-spacing: 1px !important;
  display: flex;
  align-items: center;
  justify-content: center;
}
.common-dark-btn:last-child {
  margin-bottom: 0 !important;
}
.common-dark-btn__icon {
  color: #fff !important;
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
  max-height:200px;
}

.nle-timeline-box { min-height: 100px; }
.timeline-slider { height: 80px; }
.timeline-row { display: flex; align-items: center; height: 18px; }
.timeline-label { width: 40px; color: #bbb; font-size: 12px; }
.timeline-bar { flex: 1; position: relative; height: 8px; background: #222; border-radius: 4px; margin-left: 8px; }
.timeline-segment { border-radius: 4px; }
.playhead-bar { }
</style> 
