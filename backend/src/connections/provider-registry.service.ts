import { BadRequestException, Injectable } from '@nestjs/common';

export type ConnectionScopeDefinition = {
  value: string;
  label: string;
  description: string;
};

export type ConnectionProviderDefinition = {
  key: string;
  name: string;
  category: 'Zoho' | 'Cloud' | 'Collaboration' | 'CRM' | 'Developer' | 'Marketing' | 'Payments' | 'Productivity' | 'Other';
  authTypes: string[];
  oauth: boolean;
  capabilities: string[];
  baseUrl?: string;
  scopes: ConnectionScopeDefinition[];
  defaultScopes: string[];
  oauthEnvPrefix?: string;
  oauthAuthUrl?: string;
  oauthTokenUrl?: string;
  oauthRevokeUrl?: string;
  probeUrl?: string;
  credentialHeader?: string;
  credentialPrefix?: string;
};

const scope = (value: string, label: string, description: string): ConnectionScopeDefinition => ({ value, label, description });

const DEFINITIONS: ConnectionProviderDefinition[] = [
  {
    key: 'google', name: 'Google', category: 'Cloud', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'revoke', 'probe'],
    oauthEnvPrefix: 'GOOGLE', oauthAuthUrl: 'https://accounts.google.com/o/oauth2/v2/auth', oauthTokenUrl: 'https://oauth2.googleapis.com/token', oauthRevokeUrl: 'https://oauth2.googleapis.com/revoke', probeUrl: 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
    scopes: [
      scope('https://www.googleapis.com/auth/drive.readonly', 'Drive — Read', 'Read files and folders in Google Drive.'),
      scope('https://www.googleapis.com/auth/drive.file', 'Drive — App files', 'Create and access files created or opened by this app.'),
      scope('https://www.googleapis.com/auth/drive.metadata.readonly', 'Drive — Metadata', 'Read Drive file metadata without file content.'),
      scope('https://www.googleapis.com/auth/spreadsheets.readonly', 'Sheets — Read', 'Read Google Sheets spreadsheets.'),
      scope('https://www.googleapis.com/auth/documents.readonly', 'Docs — Read', 'Read Google Docs documents.'),
      scope('https://www.googleapis.com/auth/calendar.readonly', 'Calendar — Read', 'Read Google Calendar events.'),
    ], defaultScopes: ['https://www.googleapis.com/auth/drive.readonly'],
  },
  {
    key: 'microsoft', name: 'Microsoft 365', category: 'Cloud', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'MICROSOFT', oauthAuthUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', oauthTokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', probeUrl: 'https://graph.microsoft.com/v1.0/me?$select=id',
    scopes: [
      scope('offline_access', 'Offline access', 'Allow refresh tokens for long-running automation.'),
      scope('Files.Read', 'OneDrive — Read', 'Read the signed-in user\'s files.'),
      scope('Files.ReadWrite', 'OneDrive — Read/Write', 'Read and modify the signed-in user\'s files.'),
      scope('User.Read', 'Profile', 'Read the signed-in user profile.'),
      scope('Mail.Read', 'Mail — Read', 'Read the signed-in user\'s mail.'),
      scope('Calendars.Read', 'Calendar — Read', 'Read the signed-in user\'s calendars.'),
    ], defaultScopes: ['offline_access', 'Files.Read', 'User.Read'],
  },
  {
    key: 'dropbox', name: 'Dropbox', category: 'Cloud', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'revoke', 'probe'],
    oauthEnvPrefix: 'DROPBOX', oauthAuthUrl: 'https://www.dropbox.com/oauth2/authorize', oauthTokenUrl: 'https://api.dropboxapi.com/oauth2/token', oauthRevokeUrl: 'https://api.dropboxapi.com/2/auth/token/revoke', probeUrl: 'https://api.dropboxapi.com/2/users/get_current_account',
    scopes: [
      scope('account_info.read', 'Account info', 'Read basic Dropbox account information.'),
      scope('files.metadata.read', 'Files — Metadata', 'Read file and folder metadata.'),
      scope('files.content.read', 'Files — Read', 'Download file content.'),
      scope('files.content.write', 'Files — Write', 'Create and modify file content.'),
      scope('sharing.read', 'Sharing — Read', 'Read shared links and sharing metadata.'),
    ], defaultScopes: ['account_info.read', 'files.metadata.read', 'files.content.read'],
  },
  {
    key: 'github', name: 'GitHub', category: 'Developer', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'GITHUB', oauthAuthUrl: 'https://github.com/login/oauth/authorize', oauthTokenUrl: 'https://github.com/login/oauth/access_token', probeUrl: 'https://api.github.com/user',
    scopes: [
      scope('read:user', 'Profile', 'Read the authenticated GitHub profile.'),
      scope('user:email', 'Email', 'Read the authenticated user email addresses.'),
      scope('repo', 'Repositories', 'Full access to private repositories.'),
      scope('read:org', 'Organizations — Read', 'Read organization membership and public information.'),
      scope('workflow', 'Actions workflows', 'Update GitHub Actions workflow files.'),
      scope('gist', 'Gists', 'Create and manage gists.'),
    ], defaultScopes: ['read:user', 'user:email'],
  },
  {
    key: 'slack', name: 'Slack', category: 'Collaboration', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'SLACK', oauthAuthUrl: 'https://slack.com/oauth/v2/authorize', oauthTokenUrl: 'https://slack.com/api/oauth.v2.access', probeUrl: 'https://slack.com/api/auth.test',
    scopes: [
      scope('chat:write', 'Messages — Send', 'Send messages as the connected Slack app.'),
      scope('channels:read', 'Channels — Read', 'Read public channel information.'),
      scope('groups:read', 'Private channels — Read', 'Read private channel information.'),
      scope('users:read', 'Users — Read', 'Read Slack workspace users.'),
      scope('files:read', 'Files — Read', 'Read files shared in Slack.'),
      scope('files:write', 'Files — Write', 'Upload files to Slack.'),
    ], defaultScopes: ['chat:write', 'channels:read'],
  },
  {
    key: 'asana', name: 'Asana', category: 'Productivity', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'ASANA', oauthAuthUrl: 'https://app.asana.com/-/oauth_authorize', oauthTokenUrl: 'https://app.asana.com/-/oauth_token', probeUrl: 'https://app.asana.com/api/1.0/users/me',
    scopes: [scope('default', 'Default', 'Asana OAuth default permissions for the connected app.')], defaultScopes: ['default'],
  },
  {
    key: 'notion', name: 'Notion', category: 'Productivity', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'NOTION', oauthAuthUrl: 'https://api.notion.com/v1/oauth/authorize', oauthTokenUrl: 'https://api.notion.com/v1/oauth/token', probeUrl: 'https://api.notion.com/v1/users/me',
    scopes: [scope('read_content', 'Read content', 'Read pages and databases shared with the integration.')], defaultScopes: ['read_content'],
  },
  {
    key: 'hubspot', name: 'HubSpot', category: 'CRM', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'HUBSPOT', oauthAuthUrl: 'https://app.hubspot.com/oauth/authorize', oauthTokenUrl: 'https://api.hubapi.com/oauth/v1/token', probeUrl: 'https://api.hubapi.com/oauth/v1/access-tokens',
    scopes: [scope('crm.objects.contacts.read', 'Contacts — Read', 'Read CRM contact records.'), scope('crm.objects.companies.read', 'Companies — Read', 'Read CRM company records.'), scope('tickets', 'Tickets', 'Access HubSpot ticket data.')], defaultScopes: ['crm.objects.contacts.read'],
  },
  {
    key: 'salesforce', name: 'Salesforce', category: 'CRM', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'SALESFORCE', oauthAuthUrl: 'https://login.salesforce.com/services/oauth2/authorize', oauthTokenUrl: 'https://login.salesforce.com/services/oauth2/token', probeUrl: 'https://login.salesforce.com/services/oauth2/userinfo',
    scopes: [scope('api', 'API', 'Access Salesforce APIs.'), scope('refresh_token offline_access', 'Refresh token', 'Keep the connection active for automation.')], defaultScopes: ['api', 'refresh_token offline_access'],
  },
  {
    key: 'zoom', name: 'Zoom', category: 'Collaboration', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'ZOOM', oauthAuthUrl: 'https://zoom.us/oauth/authorize', oauthTokenUrl: 'https://zoom.us/oauth/token', probeUrl: 'https://api.zoom.us/v2/users/me',
    scopes: [scope('user:read', 'User — Read', 'Read the connected Zoom user.'), scope('meeting:read', 'Meetings — Read', 'Read meeting information.'), scope('meeting:write', 'Meetings — Write', 'Create and update meetings.')], defaultScopes: ['user:read', 'meeting:read'],
  },
  {
    key: 'discord', name: 'Discord', category: 'Collaboration', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth'],
    oauthEnvPrefix: 'DISCORD', oauthAuthUrl: 'https://discord.com/oauth2/authorize', oauthTokenUrl: 'https://discord.com/api/oauth2/token', probeUrl: 'https://discord.com/api/users/@me',
    scopes: [scope('identify', 'Identity', 'Read the connected Discord user.'), scope('email', 'Email', 'Read the connected Discord email.'), scope('guilds', 'Servers', 'Read servers the user belongs to.')], defaultScopes: ['identify'],
  },
  {
    key: 'mailchimp', name: 'Mailchimp', category: 'Marketing', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth'],
    oauthEnvPrefix: 'MAILCHIMP', oauthAuthUrl: 'https://login.mailchimp.com/oauth2/authorize', oauthTokenUrl: 'https://login.mailchimp.com/oauth2/token',
    scopes: [scope('default', 'Account access', 'Mailchimp OAuth account access.')], defaultScopes: ['default'],
  },
  { key: 'stripe', name: 'Stripe', category: 'Payments', authTypes: ['BEARER'], oauth: false, capabilities: ['request', 'probe'], baseUrl: 'https://api.stripe.com', scopes: [scope('read', 'Read', 'Read Stripe account data.'), scope('write', 'Write', 'Create and modify Stripe resources.')], defaultScopes: ['read'], credentialHeader: 'Authorization', credentialPrefix: 'Bearer ' },
  { key: 'sendgrid', name: 'SendGrid', category: 'Marketing', authTypes: ['BEARER'], oauth: false, capabilities: ['request'], baseUrl: 'https://api.sendgrid.com', scopes: [scope('mail.send', 'Send mail', 'Send email through SendGrid.')], defaultScopes: ['mail.send'], credentialHeader: 'Authorization', credentialPrefix: 'Bearer ' },
  { key: 'twilio', name: 'Twilio', category: 'Other', authTypes: ['BASIC'], oauth: false, capabilities: ['request'], baseUrl: 'https://api.twilio.com', scopes: [scope('messages.read', 'Messages', 'Access Twilio messaging APIs.'), scope('calls.read', 'Calls', 'Access Twilio voice APIs.')], defaultScopes: ['messages.read'], credentialHeader: 'Authorization', credentialPrefix: 'Basic ' },
  { key: 'trello', name: 'Trello', category: 'Productivity', authTypes: ['API_KEY'], oauth: false, capabilities: ['request'], baseUrl: 'https://api.trello.com', scopes: [scope('read', 'Read', 'Read boards, lists and cards.'), scope('write', 'Write', 'Create and modify Trello data.')], defaultScopes: ['read'], credentialHeader: 'X-API-Key' },
  { key: 'jira', name: 'Jira Cloud', category: 'Developer', authTypes: ['BEARER', 'BASIC'], oauth: false, capabilities: ['request'], baseUrl: 'https://your-domain.atlassian.net', scopes: [scope('read:jira-work', 'Work — Read', 'Read Jira issues and projects.'), scope('write:jira-work', 'Work — Write', 'Create and modify Jira issues.')], defaultScopes: ['read:jira-work'], credentialHeader: 'Authorization', credentialPrefix: 'Bearer ' },
  { key: 'linear', name: 'Linear', category: 'Developer', authTypes: ['BEARER'], oauth: false, capabilities: ['request'], baseUrl: 'https://api.linear.app', scopes: [scope('read', 'Read', 'Read Linear workspace data.'), scope('write', 'Write', 'Create and modify Linear data.')], defaultScopes: ['read'], credentialHeader: 'Authorization', credentialPrefix: 'Bearer ' },
  { key: 'pipedrive', name: 'Pipedrive', category: 'CRM', authTypes: ['BEARER'], oauth: false, capabilities: ['request'], baseUrl: 'https://api.pipedrive.com', scopes: [scope('deals.read', 'Deals — Read', 'Read deal data.'), scope('deals.write', 'Deals — Write', 'Modify deal data.')], defaultScopes: ['deals.read'], credentialHeader: 'Authorization', credentialPrefix: 'Bearer ' },
  { key: 'freshbooks', name: 'FreshBooks', category: 'CRM', authTypes: ['BEARER'], oauth: false, capabilities: ['request'], baseUrl: 'https://api.freshbooks.com', scopes: [scope('accounting.read', 'Accounting — Read', 'Read accounting resources.')], defaultScopes: ['accounting.read'], credentialHeader: 'Authorization', credentialPrefix: 'Bearer ' },
  { key: 'zoho-crm', name: 'Zoho CRM', category: 'Zoho', authTypes: ['BEARER'], oauth: false, capabilities: ['request'], baseUrl: 'https://www.zohoapis.com', scopes: [scope('ZohoCRM.modules.ALL', 'CRM — All', 'Read and write CRM modules.'), scope('ZohoCRM.coql.READ', 'COQL — Read', 'Run read-only COQL queries.')], defaultScopes: ['ZohoCRM.modules.ALL'], credentialHeader: 'Authorization', credentialPrefix: 'Zoho-oauthtoken ' },
  { key: 'zoho-books', name: 'Zoho Books', category: 'Zoho', authTypes: ['BEARER'], oauth: false, capabilities: ['request'], baseUrl: 'https://www.zohoapis.com/books/v3', scopes: [scope('ZohoBooks.fullaccess.all', 'Books — All', 'Read and write Zoho Books resources.')], defaultScopes: ['ZohoBooks.fullaccess.all'], credentialHeader: 'Authorization', credentialPrefix: 'Zoho-oauthtoken ' },
  { key: 'zoho-desk', name: 'Zoho Desk', category: 'Zoho', authTypes: ['BEARER'], oauth: false, capabilities: ['request'], baseUrl: 'https://desk.zoho.com/api/v1', scopes: [scope('Desk.tickets.READ', 'Tickets — Read', 'Read Desk tickets.'), scope('Desk.tickets.UPDATE', 'Tickets — Update', 'Update Desk tickets.')], defaultScopes: ['Desk.tickets.READ'], credentialHeader: 'Authorization', credentialPrefix: 'Zoho-oauthtoken ' },
  { key: 'zoho-projects', name: 'Zoho Projects', category: 'Zoho', authTypes: ['BEARER'], oauth: false, capabilities: ['request'], baseUrl: 'https://projectsapi.zoho.com', scopes: [scope('ZohoProjects.projects.READ', 'Projects — Read', 'Read Zoho Projects data.'), scope('ZohoProjects.projects.ALL', 'Projects — All', 'Read and write Zoho Projects data.')], defaultScopes: ['ZohoProjects.projects.READ'], credentialHeader: 'Authorization', credentialPrefix: 'Zoho-oauthtoken ' },
  { key: 'rest', name: 'REST API', category: 'Other', authTypes: ['API_KEY', 'BEARER', 'BASIC', 'CUSTOM_HEADER', 'NONE'], oauth: false, capabilities: ['request'], scopes: [], defaultScopes: [] },
];

@Injectable()
export class ConnectionProviderRegistry {
  list() {
    return DEFINITIONS.map((x) => ({
      ...x,
      authTypes: [...x.authTypes],
      capabilities: [...x.capabilities],
      scopes: x.scopes.map((s) => ({ ...s })),
      defaultScopes: [...x.defaultScopes],
    }));
  }
  get(key: string) {
    const found = DEFINITIONS.find((x) => x.key === key);
    if (!found) throw new BadRequestException(`Unsupported connection provider: ${key}`);
    return found;
  }
  supports(key: string, authType: string) {
    const p = DEFINITIONS.find((x) => x.key === key);
    return !!p && p.authTypes.includes(authType);
  }
}
