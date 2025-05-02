<template lang="pug">
.event-statistic
  v-container.custom-container(fluid)
    v-row
      v-col(cols="12")
        v-card.mb-3
          v-card-title.d-flex.align-center.py-2
            v-icon.mr-2(color="primary" small) {{ icons.mdiChartLine }}
            span.subtitle-1 이벤트 발생 추이
          v-card-text.pa-2
            v-chart(:options="eventTrendOption" autoresize height="200" ref="trendChart" style="width:100%;height:200px;background:var(--cui-bg-card);")

    v-row
      v-col(cols="12" md="6")
        v-card.mb-3
          v-card-title.d-flex.align-center.py-2
            v-icon.mr-2(color="primary" small) {{ icons.mdiChartPie }}
            span.subtitle-1 영상별 이벤트 발생 건수
          v-card-text.pa-2
            v-chart(:options="eventByVideoOption" autoresize height="200" ref="videoChart" style="width:100%;height:200px;background:var(--cui-bg-card);")

      v-col(cols="12" md="6")
        v-card.mb-3
          v-card-title.d-flex.align-center.py-2
            v-icon.mr-2(color="primary" small) {{ icons.mdiChartLine }}
            span.subtitle-1 영상별 온도 변화 추이
          v-card-text.pa-2
            v-chart(:options="temperatureOption" autoresize height="200" ref="tempChart" style="width:100%;height:200px;background:var(--cui-bg-card);")

    v-row
      v-col(cols="12" md="6")
        v-card
          v-card-title.d-flex.align-center.py-2
            v-icon.mr-2(color="primary" small) {{ icons.mdiChartBar }}
            span.subtitle-1 이벤트 처리 현황 (주간)
          v-card-text.pa-2
            v-chart(:options="eventStatusBarOption" autoresize height="200" ref="barChart" style="width:100%;height:200px;background:var(--cui-bg-card);")

      v-col(cols="12" md="6")
        v-card
          v-card-title.d-flex.align-center.py-2
            v-icon.mr-2(color="primary" small) {{ icons.mdiChartPie }}
            span.subtitle-1 이벤트 처리 현황 (비율)
          v-card-text.pa-2
            v-chart(:options="eventStatusPieOption" autoresize height="200" ref="pieChart" style="width:100%;height:200px;background:var(--cui-bg-card);")
</template>

<script>
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import {
  LineChart,
  BarChart,
  PieChart
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  ToolboxComponent,
  MarkLineComponent,
  VisualMapComponent
} from 'echarts/components';
import VChart from 'vue-echarts';
import { 
  mdiChartLine,
  mdiChartPie,
  mdiChartBar
} from '@mdi/js';

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  ToolboxComponent,
  MarkLineComponent,
  VisualMapComponent
]);

export default {
  name: 'EventStatistic',

  components: {
    'v-chart': VChart
  },

  data: () => ({
    icons: {
      mdiChartLine,
      mdiChartPie,
      mdiChartBar
    },

    // 이벤트 발생 추이 차트 옵션
    eventTrendOption: {
      xAxis: { type: 'category', data: ['A', 'B', 'C'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [1, 2, 3] }]
    },

    // 영상별 이벤트 발생 건수 파이 차트 옵션
    eventByVideoOption: {
      tooltip: {
        trigger: 'item'
      },
      legend: {
        orient: 'vertical',
        left: 'left'
      },
      series: [{
        name: '이벤트 발생 건수',
        type: 'pie',
        radius: '70%',
        data: [
          { value: 335, name: '영상 1' },
          { value: 310, name: '영상 2' },
          { value: 234, name: '영상 3' },
          { value: 135, name: '영상 4' }
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    },

    // 온도 변화 추이 차트 옵션
    temperatureOption: {
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['영상 1', '영상 2', '영상 3', '영상 4']
      },
      xAxis: {
        type: 'category',
        data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: '{value} °C'
        }
      },
      visualMap: {
        top: 50,
        right: 10,
        pieces: [{
          gt: 30,
          lte: 50,
          color: '#d94e5d'
        }, {
          gt: 10,
          lte: 30,
          color: '#50a3ba'
        }],
        outOfRange: {
          color: '#999'
        }
      },
      series: [{
        name: '영상 1',
        type: 'line',
        data: [25, 27, 31, 33, 32, 30]
      }, {
        name: '영상 2',
        type: 'line',
        data: [24, 25, 29, 32, 31, 28]
      }, {
        name: '영상 3',
        type: 'line',
        data: [23, 26, 30, 34, 33, 29]
      }, {
        name: '영상 4',
        type: 'line',
        data: [26, 28, 32, 35, 34, 31]
      }],
      markLine: {
        data: [{
          yAxis: 30,
          lineStyle: {
            color: '#d94e5d'
          },
          label: {
            formatter: '기준온도 (30°C)'
          }
        }]
      }
    },

    // 이벤트 처리 현황 막대 차트 옵션
    eventStatusBarOption: {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: ['처리', '미처리', '대기']
      },
      xAxis: {
        type: 'category',
        data: ['1주차', '2주차', '3주차', '4주차']
      },
      yAxis: {
        type: 'value'
      },
      series: [{
        name: '처리',
        type: 'bar',
        stack: 'total',
        data: [320, 302, 301, 334]
      }, {
        name: '미처리',
        type: 'bar',
        stack: 'total',
        data: [120, 132, 101, 134]
      }, {
        name: '대기',
        type: 'bar',
        stack: 'total',
        data: [220, 182, 191, 234]
      }]
    },

    // 이벤트 처리 현황 파이 차트 옵션
    eventStatusPieOption: {
      tooltip: {
        trigger: 'item'
      },
      legend: {
        orient: 'vertical',
        left: 'left'
      },
      series: [{
        name: '처리 현황',
        type: 'pie',
        radius: '70%',
        data: [
          { value: 1257, name: '처리' },
          { value: 487, name: '미처리' },
          { value: 827, name: '대기' }
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    }
  }),

  mounted() {
    console.log('trendChart:', this.$refs.trendChart);
    console.log('videoChart:', this.$refs.videoChart);
    console.log('tempChart:', this.$refs.tempChart);
    console.log('barChart:', this.$refs.barChart);
    console.log('pieChart:', this.$refs.pieChart);
  }
};
</script>

<style lang="scss" scoped>
.event-statistic {
  .custom-container {
    width: 90% !important;
    max-width: 90% !important;
    flex: 0 0 90% !important;
    margin-left: 0 !important;
    padding-left: 0 !important;
  }

  .v-card {
    .v-card__title {
      font-size: 0.9rem;
      min-height: 120px;
    }
  }

  :deep(.echarts) {
    width: 100%;
    height: 100%;
  }
}
</style> 
