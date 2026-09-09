# Drive comments, permissions, and disclosure

Primary sources: https://developers.google.com/workspace/drive/api/guides/manage-comments, https://developers.google.com/drive/api/guides/manage-sharing, https://developers.google.com/drive/api/reference/rest/v3/permissions

## Comments and replies
- Use real fileId, commentId, and replyId from reads or user-provided URLs. Do not invent anchors or quote locations.
- Drive custom anchors are treated as unanchored in Workspace editors; quote exact visible context in the comment body when needed.
- Methods except delete require fields. Ask for only fields needed to verify the thread.
- Resolve comments through the supported reply action. Do not write arbitrary resolved metadata; resolved state is read-only metadata.

## Permissions and disclosure
- Disclose before reading or downloading sensitive content outside already approved scope, and before adding permissions that expose files to people, domains, or links.
- For 403/404, do not broaden grants or switch accounts automatically. Report account/resource/scope possibilities.
- Preserve existing permission IDs and roles unless changing one is the authorized task.

## REST-shaped example after inspecting actual available schema
Example JSON: {"fileId":"1abc...","commentId":"AAA...","fields":"id,resolved,replies(id,action,content,createdTime)"}

## References
- Primary source URLs are listed at the top of this file.
