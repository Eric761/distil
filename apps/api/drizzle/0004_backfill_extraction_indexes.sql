UPDATE extraction_fields
SET value_text = LEFT(
  COALESCE(corrected_value #>> '{}', extracted_value #>> '{}'),
  8000
)
WHERE value_text IS NULL
  AND node_kind = 'scalar'
  AND COALESCE(corrected_value #>> '{}', extracted_value #>> '{}') IS NOT NULL;

UPDATE extraction_fields
SET value_numeric = value_text::numeric
WHERE value_numeric IS NULL
  AND type IN ('decimal', 'integer')
  AND value_text ~ '^-?[0-9]+([.][0-9]+)?$';

UPDATE extraction_fields
SET value_date = LEFT(value_text, 10)
WHERE value_date IS NULL
  AND type IN ('date', 'datetime')
  AND value_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

UPDATE extraction_fields
SET value_boolean = CASE
  WHEN LOWER(value_text) IN ('true', 'yes') THEN true
  WHEN LOWER(value_text) IN ('false', 'no') THEN false
  ELSE NULL
END
WHERE value_boolean IS NULL
  AND type = 'boolean';
