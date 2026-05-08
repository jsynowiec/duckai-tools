# {{title}}

{{#hasMetadataRows}}
| Field | Value |
| --- | --- |
{{#metadataRows}}
| {{key}} | {{value}} |
{{/metadataRows}}

{{/hasMetadataRows}}
{{#messages}}
{{#isUser}}
> [!question] {{userCalloutTitle}}
{{#hasContent}}
{{{contentBlockquote}}}
{{/hasContent}}
 

{{/isUser}}
{{#isAssistant}}
{{#hasAssistantTraceParts}}
{{{assistantTraceGroupBlockquote}}}
{{/hasAssistantTraceParts}}

{{#hasTextParts}}
> [!note] {{assistantCalloutTitle}}
{{#textParts}}
{{{textBlockquote}}}
{{/textParts}}
{{/hasTextParts}}
 
{{/isAssistant}}
{{/messages}}
