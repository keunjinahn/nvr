import Vue from 'vue';
import VueRouter from 'vue-router';

import { app } from '@/main';
import store from '@/store';

import { checkLogin } from '@/api/auth.api';

const originalPush = VueRouter.prototype.push;
VueRouter.prototype.push = function push(location) {
  return originalPush.call(this, location).catch((err) => err);
};

Vue.use(VueRouter);

export const routes = [
  {
    path: '*',
    name: '404',
    meta: {
      auth: {
        requiresAuth: false,
        requiredLevel: [],
      },
      config: {
        showFooter: false,
        showNavbar: false,
        showSidebar: false,
      },
    },
    component: () => import(/* webpackChunkName: "404" */ '@/views/404/404.vue'),
  },
  {
    path: '/',
    name: 'Login',
    meta: {
      auth: {
        requiresAuth: false,
        requiredLevel: [],
      },
      config: {
        showFooter: false,
        showNavbar: false,
        showSidebar: false,
      },
    },
    component: () => import(/* webpackChunkName: "login" */ '@/views/Login/Login.vue'),
  },
  {
    path: '/start',
    name: 'Start',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin'],
      },
      config: {
        showFooter: false,
        showNavbar: false,
        showSidebar: false,
      },
    },
    component: () => import(/* webpackChunkName: "start" */ '@/views/Start/Start.vue'),
  },
  {
    path: '/first-start',
    name: 'FirstStart',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: [/*"cameras:access", */ 'dashboard:access'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-view-dashboard',
      },
    },
    component: () => import(/* webpackChunkName: "dashboard" */ '@/views/Dashboard/FirstStart.vue'),
  },
  {
    path: '/admin-result',
    name: 'AdminResult',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin-result:access'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-view-dashboard',
      },
    },
    component: () => import(/* webpackChunkName: "dashboard" */ '@/views/admin/AdminResult.vue'),
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: [/*"cameras:access", */ 'dashboard:access'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-view-dashboard',
      },
    },
    component: () => import(/* webpackChunkName: "dashboard" */ '@/views/Dashboard/Dashboard.vue'),
  },
  {
    path: '/cameras',
    name: 'Cameras',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['cameras:access'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-cctv',
      },
    },
    component: () => import(/* webpackChunkName: "cameras" */ '@/views/Cameras/Cameras.vue'),
  },
  {
    path: '/cameras/:name',
    name: 'Camera',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['cameras:access'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
    },
    component: () => import(/* webpackChunkName: "camera" */ '@/views/Camera/Camera.vue'),
  },
  {
    path: '/cameras/:name/feed',
    name: 'CameraFeed',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['cameras:access'],
      },
      config: {
        fixedNavbar: false,
        showFooter: false,
        showNavbar: false,
        showSidebar: false,
      },
    },
    component: () => import(/* webpackChunkName: "cameraFeed" */ '@/views/Camera/CameraFeed.vue'),
  },
  {
    path: '/recordings',
    name: 'Recordings',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['recordings:access'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-image-multiple',
        title: '녹화관리',
        parent: 'recordings:access'
      },
    },
    component: () => import(/* webpackChunkName: "recordings" */ '@/views/Recordings/RecodingMgr.vue'),
  },
  {
    path: '/events',
    name: 'Events',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: [],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-image-multiple',
        title: '이벤트관리'
      },
    },
    component: () => import(/* webpackChunkName: "events" */ '@/views/Events/EventMgr.vue'),
    children: [
      {
        path: '',
        redirect: 'search'
      },
      {
        path: 'search',
        name: 'EventSearch',
        meta: {
          auth: {
            requiresAuth: true,
            requiredLevel: []
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true
          }
        },
        component: () => import(/* webpackChunkName: "events" */ '@/views/Events/EventSearch.vue')
      },
      {
        path: 'setting',
        name: 'EventSetting',
        meta: {
          auth: {
            requiresAuth: true,
            requiredLevel: []
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true
          }
        },
        component: () => import(/* webpackChunkName: "events" */ '@/views/Events/EventSetting.vue')
      },
      {
        path: 'statistic',
        name: 'EventStatistic',
        meta: {
          auth: {
            requiresAuth: true,
            requiredLevel: []
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true
          }
        },
        component: () => import(/* webpackChunkName: "events" */ '@/views/Events/EventStatistic.vue')
      },
      {
        path: 'report',
        name: 'EventReport',
        meta: {
          auth: {
            requiresAuth: true,
            requiredLevel: []
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true
          }
        },
        component: () => import(/* webpackChunkName: "events" */ '@/views/Events/EventReport.vue')
      },
      {
        path: 'zone',
        name: 'EventDetectionZone',
        meta: {
          auth: {
            requiresAuth: true,
            requiredLevel: []
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true
          }
        },
        component: () => import(/* webpackChunkName: "events" */ '@/views/Events/EventDetectionZone.vue')
      }
    ]
  },
  {
    path: '/alerts',
    name: 'Alerts',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: [],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-image-multiple',
        title: '경보관리'
      },
    },
    component: () => import(/* webpackChunkName: "events" */ '@/views/Alerts/AlertMgr.vue'),
    children: [
      {
        path: '',
        redirect: 'search'
      },
      {
        path: 'search',
        name: 'AlertSearch',
        meta: {
          auth: {
            requiresAuth: true,
            requiredLevel: []
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true
          }
        },
        component: () => import(/* webpackChunkName: "events" */ '@/views/Alerts/AlertSearch.vue')
      },
      {
        path: 'status',
        name: 'AlertStatus',
        meta: {
          auth: {
            requiresAuth: true,
            requiredLevel: []
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true
          }
        },
        component: () => import(/* webpackChunkName: "events" */ '@/views/Alerts/AlertStatus.vue')
      },
      {
        path: 'setting',
        name: 'AlertSetting',
        meta: {
          auth: {
            requiresAuth: true,
            requiredLevel: []
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true
          }
        },
        component: () => import(/* webpackChunkName: "events" */ '@/views/Alerts/AlertSetting.vue')
      },
    ]
  },
  {
    path: '/camview',
    name: 'Camview',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: [/*"cameras:access", */ 'camview:access'],
      },
      config: {
        showFooter: false,
        showMinifiedNavbar: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-grid-large',
      },
    },
    component: () => import(/* webpackChunkName: "camview" */ '@/views/Camview/Camview.vue'),
  },
  {
    path: '/console',
    name: 'Console',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        extras: true,
        icon: 'mdi-console',
      },
    },
    component: () => import(/* webpackChunkName: "console" */ '@/views/Console/Console.vue'),
  },
  {
    path: '/config',
    name: 'Config',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        extras: true,
        icon: 'mdi-text-box-outline',
      },
    },
    component: () => import(/* webpackChunkName: "config" */ '@/views/Config/Config.vue'),
  },
  {
    path: '/utilization',
    name: 'Utilization',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        extras: true,
        icon: 'mdi-chart-arc',
      },
    },
    component: () => import(/* webpackChunkName: "utilization" */ '@/views/Utilization/Utilization.vue'),
  },
  {
    path: '/plugins',
    name: 'Plugins',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        extras: true,
        icon: 'mdi-puzzle',
      },
    },
    component: () => import(/* webpackChunkName: "plugins" */ '@/views/Plugins/Plugins.vue'),
  },
  {
    path: '/settings',
    name: 'Settings',
    meta: {
      redirectTo: '/settings/account',
      auth: {
        requiresAuth: true,
        requiredLevel: [],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        bottom: true,
        icon: 'mdi-cog',
      },
    },
    component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/Settings.vue'),
    children: [
      {
        path: 'account',
        meta: {
          name: 'Account',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: [],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-account-circle-outline',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/account.vue'),
      },
      {
        path: 'appearance',
        meta: {
          name: 'Appearance',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: [],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-pencil-ruler',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/appearance.vue'),
      },
      {
        path: 'interface',
        meta: {
          name: 'Interface',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: ['settings:general:access', 'settings:general:edit'],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-application-cog',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/interface.vue'),
      },
      {
        path: 'user',
        meta: {
          name: 'Users',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: ['admin'],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-account-plus',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/user.vue'),
      },
      {
        path: 'cameras',
        meta: {
          name: 'Cameras',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: ['settings:cameras:access', 'settings:cameras:edit'],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-cctv',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/cameras.vue'),
      },
      {
        path: 'recordings',
        meta: {
          name: 'Recordings',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: ['settings:recordings:access', 'settings:recordings:edit'],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-image-multiple-outline',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/recordings.vue'),
      },
      {
        path: 'rekognition',
        meta: {
          name: 'Rekognition',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: ['admin'],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-face-recognition',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/rekognition.vue'),
      },
      {
        path: 'backup',
        meta: {
          name: 'Backup',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: ['backup:download', 'backup:restore'],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-backup-restore',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/backup.vue'),
      },
      {
        path: 'system',
        meta: {
          name: 'System',
          child: true,
          auth: {
            requiresAuth: true,
            requiredLevel: ['admin'],
          },
          config: {
            fixedNavbar: true,
            showFooter: true,
            showNavbar: true,
            showSidebar: true,
          },
          navigation: {
            icon: 'mdi-tune',
          },
        },
        component: () => import(/* webpackChunkName: "settings" */ '@/views/Settings/subpages/system.vue'),
      },
    ],
  },
  {
    path: '/video-management',
    name: 'VideoManagement',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-video',
      },
    },
    component: () => import(/* webpackChunkName: "videoManagement" */ '@/views/VideoManagement/VideoManagement.vue'),
  },
  {
    path: '/video-management/surveillance-areas',
    name: 'SurveillanceAreas',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
    },
    component: () => import(/* webpackChunkName: "surveillanceAreas" */ '@/views/VideoManagement/SurveillanceAreas.vue'),
  },
  {
    path: '/user-management',
    name: 'UserManagement',
    meta: {
      auth: {
        requiresAuth: true,
        requiredLevel: ['admin'],
      },
      config: {
        fixedNavbar: true,
        showFooter: true,
        showNavbar: true,
        showSidebar: true,
      },
      navigation: {
        main: true,
        icon: 'mdi-account-group',
      },
    },
    component: () => import(/* webpackChunkName: "user-management" */ '@/views/UserManagement/UserMgr.vue'),
  },
];

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes,
  scrollBehavior() {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ x: 0, y: 0, behavior: 'smooth' });
      }, 250);
    });
  },
});

router.beforeEach(async (to, from, next) => {
  const user = store.getters['auth/user'];
  const pageName = (to.name || to.meta.name).toLowerCase();

  if (user && user.access_token) {
    try {
      await checkLogin();

      if (to.meta.auth.requiredLevel.length > 0) {
        const permissionLevels = Array.isArray(user.permissionLevel)
          ? user.permissionLevel
          : [user.permissionLevel];

        const granted = permissionLevels.some(
          (level) => to.meta.auth.requiredLevel.includes(level) || level === 'admin'
        );

        if (!granted) {
          app.$toast.error(`${app.$t(pageName)}: ${app.$t('permission_required')}`);
          return next('/settings/account');
          //return next(false);
        }
      }

      const lastRouteName = localStorage.getItem('lastPage');
      const shouldRedirect = Boolean(pageName === 'login' && lastRouteName);

      if (shouldRedirect) {
        next({ path: lastRouteName });
      } else {
        next();
      }
    } catch (err) {
      console.log(err);

      await store.dispatch('auth/logout');
      setTimeout(() => next('/'), 200);
    }
  } else {
    if (pageName !== 'login') {
      next('/');
    } else {
      next();
    }
  }
});

router.afterEach((to) => {
  const pageName = (to.name || to.meta.name).toLowerCase();

  if (pageName !== 'login') {
    localStorage.setItem('lastPage', to.path);
  }
});

export default router;
