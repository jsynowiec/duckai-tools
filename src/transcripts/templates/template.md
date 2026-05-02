---
title: "{{title}}"
model: "{{model}}"
chatId: "{{chatId}}"
createdAt: "{{firstMessageCreatedAt}}"
lastEdit: "{{lastEdit}}"
pinned: {{pinned}}
messageCount: {{messageCount}}
---

# {{title}}

{{#messages}}
{{#isUser}}

> [!question] User
> {{content}}
>
> *{{createdAt}}*

{{/isUser}}
{{#isAssistant}}

> [!note] Assistant ({{model}})
{{#parts}}
{{#isText}}
> {{text}}
{{/isText}}
{{#isReasoning}}

> [!info] Reasoning{{#reasoningDurationMs}} — {{reasoningDurationMs}}ms{{/reasoningDurationMs}}
> {{#summaryText}}
> {{.}}
> {{/summaryText}}

{{/isReasoning}}
{{#isToolInvocation}}

> [!tip] Tool: `{{toolName}}`
> **Arguments:** `{{toolArguments}}`
{{#result}}
>
> **Result:** {{result}}
{{/result}}

{{/isToolInvocation}}
{{#isSource}}

> [!cite] Source: [{{title}}]({{url}})
> {{site}}

{{/isSource}}
{{/parts}}
>
> *{{createdAt}}*

{{/isAssistant}}
{{/messages}}
