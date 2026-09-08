import { setupServer } from "msw/node";

/** Shared MSW server. Tests register handlers via `server.use(...)`. */
export const server = setupServer();
