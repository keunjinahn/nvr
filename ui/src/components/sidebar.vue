<template lang="pug">
.tw-flex.tw-flex-col.tw-overflow-y-auto.main-navi.main-navi-show
  .tw-flex.tw-flex-row.tw-justify-center.tw-items-center
    .logo.tw-cursor-pointer.tw-flex.tw-items-center.tw-justify-center(@click="$router.push('/cameras')")
      img.tw-w-full.tw-h-full.tw-object-contain(:src="require('@/assets/img/logo.png')" title="NVR" alt="camera.ui")
  
  .tw-flex.tw-flex-col.tw-h-full.tw-items-center.tw-pt-6(key="nav")
    .tw-flex.tw-items-center.tw-justify-center.sidebar-nav-items(v-for="point in filteredNavigation" :key="point.name")
      v-btn.tw-justify-center.sidebar-nav-item(@click="hideNavi" :to="point.redirect || point.to" active-class="sidebar-nav-item-active" :class="$route.path === point.to || $route.path.split('/')[1] === point.to.replace('/', '') || ($route.name === point.name && !$route.meta.child) ? 'sidebar-nav-item-active v-btn--active' : ''" plain block tile)
        v-icon(height="28px" width="28px") {{ icons[point.icon] }}
        span.sidebar-nav-item-text {{ point.name }}
    
    .tw-flex.tw-items-center.tw-justify-center.sidebar-nav-items(v-for="menu in additionalMenus" :key="menu.name")
      v-btn.tw-justify-center.sidebar-nav-item(@click="showPreparingMessage" plain block tile)
        v-icon(height="28px" width="28px") {{ icons[menu.icon] }}
        span.sidebar-nav-item-text {{ menu.name }}
    
    .tw-mt-auto.tw-mb-4.tw-flex.tw-justify-center.tw-w-full
      v-btn.tw-justify-center.sidebar-nav-item.logout-btn(@click="signout" plain block tile)
        v-icon(height="28px" width="28px") {{ icons['mdi-logout'] }}
        span.sidebar-nav-item-text {{ $t('signout') }}
</template>

<script>
import { mdiViewDashboard, mdiLogoutVariant, mdiCctv, mdiVideo, mdiRuler, mdiBell, mdiAccountGroup } from '@mdi/js';
import { bus } from '@/main';
import { routes } from '@/router';

export default {
  name: 'Sidebar',

  data() {
    return {
      icons: {
        'mdi-view-dashboard': mdiViewDashboard,
        'mdi-logout': mdiLogoutVariant,
        'mdi-video': mdiCctv,
        'mdi-record': mdiVideo,
        'mdi-ruler': mdiRuler,
        'mdi-alert': mdiBell,
        'mdi-account': mdiAccountGroup,
      },
      additionalMenus: [
        { name: '녹화관리', icon: 'mdi-record' },
        { name: '계측관리', icon: 'mdi-ruler' },
        { name: '경보관리', icon: 'mdi-alert' },
        { name: '사용자관리', icon: 'mdi-account' },
      ],
      navigation: routes
        .map((route) => {
          if (route.meta.navigation) {
            return {
              name: route.name,
              to: route.path,
              redirect: route.meta.redirectTo,
              ...route.meta.navigation,
              ...route.meta.auth,
            };
          }
        })
        .filter((route) => route),
    };
  },

  computed: {
    filteredNavigation() {
      return this.navigation.filter(item => item.name === 'Dashboard').map(item => ({
        ...item,
        name: '영상관리'
      }));
    },
  },

  methods: {
    hideNavi() {
      bus.$emit('showOverlay', false);
      bus.$emit('extendSidebar', true);
    },
    async signout() {
      await this.$store.dispatch('auth/logout');
      this.$router.push('/');
    },
    showPreparingMessage() {
      this.$vuetify.dialog.message.info('현재 기능 준비중입니다.');
    },
  },
};
</script>

<style scoped>
.main-navi {
  background: rgba(var(--cui-bg-nav-rgb));
  border-right: 1px solid rgba(var(--cui-bg-nav-border-rgb));
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: 227px;
  min-width: 227px;
  max-width: 227px;
  transition: 0.2s all;
  z-index: 999;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-top: 10px;
}

.main-navi::-webkit-scrollbar {
  width: 0px;
  display: none;
}

.main-navi-show {
  width: 227px;
  min-width: 227px;
  margin-left: 0 !important;
  transform: translateX(0);
}

.logo {
  width: 187px;
  height: 78px;
  transition: 0.2s all;
  padding: 8px;
  display: flex;
  justify-content: center;
}

.sidebar-nav-items {
  height: 80px !important;
  width: 100%;
  display: flex;
  justify-content: flex-start;
  padding-left: 20px;
}

.sidebar-nav-item {
  color: rgba(255, 255, 255, 0.6);
  transition: 0.2s all;
  border-radius: 12px !important;
  height: 80px !important;
  width: 191px !important;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-direction: row;
  padding: 0 20px;
  margin-left: 0 !important;
}

.sidebar-nav-item-active,
.sidebar-nav-item:hover {
  color: rgba(255, 255, 255, 1);
}

.sidebar-nav-item-text {
  font-weight: 600 !important;
  font-size: 16px !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  margin-left: 12px;
}

.sidebar-nav-item v-icon {
  font-size: 28px !important;
}

.logout-btn {
  margin-top: auto;
  color: rgba(255, 255, 255, 0.6) !important;
  width: 191px !important;
  height: 80px !important;
  flex-direction: row;
  padding: 0 20px;
}

.logout-btn:hover {
  color: rgba(255, 255, 255, 1) !important;
}

.tw-mt-auto.tw-mb-4.tw-flex.tw-justify-center.tw-w-full {
  padding-left: 20px;
  justify-content: flex-start !important;
}

@media (max-width: 960px) {
  .main-navi {
    transform: translateX(-227px);
  }

  .main-navi-show {
    transform: translateX(0);
  }
}
</style>
