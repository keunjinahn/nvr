<!-- eslint-disable vue/multi-word-component-names -->
<template lang="pug">
.recording-mgr
  v-container(fluid)
    v-row
      v-col(cols="12")
        
        .tw-flex.tw-justify-between.tw-items-center
          .tab-bar-container.tw-flex.tw-rounded-lg.tw-bg-gray-100.tw-p-1
            .tab-item.tw-px-4.tw-py-2.tw-cursor-pointer.tw-flex.tw-items-center.tw-transition-all(
              :class="currentTab === 'search' ? 'tw-bg-white tw-shadow-sm tw-text-primary' : 'tw-text-gray-600'"
              @click="changeTab('search')"
            )
              v-icon.tw-mr-2(size="20") {{ icons['mdiPlayCircle'] }}
              span 녹화영상조회
            .tab-item.tw-px-4.tw-py-2.tw-cursor-pointer.tw-flex.tw-items-center.tw-transition-all(
              :class="currentTab === 'schedule' ? 'tw-bg-white tw-shadow-sm tw-text-primary' : 'tw-text-gray-600'"
              @click="changeTab('schedule')"
            )
              v-icon.tw-mr-2(size="20") {{ icons['mdiFormatListBulleted'] }}
              span 녹화스케줄관리

        component(:is="currentComponent")
</template>

<script>
import { mdiPlayCircle, mdiFormatListBulleted } from '@mdi/js';
import RecodingSearch from './RecodingSearch.vue';
import RecodingSchedule from './RecodingSchedule.vue';

export default {
  name: 'RecodingMgr',

  components: {
    RecodingSearch,
    RecodingSchedule
  },

  data: () => ({
    icons: {
      mdiPlayCircle,
      mdiFormatListBulleted
    },
    currentTab: 'search'
  }),

  async mounted() {
    // 컴포넌트가 마운트된 후 실행될 코드
  },

  methods: {
    changeTab(tab) {
      this.currentTab = tab;
    }
  },

  computed: {
    currentComponent() {
      return this.currentTab === 'search' ? 'RecodingSearch' : 'RecodingSchedule';
    }
  }
};
</script>

<style scoped>
.recording-mgr {
  padding: 20px;
}

.tab-bar-container {
  border: 1px solid rgba(var(--cui-bg-nav-border-rgb));
  width: 600px;
}

.tab-item {
  border-radius: 6px;
  width: 300px;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
  display: flex;
  align-items: center;
  height: 75px;
  padding: 12px 16px;
}

.tab-item.tw-bg-white {
  color: var(--cui-primary);
  background-color: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tab-item:hover {
  opacity: 0.9;
}

.tw-text-primary {
  color: var(--cui-primary) !important;
}

.tw-text-gray-600 {
  color: #4b5563;
}

.v-icon {
  font-size: 20px;
  margin-right: 8px;
}
</style> 
