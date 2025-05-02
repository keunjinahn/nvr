<template lang="pug">
.user-history
  v-card
    .search-bar.tw-p-4
      .tw-flex.tw-items-center.tw-gap-4
        .search-field-container.tw-flex-1
          v-text-field(
            v-model="search"
            prepend-inner-icon="mdi-magnify"
            placeholder="검색어를 입력하세요"
            hide-details
            dense
            class="search-field"
            @input="handleSearch"
            filled
            background-color="var(--cui-bg-card)"
          )
        .tw-flex.tw-items-center.tw-gap-2
          v-select(
            v-model="statusFilter"
            :items="statusOptions"
            label="상태"
            dense
            filled
            hide-details
            class="filter-select"
            @change="handleFilter"
            background-color="var(--cui-bg-card)"
          )
          v-menu(
            ref="dateMenu"
            v-model="dateMenu"
            :close-on-content-click="false"
            transition="scale-transition"
            offset-y
            min-width="auto"
          )
            template(v-slot:activator="{ on, attrs }")
              v-text-field(
                v-model="dateRangeText"
                label="기간"
                prepend-inner-icon="mdi-calendar"
                readonly
                v-bind="attrs"
                v-on="on"
                dense
                filled
                hide-details
                class="filter-select"
                background-color="var(--cui-bg-card)"
              )
            v-date-picker(
              v-model="dates"
              range
              no-title
              scrollable
              @input="handleDateChange"
            )
    
    v-data-table(
      :headers="headers"
      :items="filteredHistory"
      :items-per-page="10"
      :page.sync="page"
      :server-items-length="totalItems"
      :loading="loading"
      loading-text="데이터를 불러오는 중..."
      no-data-text="데이터가 없습니다"
      class="elevation-1"
    )
      template(v-slot:item.status="{ item }")
        v-chip(
          :color="getStatusColor(item.status)"
          small
          label
        ) {{ item.status }}
</template>

<script>
export default {
  name: 'UserHistory',

  data: () => ({
    search: '',
    statusFilter: null,
    dateMenu: false,
    dates: [],
    page: 1,
    totalItems: 20,
    loading: false,
    headers: [
      { text: 'No', value: 'id', align: 'center', width: '80px' },
      { text: '아이디', value: 'username', align: 'center' },
      { text: '이름', value: 'name', align: 'center' },
      { text: '접속 시간', value: 'accessTime', align: 'center' },
      { text: 'IP주소', value: 'ipAddress', align: 'center' },
      { text: '웹브라우저 종류', value: 'browser', align: 'center' },
      { text: '상태', value: 'status', align: 'center' }
    ],
    statusOptions: [
      { text: '전체', value: null },
      { text: '로그인', value: '로그인' },
      { text: '로그아웃', value: '로그아웃' }
    ],
    history: [
      {
        id: 1,
        username: 'admin',
        name: '관리자',
        accessTime: '2024-01-20 09:00:00',
        ipAddress: '192.168.1.100',
        browser: 'Chrome',
        status: '로그인'
      },
      {
        id: 2,
        username: 'user1',
        name: '홍길동',
        accessTime: '2024-01-20 09:15:30',
        ipAddress: '192.168.1.101',
        browser: 'Firefox',
        status: '로그인'
      },
      {
        id: 3,
        username: 'user2',
        name: '김철수',
        accessTime: '2024-01-20 09:30:15',
        ipAddress: '192.168.1.102',
        browser: 'Edge',
        status: '로그인'
      },
      {
        id: 4,
        username: 'user1',
        name: '홍길동',
        accessTime: '2024-01-20 10:45:00',
        ipAddress: '192.168.1.101',
        browser: 'Firefox',
        status: '로그아웃'
      },
      {
        id: 5,
        username: 'user3',
        name: '이영희',
        accessTime: '2024-01-20 11:00:00',
        ipAddress: '192.168.1.103',
        browser: 'Chrome',
        status: '로그인'
      },
      {
        id: 6,
        username: 'user2',
        name: '김철수',
        accessTime: '2024-01-20 11:30:45',
        ipAddress: '192.168.1.102',
        browser: 'Edge',
        status: '로그아웃'
      },
      {
        id: 7,
        username: 'user4',
        name: '박민수',
        accessTime: '2024-01-20 13:15:20',
        ipAddress: '192.168.1.104',
        browser: 'Safari',
        status: '로그인'
      },
      {
        id: 8,
        username: 'user3',
        name: '이영희',
        accessTime: '2024-01-20 14:20:10',
        ipAddress: '192.168.1.103',
        browser: 'Chrome',
        status: '로그아웃'
      },
      {
        id: 9,
        username: 'user5',
        name: '정수진',
        accessTime: '2024-01-20 15:00:00',
        ipAddress: '192.168.1.105',
        browser: 'Chrome',
        status: '로그인'
      },
      {
        id: 10,
        username: 'user4',
        name: '박민수',
        accessTime: '2024-01-20 15:45:30',
        ipAddress: '192.168.1.104',
        browser: 'Safari',
        status: '로그아웃'
      },
      {
        id: 11,
        username: 'user6',
        name: '최영식',
        accessTime: '2024-01-20 16:00:00',
        ipAddress: '192.168.1.106',
        browser: 'Firefox',
        status: '로그인'
      },
      {
        id: 12,
        username: 'user5',
        name: '정수진',
        accessTime: '2024-01-20 16:30:15',
        ipAddress: '192.168.1.105',
        browser: 'Chrome',
        status: '로그아웃'
      },
      {
        id: 13,
        username: 'user7',
        name: '강민지',
        accessTime: '2024-01-20 17:00:00',
        ipAddress: '192.168.1.107',
        browser: 'Edge',
        status: '로그인'
      },
      {
        id: 14,
        username: 'user6',
        name: '최영식',
        accessTime: '2024-01-20 17:45:20',
        ipAddress: '192.168.1.106',
        browser: 'Firefox',
        status: '로그아웃'
      },
      {
        id: 15,
        username: 'user8',
        name: '윤서연',
        accessTime: '2024-01-20 18:00:00',
        ipAddress: '192.168.1.108',
        browser: 'Chrome',
        status: '로그인'
      },
      {
        id: 16,
        username: 'user7',
        name: '강민지',
        accessTime: '2024-01-20 18:30:45',
        ipAddress: '192.168.1.107',
        browser: 'Edge',
        status: '로그아웃'
      },
      {
        id: 17,
        username: 'user9',
        name: '임재현',
        accessTime: '2024-01-20 19:00:00',
        ipAddress: '192.168.1.109',
        browser: 'Safari',
        status: '로그인'
      },
      {
        id: 18,
        username: 'user8',
        name: '윤서연',
        accessTime: '2024-01-20 19:45:10',
        ipAddress: '192.168.1.108',
        browser: 'Chrome',
        status: '로그아웃'
      },
      {
        id: 19,
        username: 'admin',
        name: '관리자',
        accessTime: '2024-01-20 20:00:00',
        ipAddress: '192.168.1.100',
        browser: 'Chrome',
        status: '로그아웃'
      },
      {
        id: 20,
        username: 'user9',
        name: '임재현',
        accessTime: '2024-01-20 20:15:30',
        ipAddress: '192.168.1.109',
        browser: 'Safari',
        status: '로그아웃'
      }
    ]
  }),

  computed: {
    dateRangeText() {
      return this.dates.length === 2
        ? `${this.dates[0]} ~ ${this.dates[1]}`
        : '기간 선택'
    },
    filteredHistory() {
      return this.history.filter(record => {
        const matchesSearch = !this.search || 
          record.username.toLowerCase().includes(this.search.toLowerCase()) ||
          record.name.toLowerCase().includes(this.search.toLowerCase()) ||
          record.ipAddress.toLowerCase().includes(this.search.toLowerCase())
        
        const matchesStatus = !this.statusFilter || record.status === this.statusFilter
        
        const matchesDate = this.dates.length !== 2 || (
          record.accessTime >= this.dates[0] &&
          record.accessTime <= this.dates[1]
        )
        
        return matchesSearch && matchesStatus && matchesDate
      })
    }
  },

  methods: {
    handleSearch() {
      // 검색 로직
    },
    handleFilter() {
      // 필터 로직
    },
    handleDateChange() {
      this.dateMenu = false
    },
    getStatusColor(status) {
      const colors = {
        '로그인': 'success',
        '로그아웃': 'error'
      }
      return colors[status] || 'grey'
    }
  }
}
</script>

<style lang="scss" scoped>
.user-history {
  .v-card {
    background-color: var(--cui-bg-dark);
    border-radius: 8px;
  }

  .search-bar {
    background-color: var(--cui-bg-darker);
    border-bottom: 1px solid var(--cui-border-color);
    border-radius: 8px 8px 0 0;
  }

  .search-field-container {
    max-width: 400px;
  }

  .search-field {
    ::v-deep {
      .v-input__slot {
        background-color: var(--cui-bg-card) !important;
        border-radius: 4px !important;
        min-height: 40px !important;

        &:before,
        &:after {
          display: none;
        }

        .v-input__prepend-inner {
          margin-top: 8px;
          margin-right: 8px;
          
          .v-icon {
            color: var(--cui-text-muted);
            font-size: 20px;
          }
        }

        input {
          color: var(--cui-text);
          font-size: 14px;

          &::placeholder {
            color: var(--cui-text-muted);
          }
        }
      }
    }
  }

  .filter-select {
    min-width: 120px;
    
    ::v-deep {
      .v-input__slot {
        background-color: var(--cui-bg-card) !important;
        border-radius: 4px !important;
        min-height: 40px !important;

        &:before,
        &:after {
          display: none;
        }
      }
      
      .v-select__slot,
      .v-text-field__slot {
        font-size: 14px;
        
        .v-label {
          top: 10px;
          color: var(--cui-text-muted);
          font-size: 14px;
        }
        
        input {
          color: var(--cui-text);
        }
      }
      
      .v-icon {
        color: var(--cui-text-muted);
        font-size: 20px;
      }
    }
  }

  .v-data-table {
    background: transparent;
    
    ::v-deep {
      .v-data-table__wrapper {
        border-radius: 0 0 8px 8px;
      }
      
      th {
        font-weight: bold;
        background-color: var(--cui-bg-darker);
        color: var(--cui-text);
      }
      
      td {
        padding: 8px 16px;
        color: var(--cui-text);
      }

      .v-chip {
        font-weight: 500;
      }
    }
  }
}
</style> 
