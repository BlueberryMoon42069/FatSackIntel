# Data Model Rules

## Schema (shared/schema.ts)

This is the single source of truth for all database types. Every table definition lives here.

### Type Exports

- `InsertX` types are for creating records (omit `id` and timestamps)
- `X` types (e.g., `Outage`, `HistoricalOutage`) are the full row types
- Always import from `@shared/schema`, never define duplicate types

### Key Constraints

- All IDs are UUID strings via `gen_random_uuid()`
- Town names are stored UPPERCASE in `historical_outages` (matches DPU filing format)
- Social signal urgency is normalized 0-1 (not 0-5)
- Solar scores are 0-100 in `solar_data` but 0-1 in `location_scores`
- The `outages.geometry` column stores raw GeoJSON (Point or Polygon)

## Storage Layer (server/storage.ts)

### Query Patterns

- Always apply WHERE conditions BEFORE LIMIT/OFFSET (use `buildHistoricalConditions` pattern)
- Use `and(...conditions)` from drizzle-orm for compound filters
- Case-insensitive search uses `LOWER()` with LIKE
- For count queries, use a separate `getXCount()` method — never derive total from page size

### Adding New Methods

1. Add the method signature to `IStorage` interface
2. Implement in `DatabaseStorage` class
3. Use the `db` instance and `schema` imports

## Indexes

Compound indexes exist for common query patterns:
- `outages`: `(status, reported_at)` for active outage queries
- `social_signals`: `(town, timestamp)` for town-scoped time-window queries
- `historical_outages`: `(utility, year)` and `(town, year)` for filtered aggregations

When adding new query patterns that filter on 2+ columns, add a compound index.

## Migrations

After changing `shared/schema.ts`, run:
```bash
npm run db:push
```
This applies schema changes directly (no migration files in production).
