/**
 * dsh-mcp-global-manager — 源注册表。
 *
 * 一台机器上的 MCP 配置散落在十几个工具的十几个文件里，路径、容器键、语法各不相同。
 * 这张表就是「去哪儿找、按什么方言读、能不能写回去」的唯一清单。路径里的 `~` 与
 * `%APPDATA%` 由 util.expandPath 展开；同一条目列多个候选，谁存在用谁（顺带全扫，
 * 便于发现「同一个工具在项目里还有一份」这种情况）。
 *
 * 内置清单来自各家官方文档与多机实测：同一条目把 Windows（%APPDATA% /
 * %LOCALAPPDATA%）、macOS（~/Library/Application Support）、Linux（~/.config）的
 * 候选路径都列上，不存在就跳过，零成本；哪台机器装了哪些工具，扫描时自然见分晓。
 * 用户也可以在面板里手工补源（存进 state.json）。
 *
 * @module dsh-mcp-global-manager/sources
 */

/** @typedef {{ id:string, label:string, format:'json'|'toml'|'opencode'|'dsh', containerHint?:string, dialect?:string, writeBack:boolean, paths:string[], note?:string }} Source */

/**
 * 内置源。`writeBack:false` 的条目只读不写（格式没把握或写了也不生效的工具）。
 * @type {Source[]}
 */
export const BUILTIN_SOURCES = [
  {
    id: 'dsh',
    label: 'DeepSeek Harness',
    format: 'dsh',
    dialect: 'dsh',
    writeBack: true,
    paths: ['~/.dsh/profiles/desktop/cordis.patch.yml', '~/.dsh/profiles/web/cordis.patch.yml'],
    note: 'DSH 的真相在这里（loader 补丁行）',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: ['~/.claude.json', '~/.claude/mcp.json'],
    note: '全局配置在 ~/.claude.json 里的一小段',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '%APPDATA%/Claude/claude_desktop_config.json',
      '%APPDATA%/Claude-3p/claude_desktop_config.json',
      '~/Library/Application Support/Claude/claude_desktop_config.json',
    ],
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    format: 'toml',
    containerHint: 'mcp_servers',
    dialect: 'codex',
    writeBack: true,
    paths: ['~/.codex/config.toml'],
    note: 'TOML：[mcp_servers.名字]',
  },
  {
    id: 'vscode',
    label: 'VS Code',
    format: 'json',
    containerHint: 'servers',
    dialect: 'vscode',
    writeBack: true,
    paths: [
      '%APPDATA%/Code/User/mcp.json',
      '%APPDATA%/Code - Insiders/User/mcp.json',
      '%LOCALAPPDATA%/Programs/Microsoft VS Code/resources/app/mcp/package.json',
      '~/Library/Application Support/Code/User/mcp.json',
      '~/Library/Application Support/Code - Insiders/User/mcp.json',
      '~/.config/Code/User/mcp.json',
      '~/.config/Code - Insiders/User/mcp.json',
    ],
    note: '注意容器键是 servers，且带 ${VAR} 占位符',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: ['~/.copilot/mcp-config.json', '~/.copilot/mcp.json'],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '~/.cursor/mcp.json',
      '%APPDATA%/Cursor/User/globalStorage/cursor.mcp/mcp.json',
      '~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/mcp.json',
      '~/.config/Cursor/User/globalStorage/cursor.mcp/mcp.json',
    ],
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'windsurf',
    writeBack: true,
    paths: ['~/.codeium/windsurf/mcp_config.json'],
    note: '远程用 serverUrl',
  },
  {
    id: 'trae-cn',
    label: 'Trae CN',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '%APPDATA%/Trae CN/User/mcp.json',
      '~/Library/Application Support/Trae CN/User/mcp.json',
      '~/.config/Trae CN/User/mcp.json',
    ],
    note: '里面常存明文 token，展示时已掩码，写回前务必确认',
  },
  {
    id: 'trae',
    label: 'Trae',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '%APPDATA%/Trae/User/mcp.json',
      '%APPDATA%/Trae International/User/mcp.json',
      '~/Library/Application Support/Trae/User/mcp.json',
      '~/Library/Application Support/Trae International/User/mcp.json',
      '~/.config/Trae/User/mcp.json',
      '~/.config/Trae International/User/mcp.json',
    ],
  },
  {
    id: 'kiro',
    label: 'Kiro',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: ['~/.kiro/settings/mcp.json'],
  },
  {
    id: 'marscode',
    label: 'MarsCode',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: ['~/.marscode/vscode.mcp.config.json'],
  },
  {
    id: 'lingma',
    label: '通义灵码',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: false,
    paths: ['~/.lingma/vscode/sharedClientCache/lingma_mcp.json'],
    note: '缓存文件，写回去可能被覆盖，默认只读',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    format: 'opencode',
    containerHint: 'mcp',
    dialect: 'opencode',
    writeBack: true,
    paths: ['~/.config/opencode/opencode.json', '~/.opencode.json'],
    note: 'command 是数组，type 为 local/remote',
  },
  {
    id: 'oplus-connect',
    label: 'O+ Connect',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: ['%APPDATA%/O+Connect/generic-agent/mcp_default.json'],
    note: '命令是相对路径，只在它自己的目录下有效',
  },
  {
    id: 'qoder',
    label: 'Qoder',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '~/.qoder/mcp.json',
      '%APPDATA%/Qoder/User/mcp.json',
      '%APPDATA%/Qoder/User/globalStorage/mcp.json',
      '~/Library/Application Support/Qoder/User/mcp.json',
      '~/.config/Qoder/User/mcp.json',
    ],
  },
  {
    id: 'codebuddy',
    label: 'CodeBuddy',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '~/.codebuddy/mcp.json',
      '%APPDATA%/CodeBuddy/User/mcp.json',
      '~/Library/Application Support/CodeBuddy/User/mcp.json',
      '~/.config/CodeBuddy/User/mcp.json',
    ],
  },
  {
    id: 'cherry-studio',
    label: 'Cherry Studio',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: false,
    paths: [
      '%APPDATA%/CherryStudio/Data/mcp.json',
      '%APPDATA%/Cherry Studio/data/mcp.json',
      '~/Library/Application Support/CherryStudio/Data/mcp.json',
      '~/.config/CherryStudio/Data/mcp.json',
    ],
    note: '自带注册表与开关，写回去可能被它重写，默认只读',
  },
  {
    id: 'cline',
    label: 'Cline',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
      '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
      '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
    ],
  },
  {
    id: 'roo-code',
    label: 'Roo Code',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '%APPDATA%/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
      '~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
      '~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
      '~/Documents/RooCode/mcp_settings.json',
    ],
  },
  {
    id: 'kilo-code',
    label: 'Kilo Code',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: [
      '%APPDATA%/Code/User/globalStorage/kilocode.kilo-code/settings/mcp.json',
      '~/Library/Application Support/Code/User/globalStorage/kilocode.kilo-code/settings/mcp.json',
      '~/.config/Code/User/globalStorage/kilocode.kilo-code/settings/mcp.json',
    ],
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: true,
    paths: ['~/.gemini/settings.json', '~/.gemini/mcp_config.json'],
  },
  {
    id: 'zed',
    label: 'Zed',
    format: 'json',
    containerHint: 'context_servers',
    dialect: 'zed',
    writeBack: false,
    paths: ['%APPDATA%/Zed/settings.json', '~/.config/zed/settings.json'],
    note: '容器键是 context_servers，默认只读',
  },
  {
    id: 'warp',
    label: 'Warp',
    format: 'json',
    containerHint: 'mcp_servers',
    dialect: 'claude',
    writeBack: false,
    paths: ['~/.warp/mcp/config.json'],
  },
  {
    id: 'continue',
    label: 'Continue',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: false,
    paths: ['~/.continue/mcp.json', '~/.continue/config.json'],
  },
  {
    id: 'goose',
    label: 'Goose',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: false,
    paths: ['~/.config/goose/mcp.yaml'],
  },
  {
    id: 'fastmcp',
    label: 'FastMCP Hub',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: false,
    paths: ['~/.fastmcp/registry.json'],
  },
  {
    id: 'mcporter',
    label: 'mcporter',
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    writeBack: false,
    paths: ['~/.mcporter/config.json'],
  },
];

/** 按 id 取内置源。 */
export function builtinById(id) {
  return BUILTIN_SOURCES.find((source) => source.id === id) ?? null;
}

/**
 * 内置 + 自定义合并后的完整清单；同 id 以自定义为准（可覆盖路径与读写开关）。
 * @param {Source[]} custom
 */
export function mergedSources(custom = []) {
  const map = new Map();
  for (const source of BUILTIN_SOURCES) map.set(source.id, { ...source, builtin: true });
  for (const source of custom) {
    if (typeof source?.id !== 'string' || source.id === '') continue;
    map.set(source.id, { ...map.get(source.id), ...source, builtin: false, custom: true });
  }
  return [...map.values()];
}
