# Installation guide

The authoritative commands are in the root README.md, including Windows/WSL considerations, MongoDB startup and replica-set initialization.

1. Install Node.js 24, npm, MongoDB Community Server and mongosh in the same environment.
2. Clone the repository; run `npm ci`, `npm run setup`, `npm run build`.
3. Start a local `mongod` with `--replSet rs0` and a dedicated data directory, bound to `127.0.0.1`.
4. Initialize that replica set once and wait for `db.hello().isWritablePrimary` to be true.
5. Check `.env` contains the correct local replica-set URI and generated secret.
6. Run `npm run seed` against an empty development database.
7. Run `npm run dev`; visit `http://localhost:3000`.
8. Use separate browser profiles for customer and seller to demonstrate live notifications.

## Troubleshooting

- **Connection refused:** MongoDB is not running in the same environment/port as the URI.
- **Replica set required / transaction error:** standalone MongoDB cannot safely execute the checkout transaction. Follow initialization instructions.
- **No CSS:** run `npm run build` before starting. Built assets are not committed.
- **CSRF error:** refresh the page after login/session rotation; all write requests need the current token.
- **Seed refuses:** it protects existing records. Choose a new development database rather than deleting work blindly.
- **Cookie/login issue:** use `NODE_ENV=development` for HTTP localhost; production cookies require HTTPS.
- **Socket rejected:** use the same origin as `APP_BASE_URL`; confirm your account is active and session is current.
- **Test MongoDB binary fails:** use a compatible unrestricted development host. The integration suite downloads a real binary; it is not a database mock.
- **Pending seller/listing:** approve the seller and listing from the admin account before shopping.

Do not point destructive development experiments or test utilities at a production database. The shipped test suite uses a new disposable database.
