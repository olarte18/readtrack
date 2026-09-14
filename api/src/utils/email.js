const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const sent = [];

const clearSent = () => {
  sent.length = 0;
};

// test: solo registrar el envío (los tests leen `sent`)
async function sendPasswordResetCode(to, code) {
  if (process.env.NODE_ENV === "test") {
    sent.push({ to, code });
    return;
  }

  const target =
    process.env.NODE_ENV === "production" ? to : process.env.DEV_EMAIL || to;
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.log(`[email] Código de recuperación para ${to}: ${code} (falta BREVO_API_KEY o EMAIL_FROM)`);
    return;
  }

  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "ReadTrack", email: from },
        to: [{ email: target }],
        subject: "Recupera tu contraseña de ReadTrack",
        htmlContent:
          `<p>Hola,</p>` +
          `<p>Usa este código para cambiar tu contraseña de ReadTrack:</p>` +
          `<h1 style="letter-spacing:.4em;font-size:2.2em">${code}</h1>` +
          `<p>Vence en 15 minutos. Si no lo pediste, ignora este correo.</p>`,
      }),
    });
    if (!res.ok) {
      console.error("[email] Brevo no aceptó el envío:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[email] No se pudo enviar el correo:", e.message);
  }
}

module.exports = { sendPasswordResetCode, sent, clearSent };