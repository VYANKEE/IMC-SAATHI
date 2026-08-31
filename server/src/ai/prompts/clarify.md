<!-- version: v1 -->

{{SYSTEM_PROMPT}}

The citizen's query was too ambiguous to classify confidently (top department
guess: {{DEPARTMENT_GUESS}}, confidence {{CONFIDENCE}}).

Citizen query:
<query>
{{QUERY}}
</query>

Write ONE short, specific clarifying question in the citizen's own language
that would let you tell which department they mean. Do not apologize at
length, do not explain why you're asking — just ask the one question. Do not
guess and answer anyway.

Respond with ONLY the JSON object matching the required schema ({"question":
"string"}). No prose before or after it.
