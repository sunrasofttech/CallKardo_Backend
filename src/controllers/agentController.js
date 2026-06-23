const { Agent, Voice, Category, User } = require('../models');
const ResponseBuilder = require('../utils/response');
const { createAgentSchema, updateAgentSchema } = require('../validators/agent');
const { Op } = require('sequelize');
const SarvamService = require('../services/sarvamService');
const fs = require('fs');
const path = require('path');

async function handleFirstMessageAudio(agent, firstMessage) {
  if (!firstMessage) {
    if (agent.firstMessageAudioPath) {
      const oldPath = path.resolve(agent.firstMessageAudioPath);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) {}
      }
    }
    return null;
  }

  let voice = agent.voice;
  if (!voice && agent.voiceId) {
    voice = await Voice.findByPk(agent.voiceId);
  }

  const voiceName = voice ? voice.voiceId : 'shubh';
  const language = agent.language || 'en';

  const audioBuffer = await SarvamService.synthesizeText(firstMessage, voiceName, language, {
    pace: agent.pace,
    temperature: agent.temperature,
  });

  const filename = `${agent.id}.wav`;
  const uploadsDir = path.join(process.cwd(), 'uploads', 'previews', 'first-message');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, audioBuffer);

  return `uploads/previews/first-message/${filename}`;
}

class AgentController {
  /**
   * Get all agents accessible to the current merchant
   * This includes:
   * 1. Preloaded agents (isCustom = false, categoryId matches user's category)
   * 2. Custom agents created by this merchant user (userId = current user id)
   */
  async getAll(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) {
        return ResponseBuilder.error(res, 'User not found', 404);
      }

      const categoryId = user.categoryId;

      // Find all custom agents or default agents of matching category
      const agents = await Agent.findAll({
        where: {
          [Op.or]: [
            { userId: req.user.id },
            {
              isCustom: false,
              categoryId: categoryId,
            },
          ],
        },
        include: [
          { model: Voice, as: 'voice' },
          { model: Category, as: 'category' },
        ],
      });

      return ResponseBuilder.success(res, agents, 'Agents retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get agent by ID
   */
  async getById(req, res, next) {
    try {
      const agent = await Agent.findByPk(req.params.id, {
        include: [
          { model: Voice, as: 'voice' },
          { model: Category, as: 'category' },
        ],
      });

      if (!agent) {
        return ResponseBuilder.error(res, 'Agent not found', 404);
      }

      // Authorization: Check if agent belongs to current merchant, or is global/preloaded matching merchant category
      const user = await User.findByPk(req.user.id);
      if (agent.userId !== req.user.id && (agent.isCustom || agent.categoryId !== user.categoryId)) {
        return ResponseBuilder.error(res, 'Unauthorized to access this agent configuration', 403);
      }

      return ResponseBuilder.success(res, agent, 'Agent details retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create custom agent (Merchant)
   */
  async create(req, res, next) {
    try {
      const { error, value } = createAgentSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { name, description, systemPrompt, language, voiceId, categoryId, activeStatus, allowInterruption, pace, temperature, firstMessage, aiProvider } = value;

      // Validate voice exists
      const voice = await Voice.findByPk(voiceId);
      if (!voice) {
        return ResponseBuilder.error(res, 'Target Voice not found', 400);
      }

      // Validate category if provided
      if (categoryId) {
        const cat = await Category.findByPk(categoryId);
        if (!cat) {
          return ResponseBuilder.error(res, 'Category not found', 400);
        }
      }

      const agent = await Agent.create({
        userId: req.user.id,
        name,
        description,
        systemPrompt,
        language,
        voiceId,
        categoryId: categoryId || req.user.categoryId,
        isCustom: true,
        activeStatus,
        allowInterruption,
        pace,
        temperature,
        firstMessage,
        aiProvider,
      });

      if (firstMessage) {
        const audioPath = await handleFirstMessageAudio(agent, firstMessage);
        await agent.update({ firstMessageAudioPath: audioPath });
      }

      return ResponseBuilder.success(res, agent, 'Voice Agent created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update agent (Merchant can only update their own custom agents)
   */
  async update(req, res, next) {
    try {
      const { error, value } = updateAgentSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const agent = await Agent.findByPk(req.params.id);
      if (!agent) {
        return ResponseBuilder.error(res, 'Agent not found', 404);
      }

      // Check ownership
      if (agent.userId !== req.user.id) {
        return ResponseBuilder.error(res, 'Forbidden: You cannot modify default preloaded agents', 403);
      }

      const { name, description, systemPrompt, language, voiceId, categoryId, activeStatus, allowInterruption, pace, temperature, firstMessage, aiProvider } = value;

      if (voiceId) {
        const voice = await Voice.findByPk(voiceId);
        if (!voice) {
          return ResponseBuilder.error(res, 'Target Voice not found', 400);
        }
      }

      if (categoryId) {
        const cat = await Category.findByPk(categoryId);
        if (!cat) {
          return ResponseBuilder.error(res, 'Category not found', 400);
        }
      }

      await agent.update({
        name: name !== undefined ? name : agent.name,
        description: description !== undefined ? description : agent.description,
        systemPrompt: systemPrompt !== undefined ? systemPrompt : agent.systemPrompt,
        language: language !== undefined ? language : agent.language,
        voiceId: voiceId !== undefined ? voiceId : agent.voiceId,
        categoryId: categoryId !== undefined ? categoryId : agent.categoryId,
        activeStatus: activeStatus !== undefined ? activeStatus : agent.activeStatus,
        allowInterruption: allowInterruption !== undefined ? allowInterruption : agent.allowInterruption,
        pace: pace !== undefined ? pace : agent.pace,
        temperature: temperature !== undefined ? temperature : agent.temperature,
        firstMessage: firstMessage !== undefined ? firstMessage : agent.firstMessage,
        aiProvider: aiProvider !== undefined ? aiProvider : agent.aiProvider,
      });

      const isVoiceOrSettingsChanged = (voiceId && voiceId !== agent.voiceId) ||
                                       (language && language !== agent.language) ||
                                       (pace !== undefined && parseFloat(pace) !== parseFloat(agent.pace)) ||
                                       (temperature !== undefined && parseFloat(temperature) !== parseFloat(agent.temperature));

      if (firstMessage !== undefined || (agent.firstMessage && isVoiceOrSettingsChanged)) {
        const audioPath = await handleFirstMessageAudio(agent, agent.firstMessage);
        await agent.update({ firstMessageAudioPath: audioPath });
      }

      return ResponseBuilder.success(res, agent, 'Agent details updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete custom agent
   */
  async delete(req, res, next) {
    try {
      const agent = await Agent.findByPk(req.params.id);
      if (!agent) {
        return ResponseBuilder.error(res, 'Agent not found', 404);
      }

      // Check ownership
      if (agent.userId !== req.user.id) {
        return ResponseBuilder.error(res, 'Forbidden: You cannot delete preloaded default agents', 403);
      }

      await agent.destroy();
      return ResponseBuilder.success(res, null, 'Custom agent deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AgentController();
