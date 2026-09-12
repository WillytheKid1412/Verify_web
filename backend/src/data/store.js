// Verification persistence now lives in PostgreSQL and is keyed by retrieval pair UUID.
export { getReview as getVerification, saveReview as setVerification } from "../repositories/reviewRepository.js";
