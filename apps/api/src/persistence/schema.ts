import type { Models } from "./models.js";
export type ModelName = keyof Models;
export interface ModelSchema {
  collection: string;
  fields: Record<
    string,
    { type: string; nullable: boolean; default?: unknown; updated?: boolean }
  >;
  relations: Record<
    string,
    {
      model: ModelName;
      local: string;
      foreign: string;
      owns: boolean;
      many: boolean;
    }
  >;
  indexes: { keys: Record<string, 1>; unique: boolean; partial?: string }[];
  compound: Record<string, string[]>;
}
export const schema: Record<ModelName, ModelSchema> = {
  organization: {
    collection: "Organization",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      name: {
        type: "String",
        nullable: false,
      },
      timezone: {
        type: "String",
        nullable: false,
        default: "Asia/Kolkata",
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      members: {
        model: "membership",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      contacts: {
        model: "contact",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      clients: {
        model: "client",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      providers: {
        model: "provider",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      definitions: {
        model: "productDefinition",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      opportunities: {
        model: "opportunity",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      products: {
        model: "clientProduct",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      events: {
        model: "financialEvent",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      followups: {
        model: "followUp",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      documents: {
        model: "document",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      activities: {
        model: "activity",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      notifications: {
        model: "notification",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      imports: {
        model: "importJob",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
      jobs: {
        model: "job",
        many: true,
        local: "id",
        foreign: "organizationId",
        owns: false,
      },
    },
    indexes: [],
    compound: {},
  },
  user: {
    collection: "User",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      name: {
        type: "String",
        nullable: false,
      },
      email: {
        type: "String",
        nullable: false,
      },
      passwordHash: {
        type: "String",
        nullable: false,
      },
      active: {
        type: "Boolean",
        nullable: false,
        default: true,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      memberships: {
        model: "membership",
        many: true,
        local: "id",
        foreign: "userId",
        owns: false,
      },
      resets: {
        model: "passwordReset",
        many: true,
        local: "id",
        foreign: "userId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          email: 1,
        },
        unique: true,
      },
    ],
    compound: {},
  },
  membership: {
    collection: "Membership",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      userId: {
        type: "String",
        nullable: false,
      },
      role: {
        type: "String",
        nullable: false,
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      user: {
        model: "user",
        many: false,
        local: "userId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          organizationId: 1,
          userId: 1,
        },
        unique: true,
      },
    ],
    compound: {
      organizationId_userId: ["organizationId", "userId"],
    },
  },
  passwordReset: {
    collection: "PasswordReset",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      tokenHash: {
        type: "String",
        nullable: false,
      },
      userId: {
        type: "String",
        nullable: false,
      },
      expiresAt: {
        type: "DateTime",
        nullable: false,
      },
      usedAt: {
        type: "DateTime",
        nullable: true,
      },
    },
    relations: {
      user: {
        model: "user",
        many: false,
        local: "userId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          tokenHash: 1,
        },
        unique: true,
      },
    ],
    compound: {},
  },
  contact: {
    collection: "Contact",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      name: {
        type: "String",
        nullable: false,
      },
      phone: {
        type: "String",
        nullable: false,
      },
      email: {
        type: "String",
        nullable: true,
      },
      kind: {
        type: "String",
        nullable: false,
        default: "Individual",
      },
      dob: {
        type: "DateTime",
        nullable: true,
      },
      gender: {
        type: "String",
        nullable: true,
      },
      occupation: {
        type: "String",
        nullable: true,
      },
      address: {
        type: "String",
        nullable: true,
      },
      city: {
        type: "String",
        nullable: true,
      },
      state: {
        type: "String",
        nullable: true,
      },
      version: {
        type: "Int",
        nullable: false,
        default: 1,
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      business: {
        model: "business",
        many: false,
        local: "id",
        foreign: "contactId",
        owns: false,
      },
      client: {
        model: "client",
        many: false,
        local: "id",
        foreign: "contactId",
        owns: false,
      },
      relationsFrom: {
        model: "contactRelationship",
        many: true,
        local: "id",
        foreign: "fromId",
        owns: false,
      },
      relationsTo: {
        model: "contactRelationship",
        many: true,
        local: "id",
        foreign: "toId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          organizationId: 1,
          name: 1,
        },
        unique: false,
      },
      {
        keys: {
          organizationId: 1,
          phone: 1,
        },
        unique: false,
      },
      {
        keys: {
          organizationId: 1,
          email: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  business: {
    collection: "Business",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      contactId: {
        type: "String",
        nullable: false,
      },
      registrationNumber: {
        type: "String",
        nullable: true,
      },
      industry: {
        type: "String",
        nullable: true,
      },
    },
    relations: {
      contact: {
        model: "contact",
        many: false,
        local: "contactId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          contactId: 1,
        },
        unique: true,
      },
    ],
    compound: {},
  },
  contactRelationship: {
    collection: "ContactRelationship",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      fromId: {
        type: "String",
        nullable: false,
      },
      toId: {
        type: "String",
        nullable: false,
      },
      type: {
        type: "String",
        nullable: false,
      },
    },
    relations: {
      from: {
        model: "contact",
        many: false,
        local: "fromId",
        foreign: "id",
        owns: true,
      },
      to: {
        model: "contact",
        many: false,
        local: "toId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          fromId: 1,
          toId: 1,
          type: 1,
        },
        unique: true,
      },
    ],
    compound: {
      fromId_toId_type: ["fromId", "toId", "type"],
    },
  },
  client: {
    collection: "Client",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      contactId: {
        type: "String",
        nullable: false,
      },
      isClient: {
        type: "Boolean",
        nullable: false,
        default: true,
      },
      status: {
        type: "String",
        nullable: false,
        default: "Active",
      },
      source: {
        type: "String",
        nullable: false,
        default: "Direct",
      },
      ownerId: {
        type: "String",
        nullable: false,
      },
      annualIncome: {
        type: "String",
        nullable: true,
      },
      riskProfile: {
        type: "String",
        nullable: true,
      },
      investmentInterest: {
        type: "String",
        nullable: true,
      },
      loanInterest: {
        type: "String",
        nullable: true,
      },
      preferredContact: {
        type: "String",
        nullable: true,
      },
      notesText: {
        type: "String",
        nullable: true,
      },
      onboardingJson: {
        type: "String",
        nullable: true,
      },
      version: {
        type: "Int",
        nullable: false,
        default: 1,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
      updatedAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
        updated: true,
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      contact: {
        model: "contact",
        many: false,
        local: "contactId",
        foreign: "id",
        owns: true,
      },
      opportunities: {
        model: "opportunity",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
      products: {
        model: "clientProduct",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
      events: {
        model: "financialEvent",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
      followups: {
        model: "followUp",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
      communications: {
        model: "communication",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
      documents: {
        model: "document",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
      notes: {
        model: "note",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
      tags: {
        model: "clientTag",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
      consents: {
        model: "consent",
        many: true,
        local: "id",
        foreign: "clientId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          contactId: 1,
        },
        unique: true,
      },
      {
        keys: {
          organizationId: 1,
          status: 1,
        },
        unique: false,
      },
      {
        keys: {
          organizationId: 1,
          ownerId: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  tag: {
    collection: "Tag",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      name: {
        type: "String",
        nullable: false,
      },
    },
    relations: {
      clients: {
        model: "clientTag",
        many: true,
        local: "id",
        foreign: "tagId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          name: 1,
        },
        unique: true,
      },
    ],
    compound: {},
  },
  clientTag: {
    collection: "ClientTag",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      tagId: {
        type: "String",
        nullable: false,
      },
    },
    relations: {
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
      tag: {
        model: "tag",
        many: false,
        local: "tagId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          clientId: 1,
          tagId: 1,
        },
        unique: true,
      },
    ],
    compound: {
      clientId_tagId: ["clientId", "tagId"],
    },
  },
  consent: {
    collection: "Consent",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      channel: {
        type: "String",
        nullable: false,
      },
      granted: {
        type: "Boolean",
        nullable: false,
      },
      source: {
        type: "String",
        nullable: false,
      },
      recordedAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          clientId: 1,
          channel: 1,
          recordedAt: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  provider: {
    collection: "Provider",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      name: {
        type: "String",
        nullable: false,
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      definitions: {
        model: "productDefinition",
        many: true,
        local: "id",
        foreign: "providerId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          organizationId: 1,
          name: 1,
        },
        unique: true,
      },
    ],
    compound: {
      organizationId_name: ["organizationId", "name"],
    },
  },
  productDefinition: {
    collection: "ProductDefinition",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      providerId: {
        type: "String",
        nullable: false,
      },
      name: {
        type: "String",
        nullable: false,
      },
      category: {
        type: "String",
        nullable: false,
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      provider: {
        model: "provider",
        many: false,
        local: "providerId",
        foreign: "id",
        owns: true,
      },
      products: {
        model: "clientProduct",
        many: true,
        local: "id",
        foreign: "definitionId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          organizationId: 1,
          providerId: 1,
          name: 1,
        },
        unique: true,
      },
    ],
    compound: {
      organizationId_providerId_name: ["organizationId", "providerId", "name"],
    },
  },
  clientProduct: {
    collection: "ClientProduct",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      definitionId: {
        type: "String",
        nullable: false,
      },
      opportunityId: {
        type: "String",
        nullable: true,
      },
      identifier: {
        type: "String",
        nullable: false,
      },
      status: {
        type: "String",
        nullable: false,
        default: "Application",
      },
      currency: {
        type: "String",
        nullable: false,
        default: "INR",
      },
      premiumMinor: {
        type: "BigInt",
        nullable: true,
      },
      principalMinor: {
        type: "BigInt",
        nullable: true,
      },
      expectedCommissionMinor: {
        type: "BigInt",
        nullable: false,
        default: 0,
      },
      insuranceDetails: {
        type: "Json",
        nullable: true,
      },
      loanDetails: {
        type: "Json",
        nullable: true,
      },
      investmentDetails: {
        type: "Json",
        nullable: true,
      },
      startDate: {
        type: "DateTime",
        nullable: false,
      },
      version: {
        type: "Int",
        nullable: false,
        default: 1,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
      definition: {
        model: "productDefinition",
        many: false,
        local: "definitionId",
        foreign: "id",
        owns: true,
      },
      opportunity: {
        model: "opportunity",
        many: false,
        local: "opportunityId",
        foreign: "id",
        owns: true,
      },
      events: {
        model: "financialEvent",
        many: true,
        local: "id",
        foreign: "productId",
        owns: false,
      },
      followups: {
        model: "followUp",
        many: true,
        local: "id",
        foreign: "productId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          opportunityId: 1,
        },
        unique: true,
        partial: "opportunityId",
      },
      {
        keys: {
          organizationId: 1,
          identifier: 1,
        },
        unique: true,
      },
      {
        keys: {
          organizationId: 1,
          clientId: 1,
        },
        unique: false,
      },
    ],
    compound: {
      organizationId_identifier: ["organizationId", "identifier"],
    },
  },
  opportunity: {
    collection: "Opportunity",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      requirement: {
        type: "String",
        nullable: false,
      },
      stage: {
        type: "String",
        nullable: false,
        default: "New Enquiries",
      },
      ownerId: {
        type: "String",
        nullable: false,
      },
      priority: {
        type: "String",
        nullable: false,
        default: "Normal",
      },
      source: {
        type: "String",
        nullable: false,
        default: "Referral",
      },
      notes: {
        type: "String",
        nullable: true,
      },
      nextAction: {
        type: "String",
        nullable: false,
      },
      nextFollowUp: {
        type: "DateTime",
        nullable: true,
      },
      lostReason: {
        type: "String",
        nullable: true,
      },
      version: {
        type: "Int",
        nullable: false,
        default: 1,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
      updatedAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
        updated: true,
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
      history: {
        model: "opportunityStageHistory",
        many: true,
        local: "id",
        foreign: "opportunityId",
        owns: false,
      },
      product: {
        model: "clientProduct",
        many: false,
        local: "id",
        foreign: "opportunityId",
        owns: false,
      },
      followups: {
        model: "followUp",
        many: true,
        local: "id",
        foreign: "opportunityId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          organizationId: 1,
          stage: 1,
        },
        unique: false,
      },
      {
        keys: {
          organizationId: 1,
          createdAt: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  opportunityStageHistory: {
    collection: "OpportunityStageHistory",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      opportunityId: {
        type: "String",
        nullable: false,
      },
      fromStage: {
        type: "String",
        nullable: true,
      },
      toStage: {
        type: "String",
        nullable: false,
      },
      reason: {
        type: "String",
        nullable: true,
      },
      actorId: {
        type: "String",
        nullable: false,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      opportunity: {
        model: "opportunity",
        many: false,
        local: "opportunityId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [],
    compound: {},
  },
  financialEvent: {
    collection: "FinancialEvent",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      productId: {
        type: "String",
        nullable: false,
      },
      type: {
        type: "String",
        nullable: false,
      },
      dueDate: {
        type: "DateTime",
        nullable: false,
      },
      amountMinor: {
        type: "BigInt",
        nullable: false,
      },
      amountMeaning: {
        type: "String",
        nullable: false,
      },
      currency: {
        type: "String",
        nullable: false,
        default: "INR",
      },
      status: {
        type: "String",
        nullable: false,
        default: "Pending",
      },
      recurrenceMonths: {
        type: "Int",
        nullable: true,
      },
      version: {
        type: "Int",
        nullable: false,
        default: 1,
      },
      completedAt: {
        type: "DateTime",
        nullable: true,
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
      product: {
        model: "clientProduct",
        many: false,
        local: "productId",
        foreign: "id",
        owns: true,
      },
      payments: {
        model: "payment",
        many: true,
        local: "id",
        foreign: "eventId",
        owns: false,
      },
      followups: {
        model: "followUp",
        many: true,
        local: "id",
        foreign: "eventId",
        owns: false,
      },
    },
    indexes: [
      {
        keys: {
          productId: 1,
          type: 1,
          dueDate: 1,
        },
        unique: true,
      },
      {
        keys: {
          organizationId: 1,
          dueDate: 1,
          status: 1,
        },
        unique: false,
      },
      {
        keys: {
          organizationId: 1,
          status: 1,
          dueDate: 1,
        },
        unique: false,
      },
    ],
    compound: {
      productId_type_dueDate: ["productId", "type", "dueDate"],
    },
  },
  payment: {
    collection: "Payment",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      eventId: {
        type: "String",
        nullable: false,
      },
      amountMinor: {
        type: "BigInt",
        nullable: false,
      },
      reference: {
        type: "String",
        nullable: false,
      },
      recordedBy: {
        type: "String",
        nullable: false,
      },
      recordedAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      event: {
        model: "financialEvent",
        many: false,
        local: "eventId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          eventId: 1,
          reference: 1,
        },
        unique: true,
      },
    ],
    compound: {
      eventId_reference: ["eventId", "reference"],
    },
  },
  followUp: {
    collection: "FollowUp",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      opportunityId: {
        type: "String",
        nullable: true,
      },
      productId: {
        type: "String",
        nullable: true,
      },
      eventId: {
        type: "String",
        nullable: true,
      },
      ownerId: {
        type: "String",
        nullable: false,
      },
      channel: {
        type: "String",
        nullable: false,
      },
      dueAt: {
        type: "DateTime",
        nullable: false,
      },
      priority: {
        type: "String",
        nullable: false,
        default: "Normal",
      },
      notes: {
        type: "String",
        nullable: false,
      },
      state: {
        type: "String",
        nullable: false,
        default: "pending",
      },
      outcome: {
        type: "String",
        nullable: true,
      },
      completedAt: {
        type: "DateTime",
        nullable: true,
      },
      version: {
        type: "Int",
        nullable: false,
        default: 1,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
      opportunity: {
        model: "opportunity",
        many: false,
        local: "opportunityId",
        foreign: "id",
        owns: true,
      },
      product: {
        model: "clientProduct",
        many: false,
        local: "productId",
        foreign: "id",
        owns: true,
      },
      event: {
        model: "financialEvent",
        many: false,
        local: "eventId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          organizationId: 1,
          state: 1,
          dueAt: 1,
        },
        unique: false,
      },
      {
        keys: {
          organizationId: 1,
          dueAt: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  communication: {
    collection: "Communication",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      channel: {
        type: "String",
        nullable: false,
      },
      event: {
        type: "String",
        nullable: false,
      },
      body: {
        type: "String",
        nullable: true,
      },
      providerId: {
        type: "String",
        nullable: true,
      },
      actorId: {
        type: "String",
        nullable: false,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          clientId: 1,
          createdAt: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  document: {
    collection: "Document",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      name: {
        type: "String",
        nullable: false,
      },
      key: {
        type: "String",
        nullable: false,
      },
      contentType: {
        type: "String",
        nullable: false,
      },
      purpose: {
        type: "String",
        nullable: false,
        default: "Document",
      },
      size: {
        type: "Int",
        nullable: false,
      },
      status: {
        type: "String",
        nullable: false,
        default: "Quarantined",
      },
      uploadedBy: {
        type: "String",
        nullable: false,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          key: 1,
        },
        unique: true,
      },
      {
        keys: {
          organizationId: 1,
          clientId: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  note: {
    collection: "Note",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      clientId: {
        type: "String",
        nullable: false,
      },
      body: {
        type: "String",
        nullable: false,
      },
      authorId: {
        type: "String",
        nullable: false,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      client: {
        model: "client",
        many: false,
        local: "clientId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [],
    compound: {},
  },
  notification: {
    collection: "Notification",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      userId: {
        type: "String",
        nullable: false,
      },
      title: {
        type: "String",
        nullable: false,
      },
      link: {
        type: "String",
        nullable: false,
      },
      readAt: {
        type: "DateTime",
        nullable: true,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          organizationId: 1,
          userId: 1,
          readAt: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  activity: {
    collection: "Activity",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      actorId: {
        type: "String",
        nullable: false,
      },
      action: {
        type: "String",
        nullable: false,
      },
      entityType: {
        type: "String",
        nullable: false,
      },
      entityId: {
        type: "String",
        nullable: false,
      },
      summary: {
        type: "String",
        nullable: false,
      },
      requestId: {
        type: "String",
        nullable: true,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          organizationId: 1,
          createdAt: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
  importJob: {
    collection: "ImportJob",
    fields: {
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      actorId: {
        type: "String",
        nullable: false,
      },
      rows: {
        type: "Json",
        nullable: false,
      },
      result: {
        type: "Json",
        nullable: true,
      },
      state: {
        type: "String",
        nullable: false,
        default: "Preview",
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [],
    compound: {},
  },
  job: {
    collection: "Job",
    fields: {
      leaseToken: { type: "String", nullable: true },
      id: {
        type: "String",
        nullable: false,
        default: "uuid",
      },
      organizationId: {
        type: "String",
        nullable: false,
      },
      key: {
        type: "String",
        nullable: false,
      },
      type: {
        type: "String",
        nullable: false,
      },
      payload: {
        type: "Json",
        nullable: false,
      },
      runAt: {
        type: "DateTime",
        nullable: false,
      },
      state: {
        type: "String",
        nullable: false,
        default: "pending",
      },
      attempts: {
        type: "Int",
        nullable: false,
        default: 0,
      },
      lockedAt: {
        type: "DateTime",
        nullable: true,
      },
      lastError: {
        type: "String",
        nullable: true,
      },
      createdAt: {
        type: "DateTime",
        nullable: false,
        default: "now",
      },
    },
    relations: {
      organization: {
        model: "organization",
        many: false,
        local: "organizationId",
        foreign: "id",
        owns: true,
      },
    },
    indexes: [
      {
        keys: {
          key: 1,
        },
        unique: true,
      },
      {
        keys: {
          state: 1,
          runAt: 1,
        },
        unique: false,
      },
    ],
    compound: {},
  },
};
