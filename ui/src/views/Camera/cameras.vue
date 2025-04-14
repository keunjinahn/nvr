<template>
  <!-- No changes to template section -->
</template>

<script>
export default {
  watch: {
    '$route.query': {
      handler(query) {
        if (query.view === 'list') {
          this.showListView();
        } else if (query.view === 'monitor') {
          this.showMonitorView();
        }
      },
      immediate: true,
    },
  },

  methods: {
    showListView() {
      // 리스트 버튼 클릭 효과
      this.$refs.listViewBtn.$el.click();
    },
    showMonitorView() {
      // 모니터링 버튼 클릭 효과
      this.$refs.monitorViewBtn.$el.click();
    },
  },
};
</script>

<style>
/* No changes to style section */
</style>
