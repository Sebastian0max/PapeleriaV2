import { z } from "zod";
import { reportError } from "./sentry.js";

const FIELD_LABELS = {
  productoId: "el producto",
  cantidad: "la cantidad",
  usuario: "el usuario",
  password: "la contraseña",
  nombre: "el nombre",
  precio: "el precio",
  costo: "el costo",
  stock_minimo: "el stock mínimo",
  codigo: "el código",
  sku: "el sku",
  rol: "el rol",
  transaccionId: "la transacción",
};

function labelFor(issue) {
  const key = Array.isArray(issue.path) ? issue.path[0] : undefined;
  if (key == null || key === "") return "Los datos enviados";
  return FIELD_LABELS[key] || `El campo "${key}"`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function issueFriendly(issue) {
  const label = capitalize(labelFor(issue));
  switch (issue.code) {
    case "invalid_type":
      if (issue.received === "null" || issue.received === "undefined") return `${label} es obligatorio/a.`;
      if (issue.expected === "string") return `${label} debe ser texto.`;
      if (issue.expected === "number" || issue.expected === "integer") return `${label} debe ser un número.`;
      return `${label} tiene un valor inválido.`;
    case "too_small":
      if (issue.type === "string") return `${label} debe tener al menos ${issue.minimum} caracteres.`;
      if (issue.type === "number") return `${label} debe ser mayor o igual a ${issue.minimum}.`;
      return `${label} no cumple el valor mínimo permitido.`;
    case "too_big":
      if (issue.type === "string") return `${label} no debe superar los ${issue.maximum} caracteres.`;
      if (issue.type === "number") return `${label} no debe superar ${issue.maximum}.`;
      return `${label} supera el valor máximo permitido.`;
    case "int":
      return `${label} debe ser un número entero.`;
    case "positive":
      return `${label} debe ser mayor que cero.`;
    default:
      return issue.message ? `${label}: ${issue.message}` : `${label} no es válido/a.`;
  }
}

function formatZodError(error) {
  const issues = error.issues || [];
  if (!issues.length) return "Los datos enviados no son válidos.";
  const first = issues[0];
  if (first.path && first.path[0] === "productoId") {
    return "Debes seleccionar un producto para registrar la venta.";
  }
  if (first.path && first.path[0] === "cantidad") {
    if (first.code === "too_small") return "La cantidad debe ser mayor a cero.";
    if (first.code === "invalid_type") return "La cantidad debe ser un número válido.";
  }
  return issues.map(issueFriendly).join(" ");
}

export function registerErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ message: formatZodError(error) });
    }
    if (error.validation) {
      return reply.code(400).send({ message: "Los datos enviados no son válidos." });
    }
    const status = error.statusCode || 500;
    if (status >= 500) {
      request.log.error(error);
      reportError(error, request);
      return reply.code(500).send({ message: "Error interno del servidor." });
    }
    return reply.code(status).send({ message: error.message || "Error" });
  });
}