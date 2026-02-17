# API Conventions

## Endpoint Patterns

All API routes are registered in `server/routes.ts` and prefixed with `/api/`.

| Pattern | Convention |
|---------|-----------|
| `GET /api/{resource}` | List with query filters (`?town=X&limit=100`) |
| `GET /api/{resource}/:id` | Get single resource |
| `POST /api/admin/{action}` | Admin-only mutation |
| `DELETE /api/admin/{resource}/:id` | Admin-only deletion |

## Response Formats

- List endpoints return `{ updatedAt, total, <items> }` where `<items>` is a named array (e.g., `outages`, `rankings`)
- GeoJSON endpoints return `{ updatedAt, features: { type: "FeatureCollection", features: [...] } }`
- Mutation endpoints return `{ success: true, ... }` on success
- Errors return `{ error: "message" }` with appropriate HTTP status

## Query Parameters

- `limit` and `offset` for pagination (default limit: 100)
- `hours` for time-window filtering (default: 24)
- Filter parameters use exact match unless documented as ILIKE (town, street)
- Date parameters accept ISO 8601 strings

## Error Handling

- Wrap all route handlers in try/catch
- Log errors with `console.error("Context:", error)`
- Return 400 for bad input, 404 for not found, 500 for server errors
- Never expose stack traces to the client

## Adding New Endpoints

1. Add the route in `server/routes.ts` in the appropriate section
2. Add any new storage methods in `server/storage.ts`
3. Add any new schema fields in `shared/schema.ts` (run `npm run db:push` after)
4. Update the frontend API call using `apiFetch()` from `client/src/lib/api.ts`
