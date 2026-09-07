import * as SecureStore from 'expo-secure-store';
import type { TourDefinition, TourStorage, ThemeOverride } from 'guideway';
import { shouldUseSecureStore } from '../storage/secureStorage';
import { COLORS } from '../theme';
import { TourTooltip } from './TourTooltip';

const TOUR_STORAGE_PREFIX = 'env_guideway_seen_';
const LEGACY_TOUR_STORAGE_PREFIX = 'tubo_guideway_seen_';
const memoryTourStore: Record<string, string> = {};

/**
 * Storage adapter for Guideway persistence and seen state tracking
 */
export const tourStorage: TourStorage = {
  async getItem(key: string): Promise<string | null> {
    if (shouldUseSecureStore()) {
      try {
        const val = await SecureStore.getItemAsync(key);
        if (val !== null) return val;
      } catch {
        // Fallback to memory store
      }
    }
    return memoryTourStore[key] ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (shouldUseSecureStore()) {
      try {
        await SecureStore.setItemAsync(key, value);
        return;
      } catch {
        // Fallback to memory store
      }
    }
    memoryTourStore[key] = value;
  },

  async removeItem(key: string): Promise<void> {
    if (shouldUseSecureStore()) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // Fallback to memory store
      }
    }
    delete memoryTourStore[key];
  },
};

/**
 * Check if the user has completed or seen a specific tour
 */
export async function hasSeenTour(tourId: string, userId?: string): Promise<boolean> {
  const key = `${TOUR_STORAGE_PREFIX}${userId ? `${userId}_` : ''}${tourId}`;
  const legacyKey = `${LEGACY_TOUR_STORAGE_PREFIX}${userId ? `${userId}_` : ''}${tourId}`;
  const value = (await tourStorage.getItem(key)) || (await tourStorage.getItem(legacyKey));
  return value === 'true';
}

/**
 * Mark a tour as completed / seen
 */
export async function markTourSeen(tourId: string, userId?: string): Promise<void> {
  const key = `${TOUR_STORAGE_PREFIX}${userId ? `${userId}_` : ''}${tourId}`;
  await tourStorage.setItem(key, 'true');
}

/**
 * Reset seen status for a tour (allows re-running auto-tours)
 */
export async function resetTourSeen(tourId: string, userId?: string): Promise<void> {
  const key = `${TOUR_STORAGE_PREFIX}${userId ? `${userId}_` : ''}${tourId}`;
  if (tourStorage.removeItem) {
    await tourStorage.removeItem(key);
  }
}

/**
 * Guideway Theme Configuration tailored for Env Vault's high-tech dark theme
 */
export const guidewayTheme: ThemeOverride = {
  overlayColor: 'rgba(5, 8, 15, 0.82)',
  accent: COLORS.primary,
  tooltip: {
    backgroundColor: '#111726',
    borderRadius: 14,
    textColor: COLORS.textMuted,
    titleColor: COLORS.text,
    padding: 16,
    maxWidth: 340,
  },
  labels: {
    next: 'Next',
    back: 'Back',
    skip: 'Skip Tour',
    done: 'Got it!',
  },
};

/**
 * Tour IDs
 */
export const TOUR_IDS = {
  WELCOME: 'welcome_tour',
  VAULT: 'vault_tour',
  TEAM: 'team_tour',
} as const;

/**
 * Welcome / First-Time Onboarding Tour (launched automatically after login for new users)
 */
export const WELCOME_TOUR: TourDefinition = {
  id: TOUR_IDS.WELCOME,
  steps: [
    {
      id: 'tour-brand',
      title: 'Welcome to Env Vault',
      body: 'Your encrypted secrets and environment variable manager. Keep your configurations organized and secure across all environments.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 10, padding: 8 },
    },
    {
      id: 'tour-workspaces-teams',
      title: 'Workspaces & Teams',
      body: 'Switch between your workspaces and teams anytime. Each workspace isolates configurations and team member permissions.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 12, padding: 6 },
    },
    {
      id: 'tour-tabs',
      title: 'Vault Keys & Teams View',
      body: 'Quickly toggle between managing your encrypted secrets (Vault Keys) and managing team collaborators (Team Members).',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 10, padding: 6 },
    },
    {
      id: 'tour-start-tour-btn',
      title: 'Start Tour Anytime',
      body: 'Look for this icon in the header! Tap it anytime to launch a helpful walkthrough for the screen you are currently on.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 10, padding: 8 },
    },
    {
      id: 'tour-footer-dock',
      title: 'Bottom Action Dock',
      body: 'Your core actions live at the bottom dock: Add secret keys, create folders, import .env files, or backup your vault anytime.',
      render: TourTooltip,
      placement: 'top',
      cutout: { shape: 'rounded', radius: 14, padding: 8 },
    },
    {
      id: 'tour-user-avatar',
      title: 'Profile & Security',
      body: 'Tap your avatar to access account settings, security logs, redeem voucher codes, or sign out.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'circle', padding: 6 },
    },
  ],
};

/**
 * Vault Keys Page Tour
 */
export const VAULT_TOUR: TourDefinition = {
  id: TOUR_IDS.VAULT,
  steps: [
    {
      id: 'tour-workspaces-teams',
      title: 'Workspace & Team Context',
      body: 'All environment variables and folders displayed below belong to this active workspace and team.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 12, padding: 6 },
    },
    {
      id: 'tour-env-tabs',
      title: 'Environment Switcher',
      body: 'Isolate your secrets by environment: Development, Staging, or Production. Tap any tab to filter secrets.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 10, padding: 6 },
    },
    {
      id: 'tour-search-bar',
      title: 'Filter & Search',
      body: 'Find specific folders and variables instantly by name or keyword without scrolling through long lists.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 10, padding: 6 },
    },
    {
      id: 'tour-new-folder-btn',
      title: 'Organize with Folders',
      body: 'Create folders to group related variables by microservice, application, or configuration tier.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 8, padding: 6 },
    },
    {
      id: 'tour-footer-dock',
      title: 'Quick Actions Dock',
      body: 'Your bottom dock provides one-tap access to primary secret management tools across all environments.',
      render: TourTooltip,
      placement: 'top',
      cutout: { shape: 'rounded', radius: 14, padding: 8 },
    },
    {
      id: 'tour-footer-add-key',
      title: 'Add Key',
      body: 'Encrypt and store a new environment variable. Configure key names, secret values, helpful comments, and visibility options.',
      render: TourTooltip,
      placement: 'top',
      cutout: { shape: 'rounded', radius: 12, padding: 6 },
    },
    {
      id: 'tour-footer-new-folder',
      title: 'New Folder',
      body: 'Group environment variables into dedicated folders by service, database, or API tier to prevent clutter.',
      render: TourTooltip,
      placement: 'top',
      cutout: { shape: 'rounded', radius: 12, padding: 6 },
    },
    {
      id: 'tour-footer-import-env',
      title: 'Import .env',
      body: 'Batch import environment variables! Simply paste your .env file to automatically parse and securely encrypt all keys.',
      render: TourTooltip,
      placement: 'top',
      cutout: { shape: 'rounded', radius: 12, padding: 6 },
    },
    {
      id: 'tour-footer-backup',
      title: 'Backup Vault',
      body: 'Export your encrypted environments into a secure, downloadable ZIP file for offline backups and migration.',
      render: TourTooltip,
      placement: 'top',
      cutout: { shape: 'rounded', radius: 12, padding: 6 },
    },
    {
      id: 'tour-start-tour-btn',
      title: 'Guided Help Always Available',
      body: 'Need a refresher? You can tap this Start Tour button on any screen to re-open the interactive guide.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 10, padding: 8 },
    },
  ],
};

/**
 * Team Page Tour
 */
export const TEAM_TOUR: TourDefinition = {
  id: TOUR_IDS.TEAM,
  steps: [
    {
      id: 'tour-invite-btn',
      title: 'Invite Team Members',
      body: 'Invite developers, DevOps engineers, and collaborators to this team with role-based access control.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 10, padding: 6 },
    },
    {
      id: 'tour-manage-team-btn',
      title: 'Team Settings & Roles',
      body: 'Manage team settings, rename teams, or adjust workspace permissions for team members.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 8, padding: 6 },
    },
    {
      id: 'tour-members-header',
      title: 'Team Members Roster',
      body: 'Review all active members, their assigned roles (Admin / Member), and manage pending invitations.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 8, padding: 6 },
    },
    {
      id: 'tour-tabs',
      title: 'Back to Vault Keys',
      body: 'Switch back to the Vault Keys tab anytime to inspect or modify your encrypted environment variables.',
      render: TourTooltip,
      placement: 'bottom',
      cutout: { shape: 'rounded', radius: 10, padding: 6 },
    },
  ],
};

/**
 * All Tours registered with Guideway
 */
export const ALL_TOURS: TourDefinition[] = [WELCOME_TOUR, VAULT_TOUR, TEAM_TOUR];
