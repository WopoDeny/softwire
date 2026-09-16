export const topics = [
  {
    slug: 'windows', name: 'Windows', eyebrow: 'PC and devices', category: 'Windows', query: 'Windows', image: '/media/real-surface.webp',
    description: 'Windows releases, Surface devices, Edge, Copilot+ PCs and the wider client platform.',
    teaser: 'PC releases, devices and the client platform.',
    productIds: ['windows-11', 'surface']
  },
  {
    slug: 'azure', name: 'Azure', eyebrow: 'Cloud and data', category: 'Azure', query: 'Azure', image: '/media/real-azure.webp',
    description: 'Cloud infrastructure, AI services, data platforms, developer tooling and service updates.',
    teaser: 'Cloud services, data platforms and infrastructure.',
    productIds: ['azure', 'fabric', 'sql-server']
  },
  {
    slug: 'xbox', name: 'Xbox', eyebrow: 'Games and players', category: 'Xbox', query: 'Xbox', image: '/media/real-xbox.webp',
    description: 'Xbox consoles, PC gaming, Game Pass, cloud gaming, studios and player-focused releases.',
    teaser: 'Games, studios, Game Pass and player updates.',
    productIds: ['xbox', 'game-pass', 'minecraft']
  },
  {
    slug: 'ai', name: 'AI & Copilot', eyebrow: 'Agents and models', category: '', query: 'Copilot', image: '/media/real-copilot.webp',
    description: 'Copilot experiences, AI agents, research, Azure AI and new intelligent workflows.',
    teaser: 'Copilot, agents, models and applied research.',
    productIds: ['copilot', 'bing']
  },
  {
    slug: 'security', name: 'Security', eyebrow: 'Protection and trust', category: 'Security', query: 'Security', image: '/media/defender.webp',
    description: 'Threat intelligence, Defender, identity, vulnerabilities, platform security and response guidance.',
    teaser: 'Threat research, identity and platform defence.',
    productIds: ['defender', 'intune']
  },
  {
    slug: 'development', name: 'Developers', eyebrow: 'Code and platforms', category: 'Development', query: 'Developer', image: '/media/github.webp',
    description: 'GitHub, Visual Studio, .NET, PowerShell, SDKs and engineering releases.',
    teaser: 'GitHub, .NET, Visual Studio and engineering.',
    productIds: ['github', 'visual-studio', 'dotnet']
  },
  {
    slug: 'business', name: 'Business', eyebrow: 'Work and productivity', category: 'Microsoft 365', query: 'Microsoft 365', image: '/media/real-teams.webp',
    description: 'Microsoft 365, Teams, Dynamics, Power Platform, LinkedIn and modern work.',
    teaser: 'Modern work, collaboration and business apps.',
    productIds: ['microsoft-365', 'teams', 'power-platform', 'dynamics-365', 'linkedin']
  }
];

const imagePools = {
  xbox: ['/media/real-xbox.webp', '/media/game-pass.webp', '/media/minecraft.webp', '/media/xbox.webp'],
  azure: ['/media/real-azure.webp', '/media/fabric.webp', '/media/sql-server.webp', '/media/data.webp', '/media/azure.webp'],
  security: ['/media/security.webp', '/media/defender.webp', '/media/intune.webp'],
  development: ['/media/development.webp', '/media/github.webp', '/media/visual-studio.webp', '/media/dotnet.webp'],
  business: ['/media/real-teams.webp', '/media/microsoft-365.webp', '/media/teams.webp', '/media/dynamics.webp', '/media/power-platform.webp', '/media/linkedin.webp'],
  ai: ['/media/real-copilot.webp', '/media/copilot.webp', '/media/ai.webp', '/media/bing.webp'],
  windows: ['/media/real-surface.webp', '/media/windows.webp', '/media/surface.webp']
};

export function getTopic(slug) {
  return topics.find((topic) => topic.slug === slug);
}

function poolForCategory(category = '') {
  const key = category.toLowerCase();
  if (key.includes('xbox') || key.includes('gaming')) return imagePools.xbox;
  if (key.includes('azure') || key.includes('data') || key.includes('cloud')) return imagePools.azure;
  if (key.includes('security')) return imagePools.security;
  if (key.includes('development') || key.includes('github') || key.includes('developer')) return imagePools.development;
  if (key.includes('365') || key.includes('business') || key.includes('company')) return imagePools.business;
  if (key.includes('ai') || key.includes('research') || key.includes('copilot')) return imagePools.ai;
  return imagePools.windows;
}

function stableIndex(seed = '', length = 1) {
  const value = String(seed || 'default');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % length;
}

export function topicImageForCategory(category = '', seed = '') {
  const pool = poolForCategory(category);
  return pool[stableIndex(seed || category, pool.length)];
}
