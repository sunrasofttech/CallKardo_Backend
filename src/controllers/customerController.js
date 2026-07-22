const { Customer, CustomerList, CustomerListMember, sequelize } = require('../models');
const ResponseBuilder = require('../utils/response');
const { createCustomerSchema, updateCustomerSchema, createListSchema } = require('../validators/customer');
const fs = require('fs');
const csv = require('csv-parser');

class CustomerController {
  /**
   * Get all merchant's customers
   */
  async getAll(req, res, next) {
    try {
      const customers = await Customer.findAll({
        where: { userId: req.user.id },
      });
      return ResponseBuilder.success(res, customers, 'Customers retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get single customer
   */
  async getById(req, res, next) {
    try {
      const customer = await Customer.findOne({
        where: { id: req.params.id, userId: req.user.id },
      });
      if (!customer) {
        return ResponseBuilder.error(res, 'Customer not found', 404);
      }
      return ResponseBuilder.success(res, customer, 'Customer details retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create custom customer
   */
  async create(req, res, next) {
    try {
      const { error, value } = createCustomerSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { name, mobile, email, tags, notes } = value;

      // Check if mobile number exists for this merchant (soft-delete safe)
      const existing = await Customer.findOne({
        where: { userId: req.user.id, mobile },
      });
      if (existing) {
        return ResponseBuilder.error(res, 'A customer with this mobile number already exists under your account', 400);
      }

      const customer = await Customer.create({
        userId: req.user.id,
        name,
        mobile,
        email: email || null,
        tags,
        notes,
      });

      return ResponseBuilder.success(res, customer, 'Customer created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update Customer details
   */
  async update(req, res, next) {
    try {
      const { error, value } = updateCustomerSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const customer = await Customer.findOne({
        where: { id: req.params.id, userId: req.user.id },
      });

      if (!customer) {
        return ResponseBuilder.error(res, 'Customer not found', 404);
      }

      const { name, mobile, email, tags, notes } = value;

      // Check mobile unique constraint if changing mobile
      if (mobile && mobile !== customer.mobile) {
        const existing = await Customer.findOne({
          where: { userId: req.user.id, mobile },
        });
        if (existing) {
          return ResponseBuilder.error(res, 'A customer with this mobile number already exists', 400);
        }
      }

      await customer.update({
        name: name !== undefined ? name : customer.name,
        mobile: mobile !== undefined ? mobile : customer.mobile,
        email: email !== undefined ? email : customer.email,
        tags: tags !== undefined ? tags : customer.tags,
        notes: notes !== undefined ? notes : customer.notes,
      });

      return ResponseBuilder.success(res, customer, 'Customer details updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete Customer
   */
  async delete(req, res, next) {
    try {
      const customer = await Customer.findOne({
        where: { id: req.params.id, userId: req.user.id },
      });

      if (!customer) {
        return ResponseBuilder.error(res, 'Customer not found', 404);
      }

      await customer.destroy();
      return ResponseBuilder.success(res, null, 'Customer deleted successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Upload CSV to bulk import customers
   */
  async uploadCSV(req, res, next) {
    try {
      if (!req.file) {
        return ResponseBuilder.error(res, 'Please upload a CSV file', 400);
      }

      const filePath = req.file.path;
      const customersToCreate = [];
      const validationErrors = [];
      const processedNumbers = new Set();

      // Fetch existing merchant numbers from DB to detect duplicates
      const existingCustomers = await Customer.findAll({
        where: { userId: req.user.id },
        attributes: ['mobile'],
      });
      const dbMobileNumbers = new Set(existingCustomers.map((c) => c.mobile));

      fs.createReadStream(filePath)
        .pipe(csv(['name', 'mobile', 'tags', 'notes', 'email']))
        .on('data', (row) => {
          const name = row.name ? row.name.trim() : '';
          const mobile = row.mobile ? row.mobile.trim() : '';
          const tags = row.tags ? row.tags.trim() : '';
          const notes = row.notes ? row.notes.trim() : '';
          const email = row.email ? row.email.trim() : '';

          if (!name || !mobile) {
            validationErrors.push(`Row omitted: Missing name or mobile. (${JSON.stringify(row)})`);
            return;
          }

          // Validate phone regex
          const phoneRegex = /^\+?[1-9]\d{1,14}$/;
          if (!phoneRegex.test(mobile)) {
            validationErrors.push(`Row omitted: Invalid mobile format for ${name} (${mobile})`);
            return;
          }

          // Check for duplicate in the CSV file itself
          if (processedNumbers.has(mobile)) {
            validationErrors.push(`Row omitted: Duplicate mobile in CSV file for ${name} (${mobile})`);
            return;
          }

          // Check for duplicate in DB
          if (dbMobileNumbers.has(mobile)) {
            validationErrors.push(`Row omitted: Mobile ${mobile} already exists in database for this merchant`);
            return;
          }

          processedNumbers.add(mobile);
          customersToCreate.push({
            userId: req.user.id,
            name,
            mobile,
            email: email || null,
            tags,
            notes,
          });
        })
        .on('end', async () => {
          try {
            // Bulk Create
            if (customersToCreate.length > 0) {
              await Customer.bulkCreate(customersToCreate);
            }

            // Cleanup local temp file
            fs.unlinkSync(filePath);

            return ResponseBuilder.success(
              res,
              {
                importedCount: customersToCreate.length,
                omittedRows: validationErrors,
              },
              'CSV import completed'
            );
          } catch (bulkError) {
            // Cleanup in case of DB error
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            next(bulkError);
          }
        })
        .on('error', (csvError) => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          return ResponseBuilder.error(res, `Failed to parse CSV: ${csvError.message}`, 400);
        });
    } catch (err) {
      next(err);
    }
  }

  // --- Customer Lists Operations ---

  /**
   * Get all merchant's customer lists
   */
  async getLists(req, res, next) {
    try {
      const lists = await CustomerList.findAll({
        where: { userId: req.user.id },
      });
      return ResponseBuilder.success(res, lists, 'Customer lists retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get customer list details with member customers by List ID
   */
  async getListById(req, res, next) {
    try {
      const list = await CustomerList.findOne({
        where: { id: req.params.id, userId: req.user.id },
        include: ['customers'],
      });

      if (!list) {
        return ResponseBuilder.error(res, 'Customer list not found', 404);
      }

      return ResponseBuilder.success(res, list, 'Customer list retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a Customer List and associate customers
   */
  async createList(req, res, next) {
    const transaction = await sequelize.transaction();
    try {
      const { error, value } = createListSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { name, description, customerIds } = value;

      const list = await CustomerList.create(
        {
          userId: req.user.id,
          name,
          description,
        },
        { transaction }
      );

      if (customerIds && customerIds.length > 0) {
        // Confirm customers belong to merchant
        const validCustomers = await Customer.findAll({
          where: {
            id: customerIds,
            userId: req.user.id,
          },
          transaction,
        });

        const membersToCreate = validCustomers.map((c) => ({
          customerListId: list.id,
          customerId: c.id,
        }));

        await CustomerListMember.bulkCreate(membersToCreate, { transaction });
      }

      await transaction.commit();

      const createdList = await CustomerList.findByPk(list.id, {
        include: ['customers'],
      });

      return ResponseBuilder.success(res, createdList, 'Customer List created successfully', 201);
    } catch (err) {
      await transaction.rollback();
      next(err);
    }
  }

  /**
   * Delete customer list (retains actual customers)
   */
  async deleteList(req, res, next) {
    try {
      const list = await CustomerList.findOne({
        where: { id: req.params.id, userId: req.user.id },
      });

      if (!list) {
        return ResponseBuilder.error(res, 'Customer list not found', 404);
      }

      await list.destroy();
      return ResponseBuilder.success(res, null, 'Customer list deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CustomerController();
