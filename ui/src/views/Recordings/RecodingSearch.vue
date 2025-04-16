<!-- eslint-disable vue/multi-word-component-names -->
<template lang="pug">
.recording-search
  v-container(fluid)
    v-row
      v-col(cols="12")
        v-card.search-card.mb-4
          v-card-title.search-title
            v-icon.mr-2(color="primary") {{ icons.mdiMagnify }}
            span 녹화 기록 검색
            v-spacer
            v-btn(
              color="primary"
              text
              @click="resetFilters"
              :disabled="!hasActiveFilters"
            )
              v-icon.mr-1 {{ icons.mdiRefresh }}
              span 초기화
          v-divider
          v-card-text.search-content
            v-row(align="center" justify="start")
              v-col(cols="12" sm="2")
                v-text-field(
                  v-model="searchFilters.cameraName"
                  label="카메라 이름"
                  prepend-inner-icon="mdi-camera"
                  dense
                  outlined
                  hide-details="auto"
                  clearable
                  @input="handleSearch"
                )
              v-col(cols="12" sm="2")
                v-text-field(
                  v-model="searchFilters.filename"
                  label="파일명"
                  prepend-inner-icon="mdi-file"
                  dense
                  outlined
                  hide-details="auto"
                  clearable
                  @input="handleSearch"
                )
              v-col(cols="12" sm="2")
                v-menu(
                  ref="dateMenu"
                  v-model="dateMenu"
                  :close-on-content-click="false"
                  transition="scale-transition"
                  offset-y
                  max-width="290px"
                  min-width="290px"
                )
                  template(v-slot:activator="{ on, attrs }")
                    v-text-field(
                      v-model="searchFilters.dateRangeText"
                      label="날짜 범위"
                      prepend-inner-icon="mdi-calendar"
                      dense
                      outlined
                      hide-details="auto"
                      readonly
                      v-bind="attrs"
                      v-on="on"
                      clearable
                      @click:clear="clearDateRange"
                    )
                  v-date-picker(
                    v-model="searchFilters.dateRange"
                    range
                    no-title
                    scrollable
                    color="primary"
                    @change="handleDateRangeChange"
                  )
              v-col(cols="12" sm="2")
                v-select(
                  v-model="searchFilters.status"
                  :items="statusOptions"
                  label="상태"
                  prepend-inner-icon="mdi-checkbox-marked-circle"
                  dense
                  outlined
                  hide-details="auto"
                  clearable
                  @input="handleSearch"
                )
              v-col(cols="12" sm="4")
                v-chip-group(
                  v-if="activeFiltersCount > 0"
                  column
                )
                  v-chip(
                    v-if="searchFilters.cameraName"
                    small
                    close
                    @click:close="searchFilters.cameraName = ''"
                  )
                    v-icon(left small) {{ icons.mdiCamera }}
                    | {{ searchFilters.cameraName }}
                  v-chip(
                    v-if="searchFilters.filename"
                    small
                    close
                    @click:close="searchFilters.filename = ''"
                  )
                    v-icon(left small) {{ icons.mdiFile }}
                    | {{ searchFilters.filename }}
                  v-chip(
                    v-if="searchFilters.dateRange.length === 2"
                    small
                    close
                    @click:close="clearDateRange"
                  )
                    v-icon(left small) {{ icons.mdiCalendar }}
                    | {{ searchFilters.dateRangeText }}
                  v-chip(
                    v-if="searchFilters.status"
                    small
                    close
                    @click:close="searchFilters.status = ''"
                  )
                    v-icon(left small) {{ icons.mdiCheckboxMarkedCircle }}
                    | {{ getStatusText(searchFilters.status) }}
    v-row
      v-col(cols="12")
        v-card
          v-data-table(
            :headers="headers"
            :items="filteredRecordingHistory"
            :loading="loading"
            :items-per-page="10"
            class="elevation-1"
            @click:row="handleRowClick"
          )
            template(#item.thumbnail="{ item }")
              .tw-flex.tw-items-center.tw-justify-center.tw-relative.tw-bg-black.tw-rounded.tw-overflow-hidden(
                style="width: 120px; height: 68px;"
              )
                .tw-absolute.tw-inset-0.tw-flex.tw-items-center.tw-justify-center(
                  v-if="!thumbnails[item.id]"
                )
                  v-progress-circular(
                    indeterminate 
                    color="primary"
                    size="24"
                  )
                img.tw-w-full.tw-h-full.tw-object-cover(
                  v-else
                  :src="thumbnails[item.id]"
                  @error="handleThumbnailError(item)"
                )
                .tw-absolute.tw-inset-0.tw-flex.tw-items-center.tw-justify-center.tw-bg-black.tw-bg-opacity-50(
                  v-if="thumbnailErrors[item.id]"
                )
                  v-icon(
                    color="grey"
                    size="40"
                  ) {{ icons.mdiVideo }}
            
            template(#item.startTime="{ item }")
              span {{ item.formattedStartTime }}
            
            template(#item.endTime="{ item }")
              span {{ item.formattedEndTime }}
            
            template(#item.status="{ item }")
              v-chip(
                :color="getStatusColor(item.status)"
                small
                label
              ) {{ getStatusText(item.status) }}
            
            template(#item.actions="{ item }")
              v-icon(
                small
                class="mr-2"
                @click.stop="confirmDelete(item)"
                color="error"
              ) {{ icons.mdiDelete }}
            
            template(#no-data)
              .text-center.pa-4
                v-icon(color="grey" size="40") {{ icons.mdiVideo }}
                .mt-2 녹화 기록이 없습니다.

  // 비디오 플레이어 다이얼로그
  v-dialog(
    v-model="videoDialog"
    max-width="800px"
    persistent
  )
    v-card.video-player-card
      v-card-title.d-flex.align-center
        span.text-h6 {{ selectedVideo ? selectedVideo.cameraName : '' }} 녹화 영상
        v-spacer
        v-btn(
          icon
          @click="closeVideoDialog"
        )
          v-icon {{ icons.mdiClose }}
      v-divider
      v-card-text.pa-0
        .video-container.pa-4(v-if="selectedVideo")
          div.video-wrapper
            video.video-player(
              ref="videoPlayer"
              controls
              :src="videoUrl"
              @error="handleVideoError"
              crossorigin="anonymous"
              preload="metadata"
              controlsList="nodownload"
            )
          .video-info.mt-4
            v-row
              v-col(cols="12" sm="6")
                v-list-item(dense)
                  v-list-item-icon
                    v-icon {{ icons.mdiCamera }}
                  v-list-item-content
                    v-list-item-title 카메라
                    v-list-item-subtitle {{ selectedVideo.cameraName }}
              v-col(cols="12" sm="6")
                v-list-item(dense)
                  v-list-item-icon
                    v-icon {{ icons.mdiCalendar }}
                  v-list-item-content
                    v-list-item-title 녹화 시작
                    v-list-item-subtitle {{ selectedVideo.formattedStartTime }}
              v-col(cols="12" sm="6")
                v-list-item(dense)
                  v-list-item-icon
                    v-icon {{ icons.mdiClockOutline }}
                  v-list-item-content
                    v-list-item-title 녹화 종료
                    v-list-item-subtitle {{ selectedVideo.formattedEndTime }}
              v-col(cols="12" sm="6")
                v-list-item(dense)
                  v-list-item-icon
                    v-icon {{ icons.mdiFile }}
                  v-list-item-content
                    v-list-item-title 파일명
                    v-list-item-subtitle {{ selectedVideo.filename }}
        .error-container.pa-4(v-if="videoError")
          v-alert(
            type="error"
            text
            dense
          ) {{ videoError }}
      v-card-actions.pa-4
        v-spacer
        v-btn(
          color="primary"
          text
          @click="closeVideoDialog"
        ) 닫기

  // 삭제 확인 다이얼로그
  v-dialog(
    v-model="deleteDialog"
    max-width="400"
  )
    v-card
      v-card-title.headline 녹화 삭제
      v-card-text
        | 선택한 녹화를 삭제하시겠습니까?
        .mt-2.grey--text.text--darken-1 {{ selectedRecordingToDelete ? selectedRecordingToDelete.filename : '' }}
      v-card-actions
        v-spacer
        v-btn(
          text
          @click="deleteDialog = false"
        ) 취소
        v-btn(
          color="error"
          @click="executeDelete"
          :loading="deleteLoading"
        ) 삭제
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
  mdiDelete
} from '@mdi/js'
import { getRecordingHistory} from '@/api/recordingService.api.js';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default {
  name: 'RecodingSearch',

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
      mdiDelete
    },
    loading: false,
    recordingHistory: [],
    thumbnails: {},
    dateMenu: false,
    searchFilters: {
      cameraName: '',
      filename: '',
      dateRange: [],
      dateRangeText: '',
      status: ''
    },
    headers: [
      { 
        text: '영상',
        align: 'center',
        sortable: false,
        value: 'thumbnail',
        width: '150px'
      },
      { 
        text: '카메라',
        align: 'start',
        value: 'cameraName'
      },
      { 
        text: '시작 시간',
        align: 'center',
        value: 'startTime'
      },
      { 
        text: '종료 시간',
        align: 'center',
        value: 'endTime'
      },
      { 
        text: '파일명',
        align: 'start',
        value: 'filename'
      },
      { 
        text: '상태',
        align: 'center',
        value: 'status'
      },
      { text: '작업', value: 'actions', sortable: false },
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
    deleteDialog: false,
    selectedRecordingToDelete: null,
    deleteLoading: false,
    thumbnailErrors: {},
    imageData: new Map(),
  }),

  computed: {
    formattedRecordingHistory() {
      return this.recordingHistory.map((record) => ({
        ...record,
        formattedStartTime: this.formatDateTime(record.startTime),
        formattedEndTime: this.formatDateTime(record.endTime)
      }));
    },

    hasActiveFilters() {
      return this.activeFiltersCount > 0
    },

    activeFiltersCount() {
      let count = 0
      if (this.searchFilters.cameraName) count++
      if (this.searchFilters.filename) count++
      if (this.searchFilters.dateRange.length === 2) count++
      if (this.searchFilters.status) count++
      return count
    },

    filteredRecordingHistory() {
      return this.formattedRecordingHistory.filter((record) => {
        const matchCamera = !this.searchFilters.cameraName ||
          record.cameraName.toLowerCase().includes(this.searchFilters.cameraName.toLowerCase())

        const matchFilename = !this.searchFilters.filename ||
          record.filename.toLowerCase().includes(this.searchFilters.filename.toLowerCase())

        const matchStatus = !this.searchFilters.status ||
          record.status === this.searchFilters.status

        let matchDate = true
        if (this.searchFilters.dateRange.length === 2) {
          const recordDate = new Date(record.startTime)
          const startDate = new Date(this.searchFilters.dateRange[0])
          const endDate = new Date(this.searchFilters.dateRange[1])
          endDate.setHours(23, 59, 59, 999)
          matchDate = recordDate >= startDate && recordDate <= endDate
        }

        return matchCamera && matchFilename && matchDate && matchStatus
      })
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
    },
    
    thumbnails: {
      deep: true,
      handler() {
        this.updateCanvases();
      }
    }
  },

  created() {
    // Vue 개발자 도구에서 thumbnails 객체를 쉽게 확인할 수 있도록 전역 변수로 할당
    if (process.env.NODE_ENV === 'development') {
      window.$thumbnails = this.thumbnails;
    }
  },

  mounted() {
    this.fetchRecordingHistory();
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
  },

  methods: {
    async fetchRecordingHistory() {
      this.loading = true;
      try {
        const response = await getRecordingHistory();
        console.log('Recording history response:', response);
        
        if (Array.isArray(response)) {
          this.recordingHistory = response.map(record => ({
            ...record,
            id: record.id || '',
            cameraName: record.cameraName || 'Unknown Camera',
            filename: record.filename || 'Unknown File',
            startTime: record.startTime || new Date().toISOString(),
            endTime: record.endTime || new Date().toISOString(),
            status: record.status || 'error'
          }));
          await this.fetchThumbnails();
        } else {
          console.error('Invalid response format:', response);
          this.recordingHistory = [];
        }
      } catch (error) {
        console.error('Failed to fetch recording history:', error);
        this.recordingHistory = [];
      } finally {
        this.loading = false;
      }
    },

    async fetchThumbnails() {
      console.log('Starting fetchThumbnails...');
      for (const record of this.recordingHistory) {
        if (!record.id) {
          console.warn('Record missing ID:', record);
          continue;
        }
        
        try {
          // 녹화 파일명에서 확장자를 제거하고 .png로 변경
          const thumbnailFilename = record.filename.replace(/\.[^/.]+$/, '.png');
          const thumbnailUrl = `http://localhost:9091/api/recordings/thumbnail/${record.id}/${thumbnailFilename}`;
          
          // 섬네일 URL을 저장
          this.$set(this.thumbnails, record.id, thumbnailUrl);
          
          // 이미지 로드 테스트
          const img = new Image();
          img.onload = () => {
            console.log(`Thumbnail loaded successfully for recording ${record.id}`);
          };
          img.onerror = () => {
            console.warn(`Failed to load thumbnail for recording ${record.id}`);
            this.$set(this.thumbnailErrors, record.id, true);
            this.$set(this.thumbnails, record.id, '/assets/images/no-thumbnail.jpg');
          };
          img.src = thumbnailUrl;
          
        } catch (error) {
          console.error(`Error setting thumbnail for recording ${record.id}:`, error);
          this.$set(this.thumbnailErrors, record.id, true);
          this.$set(this.thumbnails, record.id, '/assets/images/no-thumbnail.jpg');
        }
      }
    },

    handleSearch() {
      // 검색 조건이 변경될 때마다 필터링된 결과가 자동으로 업데이트됩니다
      // computed 속성인 filteredRecordingHistory가 처리합니다
    },

    handleDateRangeChange(range) {
      if (range.length === 2) {
        this.dateMenu = false;
      }
    },

    clearDateRange() {
      this.searchFilters.dateRange = [];
      this.searchFilters.dateRangeText = '';
    },

    formatDateTime(dateString) {
      if (!dateString) {
        return '-';
      }
      try {
        return format(new Date(dateString), 'yyyy-MM-dd HH:mm:ss', { locale: ko });
      } catch (error) {
        console.error('Error formatting date:', error);
        return dateString;
      }
    },

    getStatusColor(status) {
      const colors = {
        recording: 'success',
        completed: 'info',
        error: 'error',
        stopped: 'warning'
      };
      return colors[status] || 'grey';
    },

    getStatusText(status) {
      const texts = {
        recording: '녹화중',
        completed: '완료',
        error: '오류',
        stopped: '중지됨'
      };
      return texts[status] || status;
    },

    resetFilters() {
      this.searchFilters = {
        cameraName: '',
        filename: '',
        dateRange: [],
        dateRangeText: '',
        status: ''
      }
    },

    async handleRowClick(record) {
      if (!record || !record.id) {
        console.error('Invalid record:', record);
        return;
      }
      this.selectedVideo = record;
      this.videoError = null;
      this.videoDialog = true;

      try {
        // stream API를 녹화 id로 요청
        this.videoUrl = `http://localhost:9091/api/recordings/stream/${record.id}`;
        
        // 비디오 요소 설정
        if (this.$refs.videoPlayer) {
          const video = this.$refs.videoPlayer;
          video.load();
        }

      } catch (error) {
        console.error('Error setting video URL:', error);
        this.videoError = '비디오를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.';
      }
    },

    handleVideoError(event) {
      const videoElement = this.$refs.videoPlayer;
      console.error('Video error:', {
        error: event,
        videoState: videoElement ? {
          readyState: videoElement.readyState,
          networkState: videoElement.networkState,
          error: videoElement.error,
          currentSrc: videoElement.currentSrc
        } : null
      });

      let errorMessage = '비디오를 재생할 수 없습니다.';
      
      if (videoElement?.error) {
        switch (videoElement.error.code) {
          case 1:
            errorMessage = '재생이 중단되었습니다.';
            break;
          case 2:
            errorMessage = '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
            this.retryVideoLoad();
            break;
          case 3:
            errorMessage = '비디오 형식이 올바르지 않습니다.';
            break;
          case 4:
            errorMessage = '비디오 파일을 찾을 수 없습니다.';
            break;
        }
      }

      this.videoError = errorMessage;
    },

    retryVideoLoad() {
      if (this.$refs.videoPlayer && this.videoUrl) {
        console.log('Retrying video load...');
        const video = this.$refs.videoPlayer;
        
        // 현재 시간 위치 저장
        const currentTime = video.currentTime;
        
        // 비디오 다시 로드
        setTimeout(() => {
          video.load();
          video.currentTime = currentTime;
        }, 2000);
      }
    },

    closeVideoDialog() {
      if (this.$refs.videoPlayer) {
        this.$refs.videoPlayer.pause();
      }
      this.videoDialog = false;
      this.selectedVideo = null;
      this.videoUrl = null;
      this.videoError = null;
    },

    confirmDelete(recording) {
      this.selectedRecordingToDelete = recording;
      this.deleteDialog = true;
    },

    async executeDelete() {
      if (!this.selectedRecordingToDelete) return;

      this.deleteLoading = true;
      try {
        // 로컬 스토리지에서 사용자 정보 가져오기
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user || !user.access_token) {
          throw new Error('인증 토큰이 없습니다. 다시 로그인해주세요.');
        }

        const response = await fetch(`http://localhost:9091/api/recordings/${this.selectedRecordingToDelete.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${user.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          // 토큰 만료 체크
          if (response.status === 401) {
            await this.$store.dispatch('auth/logout');
            this.$router.push('/');
            throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
          }
          throw new Error(errorData.message || '녹화 삭제에 실패했습니다.');
        }

        await this.fetchRecordingHistory();
        this.$toast.success('녹화가 성공적으로 삭제되었습니다.');
        this.deleteDialog = false;
      } catch (error) {
        console.error('Error deleting recording:', error);
        this.$toast.error(error.message || '녹화 삭제 중 오류가 발생했습니다.');
      } finally {
        this.deleteLoading = false;
        this.selectedRecordingToDelete = null;
      }
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
  }
};
</script>

<style lang="scss">
.recording-search {
  padding: 20px;

  .search-card {
    border-radius: 8px;
    
    .search-title {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      
      .v-icon {
        margin-right: 8px;
      }
    }

    .search-content {
      padding: 20px;
      background-color: #f8f9fa;
    }
  }

  .v-chip {
    margin: 2px;
    
    .v-icon {
      font-size: 16px;
    }
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
    .video-container {
      background-color: #f8f9fa;
      border-radius: 4px;

      .video-wrapper {
        position: relative;
        width: 100%;
        background-color: #000;
        border-radius: 4px;
        overflow: hidden;

        .video-player {
          width: 100%;
          max-height: 450px;
          background-color: #000;
        }
      }

      .video-info {
        background-color: white;
        border-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
    }

    .error-container {
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
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
}
</style> 
