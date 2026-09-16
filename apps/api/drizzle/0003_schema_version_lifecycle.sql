WITH legacy_published_drafts AS (
  SELECT
    draft.id,
    'v' || (
      COALESCE(
        (
          SELECT MAX(SUBSTRING(sibling.version FROM 2)::integer)
          FROM document_schema_versions sibling
          WHERE sibling.schema_id = draft.schema_id
            AND sibling.version ~ '^v[0-9]+$'
        ),
        0
      ) + 1
    )::text AS published_version
  FROM document_schema_versions draft
  WHERE draft.status = 'published'
    AND draft.version = 'draft'
)
UPDATE document_schema_versions version
SET version = legacy.published_version
FROM legacy_published_drafts legacy
WHERE version.id = legacy.id;
