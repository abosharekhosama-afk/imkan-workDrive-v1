import { BadRequestException, Injectable } from '@nestjs/common';

export type ConnectionScopeDefinition = {
  value: string;
  label: string;
  description: string;
  group?: string;
  risk?: 'STANDARD' | 'SENSITIVE' | 'RESTRICTED';
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
  scopeGroups?: string[];
  oauthEnvPrefix?: string;
  oauthAuthUrl?: string;
  oauthTokenUrl?: string;
  oauthRevokeUrl?: string;
  probeUrl?: string;
  credentialHeader?: string;
  credentialPrefix?: string;
  credentialQueryKey?: string;
};

const scope = (value: string, label: string, description: string, group?: string, risk: ConnectionScopeDefinition['risk'] = 'STANDARD'): ConnectionScopeDefinition => ({ value, label, description, group: group ?? label.split(' — ')[0] ?? 'General', risk });

const DEFINITIONS: ConnectionProviderDefinition[] = [
  {
    key: 'google', name: 'Google', category: 'Cloud', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'revoke', 'probe'],
    oauthEnvPrefix: 'GOOGLE', oauthAuthUrl: 'https://accounts.google.com/o/oauth2/v2/auth', oauthTokenUrl: 'https://oauth2.googleapis.com/token', oauthRevokeUrl: 'https://oauth2.googleapis.com/revoke', probeUrl: 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
    scopes: [
      scope('openid', 'Sign-in identity', 'Associate the connection with the Google account.', 'Identity'),
      scope('email', 'Email address', 'Read the primary Google Account email address.', 'Identity'),
      scope('profile', 'Basic profile', 'Read basic Google Account profile information.', 'Identity'),
      scope('https://www.googleapis.com/auth/drive.file', 'App files', 'See, edit, create and delete only files selected or created by this app.', 'Google Drive'),
      scope('https://www.googleapis.com/auth/drive.metadata.readonly', 'Metadata — Read', 'View metadata for files in Google Drive.', 'Google Drive'),
      scope('https://www.googleapis.com/auth/drive.readonly', 'Files — Read', 'See and download all Google Drive files.', 'Google Drive', 'SENSITIVE'),
      scope('https://www.googleapis.com/auth/drive', 'Files — Full access', 'View and manage all Google Drive files.', 'Google Drive', 'RESTRICTED'),
      scope('https://www.googleapis.com/auth/drive.metadata', 'Metadata — Manage', 'View and manage Drive file metadata.', 'Google Drive'),
      scope('https://www.googleapis.com/auth/spreadsheets.readonly', 'Sheets — Read', 'Read Google Sheets spreadsheets.', 'Google Sheets'),
      scope('https://www.googleapis.com/auth/spreadsheets', 'Sheets — Manage', 'Create, edit and delete Google Sheets spreadsheets.', 'Google Sheets'),
      scope('https://www.googleapis.com/auth/documents.readonly', 'Docs — Read', 'Read Google Docs documents.', 'Google Docs'),
      scope('https://www.googleapis.com/auth/documents', 'Docs — Manage', 'View and manage Google Docs documents.', 'Google Docs'),
      scope('https://www.googleapis.com/auth/presentations.readonly', 'Slides — Read', 'Read Google Slides presentations.', 'Google Slides'),
      scope('https://www.googleapis.com/auth/presentations', 'Slides — Manage', 'View and manage Google Slides presentations.', 'Google Slides'),
      scope('https://www.googleapis.com/auth/calendar.readonly', 'Calendar — Read', 'Read Google Calendar events.', 'Google Calendar'),
      scope('https://www.googleapis.com/auth/calendar.events', 'Calendar — Events', 'View and edit events on Google Calendars.', 'Google Calendar'),
      scope('https://www.googleapis.com/auth/gmail.readonly', 'Gmail — Read', 'Read Gmail messages and settings.', 'Gmail', 'SENSITIVE'),
      scope('https://www.googleapis.com/auth/gmail.send', 'Gmail — Send', 'Send email on your behalf.', 'Gmail', 'SENSITIVE'),
    ], defaultScopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file'],
  },
  {
    key: 'microsoft', name: 'Microsoft 365', category: 'Cloud', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'MICROSOFT', oauthAuthUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', oauthTokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', probeUrl: 'https://graph.microsoft.com/v1.0/me?$select=id',
    scopes: [
      scope('openid', 'OpenID identity', 'Sign the user in and return an ID token.', 'Identity'),
      scope('profile', 'Profile', 'Read basic user profile information.', 'Identity'),
      scope('email', 'Email', 'Read the user email claim.', 'Identity'),
      scope('offline_access', 'Offline access', 'Allow refresh tokens for long-running automation.', 'Identity'),
      scope('User.Read', 'Profile — Read', 'Read the signed-in user profile.', 'Microsoft 365'),
      scope('Files.Read', 'OneDrive — Read', 'Read the signed-in user files.', 'OneDrive'),
      scope('Files.ReadWrite', 'OneDrive — Read/Write', 'Read, create, update and delete the signed-in user files.', 'OneDrive'),
      scope('Files.Read.All', 'OneDrive — All files read', 'Read all files the user can access.', 'OneDrive', 'SENSITIVE'),
      scope('Files.ReadWrite.All', 'OneDrive — All files manage', 'Read, create, update and delete all files the user can access.', 'OneDrive', 'SENSITIVE'),
      scope('Mail.Read', 'Mail — Read', 'Read the signed-in user mail.', 'Outlook Mail'),
      scope('Mail.ReadWrite', 'Mail — Read/Write', 'Read and modify the signed-in user mail.', 'Outlook Mail'),
      scope('Mail.Send', 'Mail — Send', 'Send mail as the signed-in user.', 'Outlook Mail'),
      scope('Calendars.Read', 'Calendar — Read', 'Read the signed-in user calendars.', 'Outlook Calendar'),
      scope('Calendars.ReadWrite', 'Calendar — Read/Write', 'Create, read, update and delete calendar events.', 'Outlook Calendar'),
      scope('Contacts.Read', 'Contacts — Read', 'Read the signed-in user contacts.', 'Outlook Contacts'),
      scope('Sites.Read.All', 'SharePoint — Read', 'Read items in all site collections the user can access.', 'SharePoint', 'SENSITIVE'),
      scope('Sites.ReadWrite.All', 'SharePoint — Read/Write', 'Read and write items in all site collections the user can access.', 'SharePoint', 'SENSITIVE'),
    ], defaultScopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Files.Read'],
  },
  {
    key: 'dropbox', name: 'Dropbox', category: 'Cloud', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'revoke', 'probe'],
    oauthEnvPrefix: 'DROPBOX', oauthAuthUrl: 'https://www.dropbox.com/oauth2/authorize', oauthTokenUrl: 'https://api.dropboxapi.com/oauth2/token', oauthRevokeUrl: 'https://api.dropboxapi.com/2/auth/token/revoke', probeUrl: 'https://api.dropboxapi.com/2/users/get_current_account',
    scopes: [
      scope('account_info.read', 'Account — Read', 'Read basic Dropbox account information.', 'Identity'),
      scope('files.metadata.read', 'Metadata — Read', 'Read file and folder metadata.', 'Files'),
      scope('files.content.read', 'Content — Read', 'Download file content.', 'Files'),
      scope('files.content.write', 'Content — Write', 'Create and modify file content.', 'Files'),
      scope('sharing.read', 'Sharing — Read', 'Read shared links and sharing metadata.', 'Sharing'),
      scope('sharing.write', 'Sharing — Write', 'Create and modify shared links and sharing settings.', 'Sharing'),
    ], defaultScopes: ['account_info.read', 'files.metadata.read', 'files.content.read'],
  },
  {
    key: 'github', name: 'GitHub', category: 'Developer', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'GITHUB', oauthAuthUrl: 'https://github.com/login/oauth/authorize', oauthTokenUrl: 'https://github.com/login/oauth/access_token', probeUrl: 'https://api.github.com/user',
    scopes: [
      scope('read:user', 'Profile — Read', 'Read the authenticated GitHub profile.', 'Identity'),
      scope('user:email', 'Email — Read', 'Read the authenticated user email addresses.', 'Identity'),
      scope('user', 'User — Read/Write', 'Modify the authenticated user profile.', 'Identity'),
      scope('repo', 'Repositories — Full', 'Full access to private repositories.', 'Repositories', 'SENSITIVE'),
      scope('public_repo', 'Repositories — Public', 'Access public repositories.', 'Repositories'),
      scope('repo:status', 'Commit status', 'Access commit statuses.', 'Repositories'),
      scope('repo_deployment', 'Deployments', 'Access deployment statuses.', 'Repositories'),
      scope('repo:invite', 'Repository invitations', 'Access repository invitations.', 'Repositories'),
      scope('read:org', 'Organizations — Read', 'Read organization membership and public information.', 'Organizations'),
      scope('write:org', 'Organizations — Manage', 'Manage organization membership and teams where permitted.', 'Organizations', 'SENSITIVE'),
      scope('workflow', 'Actions workflows', 'Update GitHub Actions workflow files.', 'Actions'),
      scope('gist', 'Gists', 'Create and manage gists.', 'Gists'),
      scope('notifications', 'Notifications', 'Access notifications.', 'Account'),
      scope('delete_repo', 'Delete repositories', 'Delete repositories.', 'Repositories', 'RESTRICTED'),
    ], defaultScopes: ['read:user', 'user:email'],
  },
  {
    key: 'slack', name: 'Slack', category: 'Collaboration', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'SLACK', oauthAuthUrl: 'https://slack.com/oauth/v2/authorize', oauthTokenUrl: 'https://slack.com/api/oauth.v2.access', probeUrl: 'https://slack.com/api/auth.test',
    scopes: [
      scope('chat:write', 'Messages — Send', 'Send messages as the connected Slack app.', 'Messages'),
      scope('chat:write.public', 'Messages — Public channels', 'Send messages to public channels where the app is not a member.', 'Messages'),
      scope('channels:read', 'Channels — Read', 'Read public channel information.', 'Channels'),
      scope('channels:history', 'Channels — History', 'Read message history in public channels.', 'Channels'),
      scope('groups:read', 'Private channels — Read', 'Read private channel information.', 'Channels'),
      scope('groups:history', 'Private channels — History', 'Read message history in private channels.', 'Channels'),
      scope('users:read', 'Users — Read', 'Read Slack workspace users.', 'Users'),
      scope('users:read.email', 'Users — Email', 'Read Slack user email addresses.', 'Users'),
      scope('files:read', 'Files — Read', 'Read files shared in Slack.', 'Files'),
      scope('files:write', 'Files — Write', 'Upload files to Slack.', 'Files'),
      scope('team:read', 'Workspace — Read', 'Read workspace information.', 'Workspace'),
    ], defaultScopes: ['chat:write', 'channels:read', 'users:read'],
  },
  {
    key: 'asana', name: 'Asana', category: 'Productivity', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'ASANA', oauthAuthUrl: 'https://app.asana.com/-/oauth_authorize', oauthTokenUrl: 'https://app.asana.com/-/oauth_token', probeUrl: 'https://app.asana.com/api/1.0/users/me',
    scopes: [scope('projects:read', 'Projects — Read', 'View basic project information.', 'Projects'), scope('projects:write', 'Projects — Write', 'Create and modify projects.', 'Projects'), scope('tasks:read', 'Tasks — Read', 'View task information.', 'Tasks'), scope('tasks:write', 'Tasks — Write', 'Create or modify tasks.', 'Tasks'), scope('tasks:delete', 'Tasks — Delete', 'Delete tasks.', 'Tasks', 'SENSITIVE'), scope('users:read', 'Users — Read', 'Read user information such as email and profile picture.', 'Users')], defaultScopes: ['projects:read', 'tasks:read'],
  },
  {
    key: 'notion', name: 'Notion', category: 'Productivity', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'NOTION', oauthAuthUrl: 'https://api.notion.com/v1/oauth/authorize', oauthTokenUrl: 'https://api.notion.com/v1/oauth/token', probeUrl: 'https://api.notion.com/v1/users/me',
    scopes: [], defaultScopes: [],
  },
  {
    key: 'hubspot', name: 'HubSpot', category: 'CRM', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'HUBSPOT', oauthAuthUrl: 'https://app.hubspot.com/oauth/authorize', oauthTokenUrl: 'https://api.hubapi.com/oauth/v1/token', probeUrl: 'https://api.hubapi.com/oauth/v1/access-tokens',
    scopes: [scope('crm.objects.contacts.read', 'Contacts — Read', 'Read CRM contact records.', 'CRM Objects'), scope('crm.objects.contacts.write', 'Contacts — Write', 'Create and update CRM contact records.', 'CRM Objects'), scope('crm.objects.companies.read', 'Companies — Read', 'Read CRM company records.', 'CRM Objects'), scope('crm.objects.companies.write', 'Companies — Write', 'Create and update CRM company records.', 'CRM Objects'), scope('crm.objects.deals.read', 'Deals — Read', 'Read CRM deal records.', 'CRM Objects'), scope('crm.objects.deals.write', 'Deals — Write', 'Create and update CRM deal records.', 'CRM Objects'), scope('tickets', 'Tickets — Read/Write', 'Access HubSpot ticket data.', 'Tickets')], defaultScopes: ['crm.objects.contacts.read'],
  },
  {
    key: 'salesforce', name: 'Salesforce', category: 'CRM', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'SALESFORCE', oauthAuthUrl: 'https://login.salesforce.com/services/oauth2/authorize', oauthTokenUrl: 'https://login.salesforce.com/services/oauth2/token', probeUrl: 'https://login.salesforce.com/services/oauth2/userinfo',
    scopes: [scope('api', 'API', 'Access Salesforce APIs.'), scope('refresh_token offline_access', 'Refresh token', 'Keep the connection active for automation.')], defaultScopes: ['api', 'refresh_token offline_access'],
  },
  {
    key: 'zoom', name: 'Zoom', category: 'Collaboration', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth', 'probe'],
    oauthEnvPrefix: 'ZOOM', oauthAuthUrl: 'https://zoom.us/oauth/authorize', oauthTokenUrl: 'https://zoom.us/oauth/token', probeUrl: 'https://api.zoom.us/v2/users/me',
    scopes: [scope('user:read', 'User — Read', 'Read the connected Zoom user.', 'Users'), scope('meeting:read', 'Meetings — Read', 'Read meeting information.', 'Meetings'), scope('meeting:write', 'Meetings — Write', 'Create and update meetings.', 'Meetings'), scope('meeting:read:admin', 'Meetings — Admin Read', 'Read meetings across the account where the app is authorized.', 'Meetings', 'SENSITIVE'), scope('meeting:write:admin', 'Meetings — Admin Write', 'Create and update meetings across the account where authorized.', 'Meetings', 'SENSITIVE'), scope('user:read:admin', 'Users — Admin Read', 'Read users across the account where authorized.', 'Users', 'SENSITIVE')], defaultScopes: ['user:read', 'meeting:read'],
  },
  {
    key: 'discord', name: 'Discord', category: 'Collaboration', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth'],
    oauthEnvPrefix: 'DISCORD', oauthAuthUrl: 'https://discord.com/oauth2/authorize', oauthTokenUrl: 'https://discord.com/api/oauth2/token', probeUrl: 'https://discord.com/api/users/@me',
    scopes: [scope('identify', 'Identity', 'Read the connected Discord user.', 'Identity'), scope('email', 'Email', 'Read the connected Discord email.', 'Identity'), scope('guilds', 'Servers — Read', 'Read servers the user belongs to.', 'Servers'), scope('guilds.members.read', 'Server members — Read', 'Read server member lists where authorized.', 'Servers'), scope('connections', 'Connections', 'Read the connected Discord accounts.', 'Identity')], defaultScopes: ['identify'],
  },
  {
    key: 'mailchimp', name: 'Mailchimp', category: 'Marketing', authTypes: ['OAUTH2'], oauth: true, capabilities: ['oauth'],
    oauthEnvPrefix: 'MAILCHIMP', oauthAuthUrl: 'https://login.mailchimp.com/oauth2/authorize', oauthTokenUrl: 'https://login.mailchimp.com/oauth2/token',
    scopes: [], defaultScopes: [],
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
      scopeGroups: [...new Set(x.scopes.map((s) => s.group ?? 'General'))],
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
