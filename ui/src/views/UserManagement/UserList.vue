<template lang="pug">
.user-list
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
            v-model="roleFilter"
            :items="roleOptions"
            label="권한"
            dense
            filled
            hide-details
            class="filter-select"
            @change="handleFilter"
            background-color="var(--cui-bg-card)"
          )
          v-select(
            v-model="positionFilter"
            :items="positionOptions"
            label="직급"
            dense
            filled
            hide-details
            class="filter-select"
            @change="handleFilter"
            background-color="var(--cui-bg-card)"
          )
    
    v-data-table(
      :headers="headers"
      :items="filteredUsers"
      :items-per-page="10"
      :loading="loading"
      loading-text="데이터를 불러오는 중..."
      no-data-text="데이터가 없습니다"
      class="elevation-1"
    )
      template(v-slot:item.role="{ item }")
        v-chip(
          :color="getRoleColor(item.role)"
          small
          label
          text-color="white"
        ) {{ item.role }}
      
      template(v-slot:item.actions="{ item }")
        .tw-flex.tw-gap-2.tw-justify-center
          v-btn(
            icon
            x-small
            @click="editUser(item)"
            class="action-btn"
          )
            v-icon(size="18") {{ icons['mdiPencil'] }}
          v-btn(
            icon
            x-small
            @click="deleteUser(item)"
            class="action-btn"
          )
            v-icon(size="18") {{ icons['mdiDelete'] }}
</template>
<script>
import {mdiDelete, mdiPencil} from '@mdi/js';

export default {
  name: 'UserList',

  data: () => ({
    icons: {
      mdiDelete,
      mdiPencil
    },
    search: '',
    roleFilter: null,
    positionFilter: null,
    loading: false,
    headers: [
      { text: 'No', value: 'id', align: 'center', width: '80px' },
      { text: '아이디', value: 'username', align: 'center' },
      { text: '이름', value: 'name', align: 'center' },
      { text: '직급', value: 'position', align: 'center' },
      { text: '권한', value: 'role', align: 'center' },
      { text: '이메일', value: 'email', align: 'center' },
      { text: '전화번호', value: 'phone', align: 'center' },
      { text: '관리', value: 'actions', sortable: false, align: 'center', width: '120px' }
    ],
    roleOptions: [
      { text: '전체', value: null },
      { text: '관리자', value: '관리자' },
      { text: '매니저', value: '매니저' },
      { text: '일반사용자', value: '일반사용자' }
    ],
    positionOptions: [
      { text: '전체', value: null },
      { text: '팀장', value: '팀장' },
      { text: '과장', value: '과장' },
      { text: '대리', value: '대리' },
      { text: '사원', value: '사원' }
    ],
    users: [
      {
        id: 1,
        username: 'admin',
        name: '관리자',
        position: '팀장',
        role: '관리자',
        email: 'admin@example.com',
        phone: '010-1234-5678'
      },
      {
        id: 2,
        username: 'user1',
        name: '홍길동',
        position: '대리',
        role: '일반사용자',
        email: 'hong@example.com',
        phone: '010-2345-6789'
      },
      {
        id: 3,
        username: 'user2',
        name: '김철수',
        position: '과장',
        role: '매니저',
        email: 'kim@example.com',
        phone: '010-3456-7890'
      },
      {
        id: 4,
        username: 'user3',
        name: '이영희',
        position: '사원',
        role: '일반사용자',
        email: 'lee@example.com',
        phone: '010-4567-8901'
      },
      {
        id: 5,
        username: 'user4',
        name: '박민수',
        position: '대리',
        role: '일반사용자',
        email: 'park@example.com',
        phone: '010-5678-9012'
      },
      {
        id: 6,
        username: 'user5',
        name: '정수진',
        position: '과장',
        role: '매니저',
        email: 'jung@example.com',
        phone: '010-6789-0123'
      },
      {
        id: 7,
        username: 'user6',
        name: '최영식',
        position: '사원',
        role: '일반사용자',
        email: 'choi@example.com',
        phone: '010-7890-1234'
      },
      {
        id: 8,
        username: 'user7',
        name: '강민지',
        position: '대리',
        role: '일반사용자',
        email: 'kang@example.com',
        phone: '010-8901-2345'
      },
      {
        id: 9,
        username: 'user8',
        name: '윤서연',
        position: '과장',
        role: '매니저',
        email: 'yoon@example.com',
        phone: '010-9012-3456'
      },
      {
        id: 10,
        username: 'user9',
        name: '임재현',
        position: '사원',
        role: '일반사용자',
        email: 'lim@example.com',
        phone: '010-0123-4567'
      }
    ]
  }),

  computed: {
    filteredUsers() {
      return this.users.filter(user => {
        const matchesSearch = !this.search || 
          user.username.toLowerCase().includes(this.search.toLowerCase()) ||
          user.name.toLowerCase().includes(this.search.toLowerCase()) ||
          user.email.toLowerCase().includes(this.search.toLowerCase())
        
        const matchesRole = !this.roleFilter || user.role === this.roleFilter
        const matchesPosition = !this.positionFilter || user.position === this.positionFilter
        
        return matchesSearch && matchesRole && matchesPosition
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
    editUser(item) {
      // 사용자 수정 로직
      console.log('Edit user:', item)
    },
    deleteUser(item) {
      // 사용자 삭제 로직
      console.log('Delete user:', item)
    },
    getRoleColor(role) {
      const colors = {
        '관리자': 'error',
        '매니저': 'warning',
        '일반사용자': 'success'
      }
      return colors[role] || 'grey'
    }
  }
}
</script>

<style lang="scss" scoped>
.user-list {
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
      
      .v-select__slot {
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
      }
    }
  }

  .action-btn {
    width: 24px !important;
    height: 24px !important;
    margin: 0 2px !important;
    background-color: var(--cui-bg-card) !important;
    border: 1px solid var(--cui-border-color) !important;
    
    &:hover {
      opacity: 0.8;
      background-color: var(--cui-bg-hover) !important;
    }
    
    &:first-child {
      .v-icon {
        color: var(--cui-primary) !important;
      }
      
      &:hover {
        border-color: var(--cui-primary) !important;
      }
    }
    
    &:last-child {
      .v-icon {
        color: var(--cui-danger) !important;
      }
      
      &:hover {
        border-color: var(--cui-danger) !important;
      }
    }
    
    .v-icon {
      font-size: 16px !important;
    }
  }

  .v-data-table {
    background: transparent;
    
    ::v-deep {
      .v-data-table__wrapper {
        border-radius: 0 0 8px 8px;
      }
      
      th {
        font-weight: bold !important;
        background-color: var(--cui-bg-darker) !important;
        color: var(--cui-text) !important;
        font-size: 14px !important;
        white-space: nowrap;
      }
      
      td {
        padding: 8px 16px !important;
        color: var(--cui-text) !important;
        font-size: 14px !important;
        height: 48px !important;
        vertical-align: middle;
      }

      .v-chip {
        font-weight: 500;
      }

      tbody {
        tr {
          &:hover {
            background-color: var(--cui-bg-hover) !important;
          }
        }
      }
    }
  }
}
</style> 
