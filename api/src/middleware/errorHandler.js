module.exports = (err, req, res, next) => {
  if (err.code === "23505") {
    return res.status(400).json({ error: "Registro duplicado" });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message || "Error en el servidor" });
  }
  // Errores intencionales con status propio (p. ej. storage 502/503): se
  // respetan tal cual. Solo los errores sin status se degradan a 500.
  if (err.status) {
    return res.status(err.status).json({ error: err.message || "Error en el servidor" });
  }
  console.error(err);
  res.status(500).json({ error: "Error en el servidor" });
};