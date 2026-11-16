# Admin AI configuration

All live model calls use the configuration at
`https://admin.bhwa233.com/zh/admin/ai`, served by SparkHub's authenticated
`/api/linkdisk/dashboard/ai/runtime` endpoint. Blog text, Reddit, podcast
transcription and podcast articles have separate bindings on that page.

Workflows fetch one snapshot before generating content and log its revision.
The Reddit chain passes `ai_revision` to all children. A manual run can replay an
existing revision; it cannot override individual models. Configuration fetch
failures stop generation. Existing `AI_MODEL`, base URL and fallback environment
variables no longer control live calls.

For local live generation, supply `SPARKHUB_DASHBOARD_TOKEN` and the credential
named by the selected provider, then preload the snapshot:

```sh
node --import tsx --import ./scripts/load_ai_config.ts scripts/generate_scheduled_post.ts --ai --task tech-daily
```

Set `AI_CONFIG_REVISION` to replay a version. Without it, the preload fetches the
latest version once. `AI_CONFIG_SCOPE=reddit` selects the Reddit binding; Reddit
CLI entrypoints and `--task reddit-top20` also select it automatically. The JSON
snapshot contains no API keys. Credentials remain in local env or Actions secrets;
changing a credential reference in Admin requires that secret in this runtime.

The lower-level explicit client config remains available for offline tests.
Mock-response generation does not require a live Admin connection.

Deploy SparkHub's API/Admin and initialize its configuration before publishing
these workflow changes. Existing revision numbers remain valid across updates.
