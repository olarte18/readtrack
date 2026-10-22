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

// test: solo registrar el envío (los tests leen `sent`)
async function sendRegistrationCode(to, code) {
  if (process.env.NODE_ENV === "test") {
    sent.push({ to, code });
    return;
  }

  const target =
    process.env.NODE_ENV === "production" ? to : process.env.DEV_EMAIL || to;
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.log(`[email] Código de registro para ${to}: ${code} (falta BREVO_API_KEY o EMAIL_FROM)`);
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
        subject: "Tu código de verificación de ReadTrack",
        htmlContent:
          `<p>Hola,</p>` +
          `<p>Usa este código para crear tu cuenta en ReadTrack:</p>` +
          `<h1 style="letter-spacing:.4em;font-size:2.2em">${code}</h1>` +
          `<p>Vence en 15 minutos. Si no pediste esta cuenta, ignora este correo.</p>`,
      }),
    });
    if (!res.ok) {
      console.error("[email] Brevo no aceptó el envío:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[email] No se pudo enviar el correo:", e.message);
  }
}

async function sendFeedbackEmail({ to, feedback, userEmail, username }) {
  if (process.env.NODE_ENV === "test") {
    sent.push({ to, feedback, userEmail, username });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Falta BREVO_API_KEY o EMAIL_FROM");

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "ReadTrack", email: from },
      to: [{ email: to }],
      subject: "Nueva sugerencia para ReadTrack",
      textContent: `Sugerencia de ${username} (${userEmail}):\n\n${feedback}`,
      htmlContent: `<p><strong>De:</strong> ${escapeHtml(username)} (${escapeHtml(userEmail)})</p><p>${escapeHtml(feedback).replace(/\n/g, "<br>")}</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Brevo rechazó el correo (${res.status})`);
}

module.exports = { sendPasswordResetCode, sendRegistrationCode, sendFeedbackEmail, sent, clearSent };
