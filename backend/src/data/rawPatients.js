// Clinical records are loaded from PostgreSQL. Filesystem traversal is reserved for
// the explicit import command so the production API never reads raw source paths.
export { getPatient } from "../repositories/patientRepository.js";
