const { MerchantMessageProgram, MessageTemplate, MasterMessageTemplate, ProgramDocumentRequirement } = require('../models');

exports.getRequirements = async (req, res) => {
  try {
    const { provider } = req.query; // 'rcs' or 'whatsapp'
    const where = {};
    if (provider) where.provider = provider;
    
    const requirements = await ProgramDocumentRequirement.findAll({ where });
    res.status(200).json({ success: true, data: requirements });
  } catch (error) {
    console.error('Get requirements error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch requirements.' });
  }
};

exports.applyForProgram = async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider, submitted_documents } = req.body;

    if (!['rcs', 'whatsapp', 'both'].includes(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider. Must be rcs, whatsapp, or both.' });
    }

    if (submitted_documents && typeof submitted_documents === 'object') {
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
      for (const [docName, docUrl] of Object.entries(submitted_documents)) {
        if (typeof docUrl !== 'string') {
          return res.status(400).json({ success: false, error: `Document ${docName} must be a valid URL.` });
        }
        const cleanString = docUrl.split('?')[0].toLowerCase();
        const hasValidExt = allowedExtensions.some(ext => cleanString.endsWith(ext));
        if (!hasValidExt) {
          return res.status(400).json({ success: false, error: `Document ${docName} must be an image file (.png, .jpg, .jpeg, etc.).` });
        }
      }
    }

    const [program, created] = await MerchantMessageProgram.findOrCreate({
      where: { user_id: userId, provider },
      defaults: { 
        status: 'pending',
        submitted_documents: submitted_documents || {} 
      },
    });

    if (!created) {
      // If already exists, they might be updating their application docs
      program.submitted_documents = submitted_documents || program.submitted_documents;
      program.status = 'pending'; // Reset status for re-review
      await program.save();
    }

    res.status(201).json({ success: true, data: program });
  } catch (error) {
    console.error('Apply for program error:', error);
    res.status(500).json({ success: false, error: 'Failed to apply for program.' });
  }
};

exports.getPrograms = async (req, res) => {
  try {
    const userId = req.user.id;
    const programs = await MerchantMessageProgram.findAll({
      where: { user_id: userId },
      attributes: { exclude: ['credentials'] } // Don't expose full credentials to frontend
    });

    res.status(200).json({ success: true, data: programs });
  } catch (error) {
    console.error('Get programs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch programs.' });
  }
};

exports.getMasterTemplates = async (req, res) => {
  try {
    const { provider } = req.query;
    const where = { is_active: true };
    if (provider) where.provider = provider;

    const templates = await MasterMessageTemplate.findAll({ where });
    res.status(200).json({ success: true, data: templates });
  } catch (error) {
    console.error('Get master templates error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch master templates.' });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider, master_template_id, content, template_name } = req.body;

    if (!['rcs', 'whatsapp'].includes(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider. Must be rcs or whatsapp.' });
    }

    if (!master_template_id || !content) {
      return res.status(400).json({ success: false, error: 'master_template_id and content are required.' });
    }

    const masterTemplate = await MasterMessageTemplate.findByPk(master_template_id);
    if (!masterTemplate) {
      return res.status(404).json({ success: false, error: 'Master template not found.' });
    }

    if (!masterTemplate.is_active) {
      return res.status(400).json({ success: false, error: 'This template is currently inactive.' });
    }

    // Validate that the merchant provided all required params
    if (masterTemplate.merchant_params && Array.isArray(masterTemplate.merchant_params)) {
      const missingParams = masterTemplate.merchant_params.filter(param => content[param] === undefined || content[param] === null || content[param] === '');
      if (missingParams.length > 0) {
        return res.status(400).json({ 
          success: false, 
          error: `Missing required variables for this template: ${missingParams.join(', ')}` 
        });
      }
    }

    const template = await MessageTemplate.create({
      user_id: userId,
      master_template_id,
      provider,
      template_name: template_name || masterTemplate.name,
      content,
      status: 'pending'
    });

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ success: false, error: 'Failed to create template.' });
  }
};

exports.getTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const templates = await MessageTemplate.findAll({
      where: { user_id: userId },
      include: [
        { model: MasterMessageTemplate, as: 'masterTemplate', attributes: ['name', 'structure'] }
      ]
    });

    res.status(200).json({ success: true, data: templates });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch templates.' });
  }
};
