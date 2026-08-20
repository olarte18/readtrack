module.exports = (err, req, res, next) => {
  if (err.code === "23505") {
    return res.status(400).json({ error: "Registro duplicado" });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message || "Error en el servidor" });
  }
  console.error(err);
  res.status(500).json({ error: "Error en el servidor" });
};