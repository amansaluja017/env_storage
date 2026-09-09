const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo while preserving Expo's default watch folders
config.watchFolders = Array.from(
  new Set([...(config.watchFolders || []), monorepoRoot])
);

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = Array.from(
  new Set([
    ...(config.resolver.nodeModulesPaths || []),
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ])
);

// 3. Explicitly map workspace packages for Metro
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@tubo/proto': path.resolve(monorepoRoot, 'packages/proto'),
};

module.exports = config;
