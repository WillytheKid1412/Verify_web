// Compatibility facade while route imports are migrated to repositories.
export {
  authenticate,
  createInitialAdmin,
  createSession,
  createUser,
  deleteSession,
  getSession,
  listUsers,
  normalizeUsername,
  recordLoginEvent,
} from "../repositories/authRepository.js";
