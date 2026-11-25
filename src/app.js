'use strict';

require('express-async-errors'); // route handler rejections flow to the error middleware
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { helmetMw, apiLimiter } = require('./middleware/security');

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

function createApp() {
  const app = express();

  app.set('trust proxy', 1); // correct client IP + secure cookies behind a reverse proxy
  app.disable('x-powered-by');

  app.use(helmetMw);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Static assets. CSS/JS revalidate via ETag (so updates reach clients
  // immediately); images are cached long since they rarely change.
  app.use('/css', express.static(path.join(config.paths.public, 'css'), { maxAge: 0, etag: true }));
  app.use('/js', express.static(path.join(config.paths.public, 'js'), { maxAge: 0, etag: true }));
  app.use('/assets', express.static(path.join(config.paths.public, 'assets'), { maxAge: '30d' }));

  // Health
  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // API
  app.use('/api', apiLimiter, publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);

  // HTML pages
  const page = (file) => (req, res) => res.sendFile(path.join(config.paths.public, file));
  app.get('/', page('index.html'));
  app.get('/ticket/:token', page('ticket.html'));
  app.get('/verify/:token', page('verify.html'));
  app.get('/find', page('find.html'));
  app.get('/admin', page('admin/index.html'));
  app.get('/admin/*', page('admin/index.html'));

  // 404 for API vs pages
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
    res.status(404).sendFile(path.join(config.paths.public, '404.html'), (err) => {
      if (err) res.status(404).send('Not found');
    });
  });

  // Error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    if (res.headersSent) return;
    res.status(err.status || 500).json({ error: config.isProd ? 'Server error.' : err.message });
  });

  return app;
}

module.exports = { createApp };
