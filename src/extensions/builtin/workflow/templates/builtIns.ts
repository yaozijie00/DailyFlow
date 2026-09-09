import type { WorkflowNodeV2, WorkflowV2, WorkflowVariableDefinition } from "../domain/types";

const CREATED_AT = 1_700_000_000_000;

function node(
  templateId: string,
  index: number,
  type: string,
  title: string,
  config: Record<string, unknown> = {},
): WorkflowNodeV2 {
  return {
    id: `${templateId}.node.${index}`,
    type,
    typeVersion: 1,
    title,
    position: { x: index * 220, y: 0 },
    config,
  };
}

function linearTemplate(input: {
  id: string;
  name: string;
  description: string;
  tags: string[];
  variables: WorkflowVariableDefinition[];
  steps: Array<{ type: string; title: string; config?: Record<string, unknown> }>;
}): WorkflowV2 {
  const nodes = [
    node(input.id, 0, "core.start", "开始"),
    ...input.steps.map((step, index) =>
      node(input.id, index + 1, step.type, step.title, step.config ?? {}),
    ),
    node(input.id, input.steps.length + 1, "core.finish", "完成"),
  ];
  return {
    id: input.id,
    schemaVersion: 2,
    name: input.name,
    description: input.description,
    version: 1,
    variables: input.variables,
    nodes,
    edges: nodes.slice(0, -1).map((current, index) => ({
      id: `${input.id}.edge.${index}`,
      source: current.id,
      target: nodes[index + 1].id,
      sourcePort: "out",
      targetPort: "in",
    })),
    tags: input.tags,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

const projectVariables: WorkflowVariableDefinition[] = [
  { key: "parent_folder", label: "保存位置", type: "folder", required: true, remember: true },
  { key: "project_name", label: "项目名称", type: "text", required: true },
];

export const BUILT_IN_WORKFLOW_TEMPLATES: readonly WorkflowV2[] = [
  linearTemplate({
    id: "builtin.general-project",
    name: "创建通用项目目录",
    description: "一次创建资料、设计、交付和归档等常用项目目录。",
    tags: ["项目", "目录", "通用"],
    variables: projectVariables,
    steps: [{
      type: "files.create-directory-tree",
      title: "创建项目目录结构",
      config: {
        root: "{{parent_folder}}/{{project_name}}",
        entries: ["01_资料", "02_规划", "03_制作", "04_交付", "99_归档"],
      },
    }],
  }),
  linearTemplate({
    id: "builtin.frontend-project",
    name: "创建前端项目资料目录",
    description: "为前端项目建立需求、设计、接口、测试与发布资料目录。",
    tags: ["项目", "前端", "目录"],
    variables: projectVariables,
    steps: [{
      type: "files.create-directory-tree",
      title: "创建前端项目资料",
      config: {
        root: "{{parent_folder}}/{{project_name}}",
        entries: ["docs/requirements", "docs/design", "docs/api", "docs/testing", "docs/release", "assets"],
      },
    }],
  }),
  linearTemplate({
    id: "builtin.design-project",
    name: "创建设计项目目录",
    description: "建立调研、素材、源文件、评审、输出与归档目录。",
    tags: ["项目", "设计", "目录"],
    variables: projectVariables,
    steps: [{
      type: "files.create-directory-tree",
      title: "创建设计目录结构",
      config: {
        root: "{{parent_folder}}/{{project_name}}",
        entries: ["01_调研", "02_素材", "03_源文件", "04_评审", "05_输出", "99_归档"],
      },
    }],
  }),
  linearTemplate({
    id: "builtin.daily-start",
    name: "每日工作启动",
    description: "打开工作目录和常用工作页面，并停在开始确认点。",
    tags: ["每日", "启动", "工作环境"],
    variables: [
      { key: "work_folder", label: "工作目录", type: "folder", required: true, remember: true },
      { key: "dashboard_url", label: "工作主页", type: "text", required: true, remember: true },
    ],
    steps: [
      { type: "system.open-folder", title: "打开工作目录", config: { path: "{{work_folder}}" } },
      { type: "system.open-url", title: "打开工作主页", config: { url: "{{dashboard_url}}" } },
      { type: "core.checkpoint", title: "确认开始工作" },
    ],
  }),
  linearTemplate({
    id: "builtin.daily-review",
    name: "每日复盘与归档",
    description: "按日期创建归档目录和复盘记录，形成稳定的收尾习惯。",
    tags: ["每日", "复盘", "归档"],
    variables: [
      { key: "archive_folder", label: "归档位置", type: "folder", required: true, remember: true },
      { key: "review_date", label: "复盘日期", type: "date", required: true },
      { key: "review_notes", label: "复盘内容", type: "textarea", required: true },
    ],
    steps: [
      {
        type: "files.create-directory-tree",
        title: "创建当日归档目录",
        config: { root: "{{archive_folder}}/{{review_date}}", entries: ["成果", "资料", "待跟进"] },
      },
      {
        type: "files.create-text-file",
        title: "写入复盘记录",
        config: {
          path: "{{archive_folder}}/{{review_date}}/复盘.md",
          content: "# {{review_date}} 复盘\n\n{{review_notes}}\n",
          conflict: "fail",
        },
      },
    ],
  }),
  linearTemplate({
    id: "builtin.fixed-environment",
    name: "打开固定工作环境",
    description: "启动指定应用，同时打开项目目录和工作页面。",
    tags: ["启动", "应用", "工作环境"],
    variables: [
      { key: "application", label: "应用程序", type: "file", required: true, remember: true },
      { key: "work_folder", label: "工作目录", type: "folder", required: true, remember: true },
      { key: "work_url", label: "工作页面", type: "text", required: true, remember: true },
    ],
    steps: [
      { type: "system.launch-app", title: "启动应用", config: { executable: "{{application}}", arguments: [], workingDirectory: "{{work_folder}}" } },
      { type: "system.open-folder", title: "打开工作目录", config: { path: "{{work_folder}}" } },
      { type: "system.open-url", title: "打开工作页面", config: { url: "{{work_url}}" } },
    ],
  }),
];

export function getBuiltInWorkflowTemplates(): WorkflowV2[] {
  return structuredClone([...BUILT_IN_WORKFLOW_TEMPLATES]);
}
