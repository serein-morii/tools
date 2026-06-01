const STORAGE_KEY = "sonar_templates";

export interface SonarTemplate {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: number;
}

const DEFAULT_CONTENT = `请根据 Sonar 覆盖率报告，为以下 Java 类补充单元测试。

{file_list}

要求：
- JUnit5 + Mockito
- 不允许修改业务代码
- 覆盖正常 / 异常 / 边界
- 行覆盖率 ≥ 90%
- 分支覆盖率 ≥ 90%

重点：不要只按行号写测试，要分析完整逻辑路径。
`;

const BUILT_IN_TEMPLATE: SonarTemplate = {
  id: "built-in",
  name: "默认模板",
  content: DEFAULT_CONTENT,
  isDefault: true,
  createdAt: 0,
};

export function getTemplates(): SonarTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // 首次使用，写入内置模板
      localStorage.setItem(STORAGE_KEY, JSON.stringify([BUILT_IN_TEMPLATE]));
      return [BUILT_IN_TEMPLATE];
    }
    return JSON.parse(raw) as SonarTemplate[];
  } catch {
    return [BUILT_IN_TEMPLATE];
  }
}

function saveAll(templates: SonarTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function saveTemplate(
  data: Omit<SonarTemplate, "id" | "createdAt">
): SonarTemplate {
  const templates = getTemplates();
  const tpl: SonarTemplate = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  templates.push(tpl);
  saveAll(templates);
  return tpl;
}

export function updateTemplate(
  id: string,
  updates: Partial<Pick<SonarTemplate, "name" | "content">>
): void {
  const templates = getTemplates();
  const idx = templates.findIndex((t) => t.id === id);
  if (idx === -1) return;
  templates[idx] = { ...templates[idx], ...updates };
  saveAll(templates);
}

export function deleteTemplate(id: string): SonarTemplate[] {
  const templates = getTemplates().filter((t) => t.id !== id);
  // 如果删的是默认模板，把第一个设为默认
  if (!templates.some((t) => t.isDefault) && templates.length > 0) {
    templates[0].isDefault = true;
  }
  saveAll(templates);
  return templates;
}

export function setDefaultTemplate(id: string): void {
  const templates = getTemplates().map((t) => ({
    ...t,
    isDefault: t.id === id,
  }));
  saveAll(templates);
}

export function getDefaultTemplate(): SonarTemplate {
  const templates = getTemplates();
  return templates.find((t) => t.isDefault) || templates[0] || BUILT_IN_TEMPLATE;
}

export function resetTemplates(): SonarTemplate[] {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([BUILT_IN_TEMPLATE]));
  return [BUILT_IN_TEMPLATE];
}
