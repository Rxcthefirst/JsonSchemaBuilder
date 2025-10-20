const PROXY_CONFIG = {
  '/api/schema-registry/**': {
    target: 'http://localhost:8081',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/api/schema-registry': ''
    },
    onProxyReq: function(proxyReq, req, res) {
      console.log('Proxying request:', req.url, '-> http://localhost:8081' + req.url.replace('/api/schema-registry', ''));
    },
    onError: function(err, req, res) {
      console.error('Proxy error:', err);
    }
  }
};

module.exports = PROXY_CONFIG;