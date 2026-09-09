# Database design & migration strategy

## Schema

### `public.transcriptions`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `user_id` | uuid | owner, references `auth.users` |
| `transcription_type` | text | `live` or `uploaded_file` |
| `text_content` | text | transcript body |
| `audio_url` | text | signed URL for the stored audio (nullable) |
| `storage_path` | text | object path inside the `audio_files` bucket (nullable) |
| `created_at` | timestamptz | insert time |
| `deleted_at` | timestamptz | soft-delete marker; `NULL` means active |

Indexes:
- `idx_transcriptions_user_id` — owner lookups
- `idx_transcriptions_created_at` — global recency ordering
- `idx_transcriptions_user_created` — `(user_id, created_at DESC)` for the history list
- `idx_transcriptions_active` — partial index on active rows (`deleted_at IS NULL`), which is what every app query uses

### `public.audit_log`
Append-only record of who changed what:
`table_name`, `record_id`, `action` (`INSERT` / `UPDATE` / `DELETE` / `SOFT_DELETE`),
`actor_id`, `old_data` (jsonb), `new_data` (jsonb), `created_at`.

Written by the `transcriptions_audit` trigger via the `SECURITY DEFINER`
function `public.record_transcription_audit()`. Clients cannot insert into it;
each user may only read rows where `actor_id = auth.uid()`.

Indexes: `(actor_id, created_at DESC)` and `(table_name, record_id)`.

## Soft deletes

Deleting a transcript sets `deleted_at = now()` instead of removing the row.

- All reads (`/profile`, `GET /api/transcriptions`, `GET /api/transcriptions/:id`)
  filter `deleted_at IS NULL`.
- `DELETE /api/transcriptions/:id` performs the soft delete and returns `204`.
- The associated audio object is removed from the `audio_files` bucket at the
  same time, so storage is not billed for deleted content while the text row
  remains recoverable.
- Recovery is a single statement: `UPDATE public.transcriptions SET deleted_at = NULL WHERE id = '<id>';`
- Optional future purge job: hard-delete rows where
  `deleted_at < now() - interval '30 days'`.

## Row Level Security

- `transcriptions`: users can read, insert, update and delete only rows where
  `auth.uid() = user_id`.
- `audit_log`: read-only for the acting user; writes come from the trigger.
- Storage bucket `audio_files` is private, with per-user folder policies and
  signed URLs.

## Migration strategy

1. **Every schema change is a migration file.** They live in
   `supabase/migrations/` named `<timestamp>_<description>.sql` and are applied
   in timestamp order. No schema changes are made by hand against the database.
2. **Forward-only.** Instead of down-migrations, correct a mistake with a new
   migration. This keeps preview and production convergent.
3. **Additive and backwards compatible.** New columns are nullable or have
   defaults so the currently deployed app keeps working while the migration
   lands.
4. **Expand → migrate → contract** for breaking changes:
   add the new column, backfill and dual-write, ship the code that reads it,
   then drop the old column in a later migration.
5. **Idempotent DDL** (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`)
   so re-running a migration is safe.
6. **Grants and RLS in the same migration as the table.** A new public-schema
   table always ships with its `GRANT`s, `ENABLE ROW LEVEL SECURITY`, and
   policies in one file.
7. **Types regenerate after apply** (`src/integrations/supabase/types.ts`), and
   application code that depends on the new schema changes only afterwards.
8. **Data changes are separate** from schema migrations and are run as explicit
   data statements, never mixed into DDL files.
