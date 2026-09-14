export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function assertAllowed(value, allowed, message) {
  if (!allowed.includes(value)) httpError(400, message);
  return value;
}

export function wrapRoute(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === "function") result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}
