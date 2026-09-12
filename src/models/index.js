const sequelize = require('../config/database');

const Admin = require('./admin');
const User = require('./user');
const Category = require('./category');
const Plan = require('./plan');
const Subscription = require('./subscription');
const VobizAccount = require('./vobizAccount');
const VobizNumber = require('./vobizNumber');
const Agent = require('./agent');
const Voice = require('./voice');
const Customer = require('./customer');
const CustomerList = require('./customerList');
const CustomerListMember = require('./customerListMember');
const Campaign = require('./campaign');
const CampaignCustomer = require('./campaignCustomer');
const CallSession = require('./callSession');
const CallLog = require('./callLog');
const CallReport = require('./callReport');
const Notification = require('./notification');
const AuditLog = require('./auditLog');
const Setting = require('./setting');
const PaymentTransaction = require('./paymentTransaction');
const KycDetail = require('./kycDetail');
const MerchantMessageProgram = require('./merchantMessageProgram');
const MessageTemplate = require('./messageTemplate');
const MasterMessageTemplate = require('./masterMessageTemplate');
const ProgramDocumentRequirement = require('./programDocumentRequirement');
const HelpVideo = require('./helpVideo');
const SubscriptionHistory = require('./subscriptionHistory');
const Meeting = require('./meeting');
const MerchantCallback = require('./merchantCallback');

// Establish Relationships

// Category <-> User
Category.hasMany(User, { foreignKey: 'category_id', as: 'users' });
User.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

// Category <-> Voice (Default Voice)
Voice.hasMany(Category, { foreignKey: 'default_voice_id', as: 'defaultCategories' });
Category.belongsTo(Voice, { foreignKey: 'default_voice_id', as: 'defaultVoice' });

// User <-> Subscription
User.hasOne(Subscription, { foreignKey: 'user_id', as: 'subscription' });
Subscription.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Plan <-> Subscription
Plan.hasMany(Subscription, { foreignKey: 'plan_id', as: 'subscriptions' });
Subscription.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// User <-> VobizAccount
User.hasOne(VobizAccount, { foreignKey: 'user_id', as: 'vobizAccount' });
VobizAccount.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> VobizNumber
User.hasMany(VobizNumber, { foreignKey: 'user_id', as: 'vobizNumbers' });
VobizNumber.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Agent
User.hasMany(Agent, { foreignKey: 'user_id', as: 'agents' });
Agent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Voice <-> Agent
Voice.hasMany(Agent, { foreignKey: 'voice_id', as: 'agents' });
Agent.belongsTo(Voice, { foreignKey: 'voice_id', as: 'voice' });

// Category <-> Agent
Category.hasMany(Agent, { foreignKey: 'category_id', as: 'agents' });
Agent.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

// Voice <-> User (Custom Voices)
User.hasMany(Voice, { foreignKey: 'user_id', as: 'customVoices' });
Voice.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Customer
User.hasMany(Customer, { foreignKey: 'user_id', as: 'customers' });
Customer.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> CustomerList
User.hasMany(CustomerList, { foreignKey: 'user_id', as: 'customerLists' });
CustomerList.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// CustomerList <-> Customer (Many-to-Many via CustomerListMember)
CustomerList.belongsToMany(Customer, {
  through: CustomerListMember,
  foreignKey: 'customer_list_id',
  otherKey: 'customer_id',
  as: 'customers',
});
Customer.belongsToMany(CustomerList, {
  through: CustomerListMember,
  foreignKey: 'customer_id',
  otherKey: 'customer_list_id',
  as: 'lists',
});

// User <-> Campaign
User.hasMany(Campaign, { foreignKey: 'user_id', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Campaign <-> VobizNumber
VobizNumber.hasMany(Campaign, { foreignKey: 'vobiz_number_id', as: 'campaigns' });
Campaign.belongsTo(VobizNumber, { foreignKey: 'vobiz_number_id', as: 'vobizNumber' });

// Campaign <-> Agent
Agent.hasMany(Campaign, { foreignKey: 'agent_id', as: 'campaigns' });
Campaign.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

// VobizNumber <-> Agent
Agent.hasMany(VobizNumber, { foreignKey: 'agent_id', as: 'vobizNumbers' });
VobizNumber.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

// Campaign <-> CustomerList
CustomerList.hasMany(Campaign, { foreignKey: 'customer_list_id', as: 'campaigns' });
Campaign.belongsTo(CustomerList, { foreignKey: 'customer_list_id', as: 'customerList' });

// Campaign <-> Customer (Many-to-Many via CampaignCustomer)
Campaign.belongsToMany(Customer, {
  through: CampaignCustomer,
  foreignKey: 'campaign_id',
  otherKey: 'customer_id',
  as: 'campaignCustomers',
});
Customer.belongsToMany(Campaign, {
  through: CampaignCustomer,
  foreignKey: 'customer_id',
  otherKey: 'campaign_id',
  as: 'campaigns',
});

// Add explicit relationships for CampaignCustomer model query support
Campaign.hasMany(CampaignCustomer, { foreignKey: 'campaign_id', as: 'customerMappings' });
CampaignCustomer.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
Customer.hasMany(CampaignCustomer, { foreignKey: 'customer_id', as: 'campaignMappings' });
CampaignCustomer.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });

// User <-> CallSession
User.hasMany(CallSession, { foreignKey: 'user_id', as: 'callSessions' });
CallSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// CallSession <-> Campaign
Campaign.hasMany(CallSession, { foreignKey: 'campaign_id', as: 'callSessions' });
CallSession.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// CallSession <-> Agent
Agent.hasMany(CallSession, { foreignKey: 'agent_id', as: 'callSessions' });
CallSession.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

// CallSession <-> VobizNumber
VobizNumber.hasMany(CallSession, { foreignKey: 'vobiz_number_id', as: 'callSessions' });
CallSession.belongsTo(VobizNumber, { foreignKey: 'vobiz_number_id', as: 'vobizNumber' });

// CallSession <-> Customer
Customer.hasMany(CallSession, { foreignKey: 'customer_id', as: 'callSessions' });
CallSession.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });

// CallSession <-> CallLog
CallSession.hasMany(CallLog, { foreignKey: 'call_session_id', as: 'logs' });
CallLog.belongsTo(CallSession, { foreignKey: 'call_session_id', as: 'session' });

// CallSession <-> CallReport
CallSession.hasOne(CallReport, { foreignKey: 'call_session_id', as: 'report' });
CallReport.belongsTo(CallSession, { foreignKey: 'call_session_id', as: 'session' });

// User <-> CallReport
User.hasMany(CallReport, { foreignKey: 'user_id', as: 'callReports' });
CallReport.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Campaign <-> CallReport
Campaign.hasMany(CallReport, { foreignKey: 'campaign_id', as: 'callReports' });
CallReport.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// VobizNumber <-> CallReport
VobizNumber.hasMany(CallReport, { foreignKey: 'vobiz_number_id', as: 'callReports' });
CallReport.belongsTo(VobizNumber, { foreignKey: 'vobiz_number_id', as: 'vobizNumber' });

// Customer <-> CallReport
Customer.hasMany(CallReport, { foreignKey: 'customer_id', as: 'callReports' });
CallReport.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });

// User <-> Notification
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Admin <-> Notification
Admin.hasMany(Notification, { foreignKey: 'admin_id', as: 'notifications' });
Notification.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });

// User <-> PaymentTransaction
User.hasMany(PaymentTransaction, { foreignKey: 'user_id', as: 'paymentTransactions' });
PaymentTransaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> MerchantMessageProgram
User.hasMany(MerchantMessageProgram, { foreignKey: 'user_id', as: 'messagePrograms' });
MerchantMessageProgram.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> MessageTemplate
User.hasMany(MessageTemplate, { foreignKey: 'user_id', as: 'messageTemplates' });
MessageTemplate.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// MasterMessageTemplate <-> MessageTemplate
MasterMessageTemplate.hasMany(MessageTemplate, { foreignKey: 'master_template_id', as: 'merchantTemplates' });
MessageTemplate.belongsTo(MasterMessageTemplate, { foreignKey: 'master_template_id', as: 'masterTemplate' });

// User <-> SubscriptionHistory
User.hasMany(SubscriptionHistory, { foreignKey: 'user_id', as: 'subscriptionHistories' });
SubscriptionHistory.belongsTo(User, { foreignKey: 'user_id', as: 'merchant' });

// Admin <-> SubscriptionHistory
Admin.hasMany(SubscriptionHistory, { foreignKey: 'admin_id', as: 'upgradedSubscriptions' });
SubscriptionHistory.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });

// Plan <-> SubscriptionHistory
SubscriptionHistory.belongsTo(Plan, { foreignKey: 'new_plan_id', as: 'newPlan' });
SubscriptionHistory.belongsTo(Plan, { foreignKey: 'previous_plan_id', as: 'previousPlan' });

// User <-> AuditLog
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Meeting Associations
User.hasMany(Meeting, { foreignKey: 'merchant_id', as: 'meetings' });
Meeting.belongsTo(User, { foreignKey: 'merchant_id', as: 'merchant' });

Admin.hasMany(Meeting, { foreignKey: 'admin_id', as: 'meetings' });
Meeting.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });

Agent.hasMany(Meeting, { foreignKey: 'agent_id', as: 'meetings' });
Meeting.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

CallSession.hasOne(Meeting, { foreignKey: 'call_session_id', as: 'meeting' });
Meeting.belongsTo(CallSession, { foreignKey: 'call_session_id', as: 'callSession' });

// MerchantCallback Associations
User.hasMany(MerchantCallback, { foreignKey: 'merchant_id', as: 'callbacks' });
MerchantCallback.belongsTo(User, { foreignKey: 'merchant_id', as: 'merchant' });

Admin.hasMany(MerchantCallback, { foreignKey: 'admin_id', as: 'callbacks' });
MerchantCallback.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });

Agent.hasMany(MerchantCallback, { foreignKey: 'agent_id', as: 'callbacks' });
MerchantCallback.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

CallSession.hasOne(MerchantCallback, { foreignKey: 'call_session_id', as: 'callback' });
MerchantCallback.belongsTo(CallSession, { foreignKey: 'call_session_id', as: 'originalSession' });

// Admin <-> Agent (Merchant-Calling Agents)
Admin.hasMany(Agent, { foreignKey: 'admin_id', as: 'merchantAgents' });
Agent.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });

// Admin <-> CallSession (Admin-initiated Calls)
Admin.hasMany(CallSession, { foreignKey: 'admin_id', as: 'merchantCallSessions' });
CallSession.belongsTo(Admin, { foreignKey: 'admin_id', as: 'admin' });

module.exports = {
  sequelize,
  Admin,
  User,
  Category,
  Plan,
  Subscription,
  SubscriptionHistory,
  VobizAccount,
  VobizNumber,
  Agent,
  Voice,
  Customer,
  CustomerList,
  CustomerListMember,
  Campaign,
  CampaignCustomer,
  CallSession,
  CallLog,
  CallReport,
  Notification,
  AuditLog,
  Setting,
  PaymentTransaction,
  KycDetail,
  MerchantMessageProgram,
  MessageTemplate,
  MasterMessageTemplate,
  ProgramDocumentRequirement,
  HelpVideo,
  Meeting,
  MerchantCallback,
};
