require("dotenv").config();

const { hashPassword, PASSWORD_MIN_LENGTH, validEmail } = require("../auth-utils");
const db = require("../database");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

if (!validEmail(email)) {
  console.error("Defina ADMIN_EMAIL com um endereço de e-mail válido no arquivo .env.");
  process.exitCode = 1;
} else if (password.length < PASSWORD_MIN_LENGTH) {
  console.error(`Defina ADMIN_PASSWORD com pelo menos ${PASSWORD_MIN_LENGTH} caracteres no arquivo .env.`);
  process.exitCode = 1;
} else {
  const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existingAdmin) {
    console.error("Já existe uma conta administradora. Não foi feita nenhuma alteração.");
    process.exitCode = 1;
  } else {
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (@name, @email, @passwordHash, 'admin')
    `).run({
      name: "Fabio Vicente Bezerra",
      email,
      passwordHash: hashPassword(password)
    });
    console.log(`Conta administradora criada para ${email}. Guarde a senha com segurança e remova ADMIN_PASSWORD do .env.`);
  }
}

db.close();
