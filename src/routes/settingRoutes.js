const express = require('express');
const SettingController = require('../controllers/settingController');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

// --- Public / App Content Pages APIs ---
router.get('/pages/all', SettingController.getAllPages);
router.get('/pages/terms', (req, res, next) => {
  req.params.slug = 'terms';
  SettingController.getPageBySlug(req, res, next);
});
router.get('/pages/privacy-policy', (req, res, next) => {
  req.params.slug = 'privacy-policy';
  SettingController.getPageBySlug(req, res, next);
});
router.get('/pages/about-us', (req, res, next) => {
  req.params.slug = 'about-us';
  SettingController.getPageBySlug(req, res, next);
});
router.get('/pages/features', (req, res, next) => {
  req.params.slug = 'features';
  SettingController.getPageBySlug(req, res, next);
});
router.get('/pages/help-support', (req, res, next) => {
  req.params.slug = 'help-support';
  SettingController.getPageBySlug(req, res, next);
});
router.get('/pages/:slug', SettingController.getPageBySlug);

// Admin routes for page updates
router.put('/pages/:slug', authenticate, isAdmin, SettingController.updatePageBySlug);

// --- App Settings CRUD APIs ---
router.get('/', authenticate, SettingController.getAllSettings);
router.get('/:key', authenticate, SettingController.getSettingByKey);
router.post('/', authenticate, isAdmin, SettingController.upsertSetting);
router.put('/:key', authenticate, isAdmin, (req, res, next) => {
  req.body.key = req.params.key;
  SettingController.upsertSetting(req, res, next);
});
router.delete('/:key', authenticate, isAdmin, SettingController.deleteSetting);

module.exports = router;
