import { Errors } from "./errors.js";

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(Errors.validation(result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(Errors.validation(result.error.flatten()));
    }
    req.validatedQuery = result.data;
    next();
  };
}
