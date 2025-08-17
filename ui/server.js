const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fetch = require('node-fetch'); // Node.js 18+ 에서는 global fetch 사용 가능
const app = express();
const port = process.env.PORT || 9092;

// 모든 요청 로깅
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

// 현재 디렉토리의 dist 폴더를 정적 파일 디렉토리로 설정
const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);

// 환경별 API 설정
const getApiTarget = () => {
  return process.env.NODE_ENV === 'production'
    ? 'http://20.41.121.184:9091'
    : 'http://localhost:9091';
};

// API 프록시 설정 - 모든 API 경로 처리
const proxyMiddleware = createProxyMiddleware({
  target: getApiTarget(),  // 환경별 API 서버 주소
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api',  // /api 경로는 그대로 유지
    '^/config': '/api/config',  // /config → /api/config
    '^/auth': '/api/auth',      // /auth → /api/auth
    '^/cameras': '/api/cameras', // /cameras → /api/cameras
    '^/recordings': '/api/recordings', // /recordings → /api/recordings
    '^/events': '/api/events',   // /events → /api/events
    '^/users': '/api/users',     // /users → /api/users
    '^/system': '/api/system',   // /system → /api/system
    '^/backup': '/api/backup',   // /backup → /api/backup
    '^/notifications': '/api/notifications', // /notifications → /api/notifications
    '^/alerts': '/api/alerts',   // /alerts → /api/alerts
    '^/schedules': '/api/schedules', // /schedules → /api/schedules
    '^/subscribe': '/api/subscribe', // /subscribe → /api/subscribe
    '^/statistic': '/api/statistic'  // /statistic → /api/statistic
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[Proxy] ${req.method} ${req.url} → ${getApiTarget()}${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy Error:', err);
    res.status(500).send('Proxy Error');
  }
});

// 모든 API 경로를 프록시 처리
app.use(['/api', '/auth', '/config', '/cameras', '/recordings', '/events', '/users', '/system', '/backup', '/notifications', '/alerts', '/schedules', '/subscribe', '/statistic'], (req, res, next) => {
  console.log(`[Proxy] Intercepting: ${req.method} ${req.path}`);

  // 경로 리라이팅: /auth/login → /api/auth/login
  let targetPath = req.path;
  if (!req.path.startsWith('/api/')) {
    targetPath = `/api${req.path}`;
  }

  console.log(`[Proxy] Rewriting: ${req.path} → ${targetPath}`);
  console.log(`[Proxy] Target: ${getApiTarget()}${targetPath}`);

  // 프록시 미들웨어로 전달
  req.url = targetPath;
  return proxyMiddleware(req, res, next);
});

// 백엔드 서버 연결 테스트 엔드포인트
app.get('/test-backend', async (req, res) => {
  try {
    const target = getApiTarget();
    console.log(`[Test] Testing connection to: ${target}`);

    // 간단한 연결 테스트 (ping과 유사)
    const response = await fetch(`${target}/api/auth/check`);
    console.log(`[Test] Backend response status: ${response.status}`);

    if (response.ok) {
      res.json({
        status: 'success',
        message: 'Backend server is reachable',
        target: target,
        response: response.status
      });
    } else if (response.status === 401) {
      res.json({
        status: 'success',
        message: 'Backend server is reachable (401 Unauthorized is expected without auth token)',
        target: target,
        response: response.status,
        note: 'This is normal - the backend is working but requires authentication'
      });
    } else {
      res.json({
        status: 'error',
        message: 'Backend server responded with error',
        target: target,
        response: response.status
      });
    }
  } catch (error) {
    console.error('[Test] Backend connection failed:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Backend server is not reachable',
      target: getApiTarget(),
      error: error.message
    });
  }
});

// 정적 파일 제공
app.use(express.static(distPath));

// 모든 요청을 index.html로 리다이렉트 (SPA를 위한 설정)
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  console.log('Serving index.html from:', indexPath);

  // 파일 존재 여부 확인
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found. Please run npm run build first.');
  }
});

// 에러 핸들링
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal Server Error');
});

app.listen(port, () => {
  console.log('='.repeat(50));
  console.log(`UI server is running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API target: ${getApiTarget()}`);
  console.log(`Backend URL: ${getApiTarget()}`);
  console.log('='.repeat(50));
  console.log(`Please make sure you have run 'npm run build' first`);
}); 