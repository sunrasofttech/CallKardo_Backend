const { Plan, Subscription } = require('../models');
const ResponseBuilder = require('../utils/response');
const { createPlanSchema, updatePlanSchema } = require('../validators/plan');
const { Op } = require('sequelize');

class PlanController {
  /**
   * Get all plans
   */
  async getAll(req, res, next) {
    try {
      const plans = await Plan.findAll({
        order: [['price', 'ASC']],
      });
      return ResponseBuilder.success(res, plans, 'Plans retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get plan by ID
   */
  async getById(req, res, next) {
    try {
      const plan = await Plan.findByPk(req.params.id);
      if (!plan) {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }
      return ResponseBuilder.success(res, plan, 'Plan retrieved successfully');
    } catch (err) {
      if (err.name === 'SequelizeDatabaseError' || err.name === 'SequelizeValidationError') {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }
      next(err);
    }
  }

  /**
   * Create Plan (Admin Only)
   */
  async create(req, res, next) {
    try {
      const { error, value } = createPlanSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { name, price, callLimit, maxConcurrentCalls } = value;
      const trimmedName = name.trim();

      // Check if plan already exists with same name
      const existingPlan = await Plan.findOne({ where: { name: trimmedName } });
      if (existingPlan) {
        return ResponseBuilder.error(res, `Plan with name '${trimmedName}' already exists`, 400);
      }

      const plan = await Plan.create({
        name: trimmedName,
        price,
        callLimit,
        maxConcurrentCalls,
      });

      return ResponseBuilder.success(res, plan, 'Plan created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update Plan (Admin Only)
   */
  async update(req, res, next) {
    try {
      const { error, value } = updatePlanSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      let plan = null;
      try {
        plan = await Plan.findByPk(req.params.id);
      } catch (e) {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }

      if (!plan) {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }

      const { name, price, callLimit, maxConcurrentCalls } = value;

      if (name !== undefined) {
        const trimmedName = name.trim();
        const existingPlan = await Plan.findOne({
          where: {
            name: trimmedName,
            id: { [Op.ne]: plan.id },
          },
        });
        if (existingPlan) {
          return ResponseBuilder.error(res, `Plan with name '${trimmedName}' already exists`, 400);
        }
      }

      await plan.update({
        ...(name !== undefined && { name: name.trim() }),
        ...(price !== undefined && { price }),
        ...(callLimit !== undefined && { callLimit }),
        ...(maxConcurrentCalls !== undefined && { maxConcurrentCalls }),
      });

      return ResponseBuilder.success(res, plan, 'Plan updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete Plan (Admin Only)
   */
  async delete(req, res, next) {
    try {
      let plan = null;
      try {
        plan = await Plan.findByPk(req.params.id);
      } catch (e) {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }

      if (!plan) {
        return ResponseBuilder.error(res, 'Plan not found', 404);
      }

      // Prevent deletion if plan is assigned to any subscription
      const activeSubscriptionsCount = await Subscription.count({ where: { planId: req.params.id } });
      if (activeSubscriptionsCount > 0) {
        return ResponseBuilder.error(
          res,
          `Cannot delete plan '${plan.name}' because it is assigned to ${activeSubscriptionsCount} subscription(s)`,
          400
        );
      }

      await plan.destroy();
      return ResponseBuilder.success(res, null, 'Plan deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PlanController();
