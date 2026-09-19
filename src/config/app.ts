/**
 * Application Configuration
 * Centralized app-wide settings and constants
 */

export const APP_CONFIG = {
  name: 'RoutineOS',
  description: 'A comprehensive productivity platform for managing daily routines, habits, goals, and life optimization',
  version: '1.0.0',
  
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@routineos.com',
  
  features: {
    aiInsights: process.env.ENABLE_AI_INSIGHTS === 'true',
    socialFeatures: process.env.ENABLE_SOCIAL_FEATURES === 'true',
    integrations: process.env.ENABLE_INTEGRATIONS === 'true',
  },
  
  limits: {
    free: {
      habits: 20,
      goals: 10,
      projects: 3,
      routineTemplates: 3,
      categories: 10,
      tags: 20,
      dataRetentionDays: 90,
      apiRequestsPerHour: 100,
    },
    pro: {
      habits: 100,
      goals: 50,
      projects: 20,
      routineTemplates: 10,
      categories: 50,
      tags: 100,
      dataRetentionDays: 365,
      apiRequestsPerHour: 1000,
    },
    premium: {
      habits: -1, // unlimited
      goals: -1,
      projects: -1,
      routineTemplates: -1,
      categories: -1,
      tags: -1,
      dataRetentionDays: -1,
      apiRequestsPerHour: 10000,
    },
  },
  
  defaults: {
    timezone: 'UTC',
    language: 'en',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
    weekStartsOn: 1, // Monday
    theme: 'LIGHT' as const,
    
    scoring: {
      weightNonNeg: 1.0,
      weightGrowth: 0.5,
      weightBonus: 0.25,
    },
    
    sleep: {
      targetDuration: 480, // 8 hours in minutes
      targetBedtime: '22:00',
      targetWakeTime: '06:00',
    },
    
    notifications: {
      enabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    },
  },
  
  validation: {
    password: {
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: false,
    },
    
    habit: {
      nameMinLength: 1,
      nameMaxLength: 100,
      descriptionMaxLength: 500,
      targetCountMin: 1,
      targetCountMax: 1000,
      estimatedDurationMin: 1,
      estimatedDurationMax: 1440, // 24 hours
    },
    
    goal: {
      titleMinLength: 1,
      titleMaxLength: 200,
      descriptionMaxLength: 2000,
      targetValueMin: 0.01,
      targetValueMax: 1000000,
    },
    
    routine: {
      nameMinLength: 1,
      nameMaxLength: 100,
      blockTitleMinLength: 1,
      blockTitleMaxLength: 100,
      maxBlocksPerTemplate: 50,
    },
  },
  
  upload: {
    maxFileSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760'), // 10MB
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp,application/pdf').split(','),
    maxFilesPerUpload: 5,
  },
  
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED === 'true',
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
  },
  
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    updateAge: 24 * 60 * 60, // Update session every 24 hours
  },
  
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  
  analytics: {
    defaultPeriodDays: 30,
    maxPeriodDays: 365,
  },
  
  ai: {
    enabled: process.env.OPENAI_API_KEY !== undefined,
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    maxTokens: 2000,
    temperature: 0.7,
    costLimitPerUser: 10.0, // USD per month
  },
  
  backup: {
    autoExportEnabled: true,
    exportRetentionDays: 7,
    maxExportsPerUser: 5,
  },
} as const;

export type AppConfig = typeof APP_CONFIG;

// Helper function to get plan limits
export function getPlanLimits(plan: 'FREE' | 'PRO' | 'PREMIUM') {
  const planKey = plan.toLowerCase() as keyof typeof APP_CONFIG.limits;
  return APP_CONFIG.limits[planKey];
}

// Helper function to check if feature is enabled
export function isFeatureEnabled(feature: keyof typeof APP_CONFIG.features): boolean {
  return APP_CONFIG.features[feature];
}

// Helper function to validate against config
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = APP_CONFIG.validation.password;
  
  if (password.length < config.minLength) {
    errors.push(`Password must be at least ${config.minLength} characters`);
  }
  
  if (password.length > config.maxLength) {
    errors.push(`Password must be no more than ${config.maxLength} characters`);
  }
  
  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (config.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (config.requireNumber && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (config.requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}