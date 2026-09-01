const { HelpVideo } = require('../models');
const ResponseBuilder = require('../utils/response');

class HelpVideoController {
  // ================= ADMIN APIs =================

  async createVideo(req, res, next) {
    try {
      const { title, url, description, isActive, order } = req.body;
      if (!title || !url) {
        return ResponseBuilder.error(res, 'Title and URL are required', 400);
      }
      const video = await HelpVideo.create({ title, url, description, isActive, order });
      return ResponseBuilder.success(res, video, 'Help video created successfully');
    } catch (err) {
      next(err);
    }
  }

  async getAdminVideos(req, res, next) {
    try {
      const videos = await HelpVideo.findAll({ order: [['order', 'ASC'], ['createdAt', 'DESC']] });
      return ResponseBuilder.success(res, videos, 'Help videos retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateVideo(req, res, next) {
    try {
      const { id } = req.params;
      const { title, url, description, isActive, order } = req.body;
      const video = await HelpVideo.findByPk(id);
      if (!video) {
        return ResponseBuilder.error(res, 'Help video not found', 404);
      }
      await video.update({ title, url, description, isActive, order });
      return ResponseBuilder.success(res, video, 'Help video updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async deleteVideo(req, res, next) {
    try {
      const { id } = req.params;
      const video = await HelpVideo.findByPk(id);
      if (!video) {
        return ResponseBuilder.error(res, 'Help video not found', 404);
      }
      await video.destroy();
      return ResponseBuilder.success(res, null, 'Help video deleted successfully');
    } catch (err) {
      next(err);
    }
  }

  // ================= MERCHANT APIs =================

  async getVideos(req, res, next) {
    try {
      const videos = await HelpVideo.findAll({
        where: { isActive: true },
        order: [['order', 'ASC'], ['createdAt', 'DESC']],
        attributes: ['id', 'title', 'url', 'description', 'order']
      });
      return ResponseBuilder.success(res, videos, 'Help videos retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new HelpVideoController();
