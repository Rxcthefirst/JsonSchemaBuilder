const PROXY_CONFIG = {
  '/api/schema-registry/**': {
    target: 'https://d3ej5qtqlefebd.cloudfront.net',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/api/schema-registry': ''
    },
    onProxyReq: function(proxyReq, req, res) {
          console.log('Proxying request:', req.url, '-> https://d3ej5qtqlefebd.cloudfront.net' + req.url.replace('/api/schema-registry', ''));
        },
    onError: function(err, req, res) {
      console.error('Proxy error:', err);
    }
  }
};

module.exports = PROXY_CONFIG;