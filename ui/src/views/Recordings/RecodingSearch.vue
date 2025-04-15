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
          )
            template(#item.thumbnail="{ item }")
              .tw-flex.tw-items-center.tw-justify-center
                v-img(
                  :src="item.thumbnailUrl"
                  width="120"
                  height="68"
                  class="tw-rounded"
                )
                  template(#placeholder)
                    v-icon(size="40" color="grey") {{ icons.mdiVideo }}
            
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
            
            template(#no-data)
              .text-center.pa-4
                v-icon(color="grey" size="40") {{ icons.mdiVideo }}
                .mt-2 녹화 기록이 없습니다.
</template>

<script>
import { 
  mdiVideo, 
  mdiCamera, 
  mdiFile, 
  mdiCalendar, 
  mdiMagnify, 
  mdiRefresh,
  mdiCheckboxMarkedCircle
} from '@mdi/js'
import { getRecordingHistory, getVideoThumbnail } from '@/api/recordingService.api.js';
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
      mdiCheckboxMarkedCircle
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
      }
    ],
    statusOptions: [
      { text: '녹화중', value: 'recording' },
      { text: '완료', value: 'completed' },
      { text: '오류', value: 'error' },
      { text: '중지됨', value: 'stopped' }
    ]
  }),

  computed: {
    formattedRecordingHistory() {
      return this.recordingHistory.map((record) => {
        const recordingDate = record.startTime
          ? new Date(record.startTime).toISOString().split('T')[0]
          : null
        const thumbnailKey = record.cameraName && recordingDate
          ? `${record.cameraName}_${recordingDate}`
          : null
        return {
          ...record,
          formattedStartTime: this.formatDateTime(record.startTime),
          formattedEndTime: this.formatDateTime(record.endTime),
          thumbnailUrl: thumbnailKey ? this.thumbnails[thumbnailKey] : null
        }
      })
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
          const [start, end] = newRange
          this.searchFilters.dateRangeText = `${start} ~ ${end}`
        } else {
          this.searchFilters.dateRangeText = ''
        }
      },
      deep: true
    }
  },

  created() {},

  mounted() {
    this.fetchRecordingHistory();
  },

  beforeDestroy() {},

  methods: {
    async fetchRecordingHistory() {
      this.loading = true;
      try {
        const response = await getRecordingHistory();
        console.log('Recording history response:', response);
        
        if (Array.isArray(response)) {
          this.recordingHistory = response;
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
      for (const record of this.recordingHistory) {
        if (!record.cameraName || !record.startTime) {
          continue;
        }
        
        try {
          const recordingDate = new Date(record.startTime).toISOString().split('T')[0];
          const thumbnailKey = `${record.cameraName}_${recordingDate}`;
          const thumbnailUrl = await getVideoThumbnail(record.cameraName, recordingDate);
          
          if (thumbnailUrl) {
            this.$set(this.thumbnails, thumbnailKey, thumbnailUrl);
          }
        } catch (error) {
          console.error(`Error fetching thumbnail for ${record.cameraName}:`, error);
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
    }
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
}
</style> 

