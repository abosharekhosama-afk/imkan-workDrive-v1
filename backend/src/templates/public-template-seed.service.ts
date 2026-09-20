import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { TemplateLibraryType, TemplateStatus, TemplateType } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { access } from 'node:fs/promises';

const PUBLIC_TEMPLATES = [
  ['business-proposal', 'Business Proposal', 'Business', 'Professional proposal structure with executive summary, scope, deliverables, timeline, and commercial terms.'],
  ['company-profile', 'Company Profile', 'Business', 'Company overview covering mission, services, capabilities, leadership, and contact details.'],
  ['project-plan', 'Project Plan', 'Projects', 'Project planning document with objectives, milestones, owners, risks, dependencies, and status.'],
  ['project-status-report', 'Project Status Report', 'Projects', 'Recurring status report with achievements, blockers, risks, next steps, and metrics.'],
  ['meeting-notes', 'Meeting Notes', 'Meetings', 'Structured meeting notes with attendees, agenda, decisions, action items, and follow-ups.'],
  ['meeting-agenda', 'Meeting Agenda', 'Meetings', 'Clear meeting agenda with objectives, discussion topics, owners, and time allocation.'],
  ['business-report', 'Business Report', 'Business', 'General business report format with summary, findings, analysis, recommendations, and appendix.'],
  ['annual-report', 'Annual Report', 'Business', 'Annual review structure for highlights, performance, financial overview, initiatives, and outlook.'],
  ['marketing-plan', 'Marketing Plan', 'Marketing', 'Marketing strategy covering goals, audience, positioning, channels, campaigns, and KPIs.'],
  ['campaign-brief', 'Campaign Brief', 'Marketing', 'Campaign brief with objective, audience, message, creative direction, channels, budget, and timeline.'],
  ['content-calendar', 'Content Calendar', 'Marketing', 'Editorial planning document for themes, channels, publishing dates, owners, and status.'],
  ['newsletter', 'Newsletter', 'Marketing', 'Newsletter structure for announcements, updates, featured content, and calls to action.'],
  ['social-media-plan', 'Social Media Plan', 'Marketing', 'Social strategy with platforms, audiences, content pillars, cadence, and measurement.'],
  ['sales-proposal', 'Sales Proposal', 'Sales', 'Sales proposal with customer needs, solution, benefits, implementation, pricing, and next steps.'],
  ['sales-plan', 'Sales Plan', 'Sales', 'Sales planning template for targets, territories, pipeline strategy, activities, and KPIs.'],
  ['customer-success-plan', 'Customer Success Plan', 'Sales', 'Customer success plan with objectives, stakeholders, milestones, risks, and review cadence.'],
  ['hr-policy', 'HR Policy', 'Human Resources', 'Policy structure with purpose, scope, responsibilities, rules, exceptions, and approval.'],
  ['employee-handbook', 'Employee Handbook', 'Human Resources', 'Employee handbook structure for workplace expectations, benefits, conduct, leave, and procedures.'],
  ['job-description', 'Job Description', 'Human Resources', 'Job description covering role summary, responsibilities, qualifications, and success measures.'],
  ['performance-review', 'Performance Review', 'Human Resources', 'Performance review with achievements, competencies, goals, and development.'],
  ['onboarding-plan', 'Employee Onboarding Plan', 'Human Resources', 'New hire onboarding plan with preboarding, first week, training, stakeholders, and milestones.'],
  ['interview-scorecard', 'Interview Scorecard', 'Human Resources', 'Structured interview scorecard with competencies, questions, evidence, and notes.'],
  ['finance-report', 'Finance Report', 'Finance', 'Financial report structure for revenue, expenses, variance analysis, cash flow, and commentary.'],
  ['budget-request', 'Budget Request', 'Finance', 'Budget request with business case, assumptions, cost breakdown, benefits, and approval.'],
  ['invoice-cover-letter', 'Invoice Cover Letter', 'Finance', 'Professional invoice cover note with billing summary, payment terms, and contact information.'],
  ['expense-policy', 'Expense Policy', 'Finance', 'Expense policy covering eligible expenses, limits, approvals, receipts, and reimbursement.'],
  ['procurement-request', 'Procurement Request', 'Operations', 'Purchase request with requirements, justification, vendor options, budget, and approval.'],
  ['risk-register', 'Risk Register', 'Operations', 'Risk management document with impact, likelihood, mitigation, owner, and status.'],
  ['business-continuity-plan', 'Business Continuity Plan', 'Operations', 'Continuity planning for critical services, recovery priorities, contacts, and procedures.'],
  ['incident-report', 'Incident Report', 'Operations', 'Incident documentation with timeline, impact, root cause, corrective actions, and lessons learned.'],
  ['standard-operating-procedure', 'Standard Operating Procedure', 'Operations', 'SOP with purpose, scope, prerequisites, procedure, controls, and records.'],
  ['project-charter', 'Project Charter', 'Projects', 'Project charter covering business case, objectives, scope, stakeholders, governance, and success criteria.'],
  ['requirements-document', 'Product Requirements Document', 'Product', 'Requirements document with problem statement, users, requirements, constraints, and acceptance criteria.'],
  ['product-launch-plan', 'Product Launch Plan', 'Product', 'Launch plan covering positioning, readiness, channels, owners, milestones, and launch metrics.'],
  ['technical-design-document', 'Technical Design Document', 'Technology', 'Technical design structure for architecture, components, data flows, security, and operations.'],
  ['change-request', 'Change Request', 'Technology', 'Controlled change request with reason, impact, implementation, rollback, and approvals.'],
  ['training-plan', 'Training Plan', 'Education', 'Training program plan with audience, learning objectives, modules, schedule, trainers, and evaluation.'],
  ['event-plan', 'Event Plan', 'Events', 'Event planning document for objectives, program, logistics, vendors, staffing, budget, and contingency.'],
  ['press-release', 'Press Release', 'Communications', 'Press release format with headline, announcement, quotes, company boilerplate, and media contact.'],
  ['partnership-proposal', 'Partnership Proposal', 'Business', 'Partnership proposal covering shared objectives, value exchange, responsibilities, milestones, and terms.'],
] as const;

@Injectable()
export class PublicTemplateSeedService implements OnModuleInit {
  private readonly logger = new Logger(PublicTemplateSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSeed();
    } catch (error) {
      this.logger.error(`Public template catalog seed failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async ensureSeed(): Promise<void> {
    try {
      await this.seed();
    } catch (error) {
      this.logger.error(`Public template catalog seed failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async seed(): Promise<void> {
    const creator = await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!creator) {
      this.logger.warn('Skipping public template catalog seed because no user exists yet.');
      return;
    }

    let library = await this.prisma.templateLibrary.findFirst({ where: { orgId: null, ownerId: null, type: TemplateLibraryType.PUBLIC } });
    if (!library) {
      library = await this.prisma.templateLibrary.create({ data: { orgId: null, ownerId: null, type: TemplateLibraryType.PUBLIC, name: 'Public Templates' } });
    }

    const candidates = [join(__dirname, 'public-assets'), join(process.cwd(), 'dist/src/templates/public-assets'), join(process.cwd(), 'src/templates/public-assets')];
    let assetRoot = candidates[0];
    for (const candidate of candidates) { try { await access(candidate); assetRoot = candidate; break; } catch {} }
    let created = 0;
    for (const [slug, name, category, description] of PUBLIC_TEMPLATES) {
      const existing = await this.prisma.template.findFirst({ where: { libraryId: library.id, name, status: { not: TemplateStatus.TRASHED } }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
      if (existing?.versions[0]) continue;

      const templateId = existing?.id ?? randomUUID();
      const versionId = randomUUID();
      const bytes = await readFile(join(assetRoot, `${slug}.docx`));
      const sha256Hash = createHash('sha256').update(bytes).digest('hex');
      const storageKey = this.storage.buildPublicTemplateObjectKey(templateId, versionId);
      await this.storage.storeObject({ fileId: templateId, versionId, ownerOrgId: creator.id, storageKey, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', publicAccess: true }, bytes);

      await this.prisma.$transaction(async (tx) => {
        const template = existing
          ? await tx.template.update({ where: { id: templateId }, data: { status: TemplateStatus.ACTIVE, deletedAt: null, description, type: TemplateType.DOCUMENT, ownerId: null, orgId: null } })
          : await tx.template.create({ data: { id: templateId, orgId: null, libraryId: library!.id, ownerId: null, name, description, type: TemplateType.DOCUMENT, status: TemplateStatus.ACTIVE } });
        await tx.templateVersion.create({ data: { id: versionId, templateId: template.id, versionNumber: 1, storageKey, size: BigInt(bytes.length), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx', sha256Hash, createdById: creator.id } });
      });
      created += 1;
    }
    this.logger.log(`Public template catalog ready: ${PUBLIC_TEMPLATES.length} templates (${created} created).`);
  }
}
