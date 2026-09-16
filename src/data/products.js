export const products = [
  {
    id: 'windows-11', name: 'Windows 11', area: 'Operating system', topic: 'windows', image: '/media/real-surface.webp',
    summary: 'The client platform for personal computing, managed business devices and modern endpoint security.',
    tags: ['Desktop', 'Security', 'Business'], accent: 'azure',
    officialUrl: 'https://www.microsoft.com/windows/windows-11'
  },
  {
    id: 'microsoft-365', name: 'Microsoft 365', area: 'Productivity', topic: 'business', image: '/media/real-teams.webp',
    summary: 'Office applications, cloud storage, collaboration, administration and security services.',
    tags: ['Office', 'Cloud', 'Teams'], accent: 'violet',
    officialUrl: 'https://www.microsoft.com/microsoft-365'
  },
  {
    id: 'azure', name: 'Microsoft Azure', area: 'Cloud platform', topic: 'azure', image: '/media/real-azure.webp',
    summary: 'Compute, data, AI, containers, networking and infrastructure for applications of every scale.',
    tags: ['Cloud', 'AI', 'Infrastructure'], accent: 'cyan',
    officialUrl: 'https://azure.microsoft.com/'
  },
  {
    id: 'copilot', name: 'Microsoft Copilot', area: 'Artificial intelligence', topic: 'ai', image: '/media/real-copilot.webp',
    summary: 'A family of AI assistants and agents for personal, developer and enterprise workflows.',
    tags: ['AI', 'Agents', 'Productivity'], accent: 'spectrum',
    officialUrl: 'https://www.microsoft.com/microsoft-copilot'
  },
  {
    id: 'teams', name: 'Microsoft Teams', area: 'Communication', topic: 'business', image: '/media/real-teams.webp',
    summary: 'Meetings, chat, calls, channels and collaboration for teams and organizations.',
    tags: ['Meetings', 'Chat', 'Collaboration'], accent: 'violet',
    officialUrl: 'https://www.microsoft.com/microsoft-teams/'
  },
  {
    id: 'power-platform', name: 'Power Platform', area: 'Low-code platform', topic: 'business', image: '/media/power-platform.webp',
    summary: 'Power BI, Power Apps, Power Automate and Copilot Studio for analytics and automation.',
    tags: ['Low-code', 'Automation', 'Analytics'], accent: 'amber',
    officialUrl: 'https://www.microsoft.com/power-platform'
  },
  {
    id: 'dynamics-365', name: 'Dynamics 365', area: 'Business applications', topic: 'business', image: '/media/dynamics.webp',
    summary: 'CRM and ERP applications for sales, service, finance, supply chain and operations.',
    tags: ['CRM', 'ERP', 'Business'], accent: 'indigo',
    officialUrl: 'https://www.microsoft.com/dynamics-365'
  },
  {
    id: 'github', name: 'GitHub', area: 'Software development', topic: 'development', image: '/media/github.webp',
    summary: 'Collaborative development, Actions, Codespaces, code security and GitHub Copilot.',
    tags: ['Git', 'DevOps', 'Copilot'], accent: 'graphite',
    officialUrl: 'https://github.com/'
  },
  {
    id: 'visual-studio', name: 'Visual Studio', area: 'Developer tools', topic: 'development', image: '/media/visual-studio.webp',
    summary: 'Integrated development tools for .NET, C++, cloud development, testing and profiling.',
    tags: ['IDE', '.NET', 'Developer'], accent: 'violet',
    officialUrl: 'https://visualstudio.microsoft.com/'
  },
  {
    id: 'dotnet', name: '.NET', area: 'Developer platform', topic: 'development', image: '/media/dotnet.webp',
    summary: 'An open-source application platform for web, cloud, desktop, mobile and services.',
    tags: ['Runtime', 'C#', 'Open source'], accent: 'indigo',
    officialUrl: 'https://dotnet.microsoft.com/'
  },
  {
    id: 'sql-server', name: 'SQL Server', area: 'Data platform', topic: 'azure', image: '/media/sql-server.webp',
    summary: 'Microsoft relational database technology for transactional, analytical and hybrid workloads.',
    tags: ['Database', 'Analytics', 'Hybrid'], accent: 'red',
    officialUrl: 'https://www.microsoft.com/sql-server'
  },
  {
    id: 'fabric', name: 'Microsoft Fabric', area: 'Data and analytics', topic: 'azure', image: '/media/fabric.webp',
    summary: 'An integrated analytics platform spanning data engineering, warehousing, BI and governance.',
    tags: ['Data', 'Power BI', 'Analytics'], accent: 'amber',
    officialUrl: 'https://www.microsoft.com/microsoft-fabric'
  },
  {
    id: 'defender', name: 'Microsoft Defender', area: 'Security', topic: 'security', image: '/media/defender.webp',
    summary: 'Threat protection across identities, endpoints, cloud applications, email and infrastructure.',
    tags: ['XDR', 'Cloud', 'Endpoint'], accent: 'green',
    officialUrl: 'https://www.microsoft.com/security/business/microsoft-defender'
  },
  {
    id: 'intune', name: 'Microsoft Intune', area: 'Endpoint management', topic: 'security', image: '/media/intune.webp',
    summary: 'Cloud-based management for devices, applications, access policies and endpoint security.',
    tags: ['Endpoint', 'Management', 'Zero Trust'], accent: 'cyan',
    officialUrl: 'https://www.microsoft.com/security/business/microsoft-intune'
  },
  {
    id: 'surface', name: 'Surface', area: 'Devices', topic: 'windows', image: '/media/real-surface.webp',
    summary: 'Laptops, tablets and accessories designed around Windows and Microsoft cloud services.',
    tags: ['Hardware', 'Windows', 'Copilot+ PC'], accent: 'silver',
    officialUrl: 'https://www.microsoft.com/surface'
  },
  {
    id: 'xbox', name: 'Xbox', area: 'Gaming', topic: 'xbox', image: '/media/real-xbox.webp',
    summary: 'Consoles, PC gaming, cloud gaming and the wider Xbox studio ecosystem.',
    tags: ['Gaming', 'Console', 'Cloud'], accent: 'green',
    officialUrl: 'https://www.xbox.com/'
  },
  {
    id: 'game-pass', name: 'Xbox Game Pass', area: 'Gaming subscription', topic: 'xbox', image: '/media/game-pass.webp',
    summary: 'A rotating library of console, PC and cloud games with multiple membership tiers.',
    tags: ['Subscription', 'PC', 'Cloud'], accent: 'green',
    officialUrl: 'https://www.xbox.com/xbox-game-pass'
  },
  {
    id: 'minecraft', name: 'Minecraft', area: 'Games and community', topic: 'xbox', image: '/media/minecraft.webp',
    summary: 'A global game platform spanning survival, creation, education and community experiences.',
    tags: ['Gaming', 'Creators', 'Education'], accent: 'green',
    officialUrl: 'https://www.minecraft.net/'
  },
  {
    id: 'linkedin', name: 'LinkedIn', area: 'Professional network', topic: 'business', image: '/media/linkedin.webp',
    summary: 'Professional identity, hiring, learning, advertising and business networking services.',
    tags: ['Careers', 'Learning', 'Business'], accent: 'azure',
    officialUrl: 'https://www.linkedin.com/'
  },
  {
    id: 'bing', name: 'Microsoft Bing', area: 'Search and discovery', topic: 'ai', image: '/media/bing.webp',
    summary: 'Web search, visual discovery, maps and AI-assisted answers across Microsoft experiences.',
    tags: ['Search', 'AI', 'Discovery'], accent: 'cyan',
    officialUrl: 'https://www.bing.com/'
  }
];
